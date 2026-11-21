import base64
import hashlib
import hmac
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DRIVE_READONLY_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
DRIVE_FILE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{10,128}$")
SHA256_HEX_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")
CHECKPOINT_FILENAME = "resnet50_brain_tumor.pth"
CHUNK_SIZE_BYTES = 8 * 1024 * 1024  # 8 MB streaming chunks


class ModelDownloadError(RuntimeError):
    """Raised when downloading or verifying the ResNet50 checkpoint fails."""

    def __init__(self, error_code: str, message: str):
        super().__init__(message)
        self.error_code = error_code
        self.message = message


def validate_drive_file_id(file_id: str) -> str:
    cleaned = (file_id or "").strip()
    if not cleaned or not DRIVE_FILE_ID_PATTERN.fullmatch(cleaned):
        raise ModelDownloadError(
            "INVALID_DRIVE_FILE_ID",
            "GOOGLE_DRIVE_FILE_ID is missing or has an invalid format.",
        )
    return cleaned


def normalize_expected_sha256(expected_sha256: str) -> str:
    cleaned = (expected_sha256 or "").strip().lower()
    if not cleaned:
        return ""
    if not SHA256_HEX_PATTERN.fullmatch(cleaned):
        raise ModelDownloadError(
            "INVALID_EXPECTED_CHECKSUM",
            "MODEL_EXPECTED_SHA256 must be a valid 64-character hexadecimal SHA-256 digest.",
        )
    return cleaned


def compute_sha256(file_path: Path) -> str:
    hasher = hashlib.sha256()
    with file_path.open("rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def _safe_target_paths(models_dir: Optional[Path] = None) -> tuple[Path, Path]:
    base = (models_dir or settings.classification_models_path).resolve()
    base.mkdir(parents=True, exist_ok=True)
    target = (base / CHECKPOINT_FILENAME).resolve()
    tmp = (base / f"{CHECKPOINT_FILENAME}.tmp").resolve()
    if target.parent != base or tmp.parent != base:
        raise ModelDownloadError(
            "INVALID_MODEL_PATH",
            "Checkpoint destination escapes classification models directory.",
        )
    return target, tmp


def _validate_checkpoint_binary_header(file_path: Path) -> None:
    with file_path.open("rb") as fh:
        header = fh.read(64)
    if not header:
        raise ModelDownloadError("EMPTY_CHECKPOINT", "Checkpoint file is empty (0 bytes).")

    header_lower = header.lstrip().lower()
    if (
        header_lower.startswith(b"<!doctype")
        or header_lower.startswith(b"<html")
        or header_lower.startswith(b"{")
    ):
        raise ModelDownloadError(
            "INVALID_CHECKPOINT_CONTENT",
            "Downloaded file appears to be an HTML/JSON response rather than a PyTorch .pth checkpoint. "
            "Verify Google Drive sharing permissions and credentials.",
        )

    # PyTorch checkpoints are either ZIP archives (PK\x03\x04, PyTorch >=1.6 default)
    # or legacy pickle streams (\x80\x02..\x80\x05) or tar archives.
    is_zip = header.startswith(b"PK\x03\x04")
    is_pickle = len(header) >= 2 and header[0] == 0x80 and header[1] in (2, 3, 4, 5)
    if not (is_zip or is_pickle):
        raise ModelDownloadError(
            "INVALID_CHECKPOINT_FORMAT",
            "Downloaded file header does not match a valid PyTorch checkpoint (.pth).",
        )


def verify_checkpoint_file(
    file_path: Path,
    *,
    expected_sha256: str = "",
    min_size_bytes: Optional[int] = None,
    max_size_bytes: Optional[int] = None,
    check_magic_header: bool = True,
) -> Dict[str, Any]:
    if not file_path.is_file():
        raise ModelDownloadError("CHECKPOINT_MISSING", f"Checkpoint file not found at {file_path}.")

    size_bytes = file_path.stat().st_size
    if size_bytes <= 0:
        raise ModelDownloadError("EMPTY_CHECKPOINT", "Checkpoint file is empty (0 bytes).")

    min_allowed = settings.MODEL_MIN_SIZE_BYTES if min_size_bytes is None else min_size_bytes
    max_allowed = settings.MODEL_MAX_SIZE_BYTES if max_size_bytes is None else max_size_bytes

    if min_allowed > 0 and size_bytes < min_allowed:
        raise ModelDownloadError(
            "CHECKPOINT_TOO_SMALL",
            f"Checkpoint size ({size_bytes:,} bytes) is smaller than MODEL_MIN_SIZE_BYTES ({min_allowed:,} bytes).",
        )
    if max_allowed > 0 and size_bytes > max_allowed:
        raise ModelDownloadError(
            "CHECKPOINT_TOO_LARGE",
            f"Checkpoint size ({size_bytes:,} bytes) exceeds MODEL_MAX_SIZE_BYTES ({max_allowed:,} bytes).",
        )

    if check_magic_header:
        _validate_checkpoint_binary_header(file_path)

    actual_sha256 = compute_sha256(file_path)
    expected_norm = normalize_expected_sha256(expected_sha256)
    checksum_verified = False

    if expected_norm:
        if not hmac.compare_digest(actual_sha256.lower(), expected_norm):
            raise ModelDownloadError(
                "CHECKSUM_MISMATCH",
                f"SHA-256 mismatch for {file_path.name}. "
                f"Expected {expected_norm}, got {actual_sha256}.",
            )
        checksum_verified = True

    return {
        "path": str(file_path),
        "size_bytes": size_bytes,
        "size_mb": round(size_bytes / (1024 * 1024), 2),
        "sha256": actual_sha256,
        "checksum_verified": checksum_verified,
    }


def _load_service_account_info(credentials_json: str, credentials_path: str) -> Optional[Dict[str, Any]]:
    raw = (credentials_json or "").strip()
    if raw:
        try:
            if not raw.startswith("{"):
                decoded = base64.b64decode(raw).decode("utf-8")
                return json.loads(decoded)
            return json.loads(raw)
        except Exception as exc:
            raise ModelDownloadError(
                "INVALID_CREDENTIALS",
                f"Failed to parse GOOGLE_DRIVE_CREDENTIALS_JSON: {exc}",
            ) from exc

    cred_path_str = (credentials_path or "").strip()
    if cred_path_str:
        cred_path = Path(cred_path_str).expanduser().resolve()
        if not cred_path.is_file():
            raise ModelDownloadError(
                "CREDENTIALS_FILE_NOT_FOUND",
                f"GOOGLE_DRIVE_CREDENTIALS_PATH does not exist: {cred_path}",
            )
        try:
            return json.loads(cred_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise ModelDownloadError(
                "INVALID_CREDENTIALS",
                f"Failed to read Google Service Account JSON file: {exc}",
            ) from exc

    return None


def _download_via_google_api_client(
    file_id: str,
    service_account_info: Dict[str, Any],
    tmp_path: Path,
    max_size_bytes: int,
) -> None:
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseDownload
    except ImportError as exc:
        raise ModelDownloadError(
            "GOOGLE_DRIVE_CLIENT_NOT_INSTALLED",
            "google-api-python-client and google-auth are required for Service Account downloads. "
            "Install them with: pip install google-api-python-client google-auth",
        ) from exc

    credentials = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=DRIVE_READONLY_SCOPES,
    )
    service = build("drive", "v3", credentials=credentials, cache_discovery=False)

    # Check Drive file metadata first (size & name) before streaming large payload
    try:
        meta = (
            service.files()
            .get(fileId=file_id, fields="id,name,size,mimeType", supportsAllDrives=True)
            .execute()
        )
    except Exception as exc:
        raise ModelDownloadError(
            "DRIVE_METADATA_FAILED",
            f"Unable to access Google Drive file '{file_id}'. Ensure the Service Account has Viewer access: {exc}",
        ) from exc

    remote_size = int(meta["size"]) if meta.get("size") else 0
    if remote_size > max_size_bytes > 0:
        raise ModelDownloadError(
            "CHECKPOINT_TOO_LARGE",
            f"Remote Drive file ({remote_size:,} bytes) exceeds MODEL_MAX_SIZE_BYTES ({max_size_bytes:,} bytes).",
        )

    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
    bytes_written = 0
    with tmp_path.open("wb") as fh:
        downloader = MediaIoBaseDownload(fh, request, chunksize=CHUNK_SIZE_BYTES)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            bytes_written = fh.tell()
            if max_size_bytes > 0 and bytes_written > max_size_bytes:
                raise ModelDownloadError(
                    "CHECKPOINT_TOO_LARGE",
                    f"Download aborted: exceeded MODEL_MAX_SIZE_BYTES ({max_size_bytes:,} bytes).",
                )
            if status is not None:
                logger.info(
                    "Downloading ResNet50 checkpoint: %.1f%% (%d bytes)",
                    status.progress() * 100.0,
                    bytes_written,
                )


def _download_via_oauth_token(
    file_id: str,
    access_token: str,
    tmp_path: Path,
    max_size_bytes: int,
) -> None:
    # Hardcoded Google Drive v3 API host (prevents arbitrary URL redirects/SSRF)
    url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
    headers = {"Authorization": f"Bearer {access_token.strip()}"}
    params = {"alt": "media", "supportsAllDrives": "true"}

    bytes_written = 0
    with httpx.Client(timeout=httpx.Timeout(connect=20.0, read=120.0, write=30.0, pool=20.0)) as client:
        with client.stream("GET", url, headers=headers, params=params, follow_redirects=False) as response:
            if response.status_code != 200:
                raise ModelDownloadError(
                    "DRIVE_DOWNLOAD_HTTP_ERROR",
                    f"Google Drive API returned HTTP {response.status_code}. "
                    "Verify GOOGLE_DRIVE_FILE_ID and GOOGLE_DRIVE_ACCESS_TOKEN permissions.",
                )
            with tmp_path.open("wb") as fh:
                for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    bytes_written += len(chunk)
                    if max_size_bytes > 0 and bytes_written > max_size_bytes:
                        raise ModelDownloadError(
                            "CHECKPOINT_TOO_LARGE",
                            f"Download aborted: exceeded MODEL_MAX_SIZE_BYTES ({max_size_bytes:,} bytes).",
                        )
                    fh.write(chunk)


def download_checkpoint_from_gdrive(
    *,
    file_id: Optional[str] = None,
    credentials_json: Optional[str] = None,
    credentials_path: Optional[str] = None,
    access_token: Optional[str] = None,
    expected_sha256: Optional[str] = None,
    min_size_bytes: Optional[int] = None,
    max_size_bytes: Optional[int] = None,
    models_dir: Optional[Path] = None,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Download the original ResNet50 checkpoint once from Google Drive into
    backend/app/models/classification/resnet50_brain_tumor.pth using authenticated
    Google Drive API credentials from environment variables.

    Never creates a dummy checkpoint, never modifies JSON metadata files, and
    atomically cleans up temporary files on any failure.
    """
    target_path, tmp_path = _safe_target_paths(models_dir)
    exp_sha = settings.MODEL_EXPECTED_SHA256 if expected_sha256 is None else expected_sha256
    min_sz = settings.MODEL_MIN_SIZE_BYTES if min_size_bytes is None else min_size_bytes
    max_sz = settings.MODEL_MAX_SIZE_BYTES if max_size_bytes is None else max_size_bytes

    # Download only once: if a verified checkpoint already exists, skip re-downloading
    if not force and target_path.is_file():
        try:
            existing = verify_checkpoint_file(
                target_path,
                expected_sha256=exp_sha,
                min_size_bytes=min_sz,
                max_size_bytes=max_sz,
            )
            logger.info(
                "ResNet50 checkpoint already present and verified (%s MB, sha256=%s...); skipping download.",
                existing["size_mb"],
                existing["sha256"][:16],
            )
            return {"status": "already_present", "downloaded": False, **existing}
        except ModelDownloadError as exc:
            logger.warning(
                "Existing checkpoint failed verification (%s); re-downloading from Google Drive.",
                exc.error_code,
            )

    validated_id = validate_drive_file_id(
        settings.GOOGLE_DRIVE_FILE_ID if file_id is None else file_id
    )
    cred_json = settings.GOOGLE_DRIVE_CREDENTIALS_JSON if credentials_json is None else credentials_json
    cred_path = settings.GOOGLE_DRIVE_CREDENTIALS_PATH if credentials_path is None else credentials_path
    token = settings.GOOGLE_DRIVE_ACCESS_TOKEN if access_token is None else access_token

    sa_info = _load_service_account_info(cred_json, cred_path)
    has_token = bool((token or "").strip())

    if sa_info is None and not has_token:
        raise ModelDownloadError(
            "DRIVE_CREDENTIALS_MISSING",
            "No Google Drive credentials configured. Set GOOGLE_DRIVE_CREDENTIALS_PATH, "
            "GOOGLE_DRIVE_CREDENTIALS_JSON, or GOOGLE_DRIVE_ACCESS_TOKEN in the backend environment.",
        )

    # Clean up any stale temporary download file before starting
    if tmp_path.exists():
        tmp_path.unlink(missing_ok=True)

    try:
        if sa_info is not None:
            _download_via_google_api_client(validated_id, sa_info, tmp_path, max_sz)
        else:
            _download_via_oauth_token(validated_id, token, tmp_path, max_sz)

        verification = verify_checkpoint_file(
            tmp_path,
            expected_sha256=exp_sha,
            min_size_bytes=min_sz,
            max_size_bytes=max_sz,
        )

        # Atomic move into final destination only after full verification passes
        os.replace(tmp_path, target_path)
        verification["path"] = str(target_path)
        logger.info(
            "Successfully downloaded and verified ResNet50 checkpoint (%s MB, sha256=%s).",
            verification["size_mb"],
            verification["sha256"],
        )
        return {"status": "downloaded", "downloaded": True, **verification}
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
