import csv
import io
import json
from datetime import datetime, timezone
from typing import List

from fastapi import HTTPException
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image as RLImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app.database.models import ExperimentRecord, ImageRecord, ReportRecord, SVDResultRecord
from app.schemas.schemas import ReportGenerateRequest, ReportResponse
from app.utils.file_utils import generate_unique_id, resolve_storage_path


def _to_report_response(rec: ReportRecord) -> ReportResponse:
    return ReportResponse(
        id=rec.id,
        title=rec.title,
        report_type=rec.report_type,
        format=rec.format,
        experiment_ids=json.loads(rec.experiment_ids_json),
        file_size=rec.file_size,
        download_url=f"/api/reports/{rec.id}/download",
        created_at=rec.created_at,
    )


def generate_report(db: Session, req: ReportGenerateRequest) -> ReportResponse:
    if req.experiment_ids:
        experiments = (
            db.query(ExperimentRecord)
            .filter(ExperimentRecord.id.in_(req.experiment_ids))
            .order_by(ExperimentRecord.created_at.desc())
            .all()
        )
    else:
        experiments = db.query(ExperimentRecord).order_by(ExperimentRecord.created_at.desc()).limit(25).all()

    report_id = generate_unique_id("rep")
    ext = "csv" if req.format == "csv" else "pdf"
    rel_path = f"reports/{report_id}.{ext}"
    dest_path = resolve_storage_path(rel_path)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    used_exp_ids = [e.id for e in experiments]

    if req.format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "experiment_id",
            "name",
            "dataset_name",
            "primary_method",
            "selected_methods",
            "svd_rank",
            "status",
            "created_at",
            "metrics_json",
            "notes",
        ])
        for exp in experiments:
            writer.writerow([
                exp.id,
                exp.name,
                exp.dataset_name,
                exp.primary_method,
                exp.selected_methods_json,
                exp.svd_rank if exp.svd_rank is not None else "",
                exp.status,
                exp.created_at.isoformat(),
                exp.metrics_json,
                exp.notes or "",
            ])
        raw_bytes = buf.getvalue().encode("utf-8")
        dest_path.write_bytes(raw_bytes)
    else:
        raw_bytes = _build_pdf_bytes(db, req, experiments)
        dest_path.write_bytes(raw_bytes)

    rec = ReportRecord(
        id=report_id,
        title=req.title,
        report_type=req.report_type,
        format=req.format,
        experiment_ids_json=json.dumps(used_exp_ids),
        relative_path=rel_path,
        file_size=len(raw_bytes),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return _to_report_response(rec)


def _build_pdf_bytes(db: Session, req: ReportGenerateRequest, experiments: List[ExperimentRecord]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ImageLabTitle",
        parent=styles["Heading1"],
        fontSize=18,
        textColor=colors.HexColor("#172B3A"),
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "ImageLabSub",
        parent=styles["Normal"],
        fontSize=9.5,
        textColor=colors.HexColor("#667788"),
        spaceAfter=12,
    )
    section_style = ParagraphStyle(
        "ImageLabSection",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#315F83"),
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "ImageLabBody",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#172B3A"),
    )

    story = []
    story.append(Paragraph("ImageLab — Scientific Analysis Report", title_style))
    story.append(Paragraph(req.title, styles["Heading3"]))
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    story.append(
        Paragraph(
            f"Report Type: {req.report_type.upper()} | Author: {req.author} | Generated: {generated_at}",
            subtitle_style,
        )
    )
    story.append(
        Paragraph(
            "<b>Scientific Scope Notice:</b> Mathematical feature extraction, PCA, and SVD results reflect "
            "deterministic computations performed on uploaded imagery. PCA and SVD are not independent clinical "
            "diagnostic models. Any deep-learning medical predictions are strictly for research and educational use.",
            body_style,
        )
    )
    story.append(Spacer(1, 10))

    if req.notes:
        story.append(Paragraph("Research Notes", section_style))
        story.append(Paragraph(req.notes, body_style))
        story.append(Spacer(1, 8))

    # Experiment summary table
    story.append(Paragraph(f"Recorded Experiments ({len(experiments)})", section_style))
    if not experiments:
        story.append(
            Paragraph(
                "No saved experiments were matched for this report. Run and save an analysis experiment first.",
                body_style,
            )
        )
    else:
        table_data = [["ID", "Experiment Name", "Method", "Dataset", "Key Metrics", "Status"]]
        for exp in experiments:
            metrics = json.loads(exp.metrics_json) if exp.metrics_json else {}
            metric_parts = []
            for k, v in list(metrics.items())[:4]:
                metric_parts.append(f"{k}: {v}")
            metric_str = ", ".join(metric_parts) if metric_parts else "—"
            table_data.append([
                exp.id[:12],
                exp.name[:28],
                exp.primary_method,
                exp.dataset_name[:22],
                metric_str[:46],
                exp.status,
            ])

        tbl = Table(table_data, colWidths=[0.95 * inch, 1.55 * inch, 0.9 * inch, 1.2 * inch, 1.8 * inch, 0.75 * inch])
        tbl.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#315F83")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D0DCE6")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6F8FB")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("PADDING", (0, 0), (-1, -1), 5),
            ])
        )
        story.append(tbl)
        story.append(Spacer(1, 12))

        if req.include_charts:
            # Attach real stored SVD / input image artifacts for the first matching experiment if available
            first_exp = experiments[0]
            img_ids = json.loads(first_exp.input_image_ids_json) if first_exp.input_image_ids_json else []
            if img_ids:
                img_rec = db.query(ImageRecord).filter(ImageRecord.id == img_ids[0]).first()
                svd_rec = (
                    db.query(SVDResultRecord)
                    .filter(SVDResultRecord.image_id == img_ids[0])
                    .order_by(SVDResultRecord.created_at.desc())
                    .first()
                )
                panels = []
                if img_rec:
                    p = resolve_storage_path(img_rec.relative_path)
                    if p.exists():
                        panels.append(("Input Image", str(p)))
                if svd_rec and svd_rec.last_reconstructed_path:
                    p = resolve_storage_path(svd_rec.last_reconstructed_path)
                    if p.exists():
                        panels.append((f"SVD Rank-{svd_rec.last_rank}", str(p)))
                if svd_rec and svd_rec.last_difference_path:
                    p = resolve_storage_path(svd_rec.last_difference_path)
                    if p.exists():
                        panels.append(("Residual Error Map", str(p)))

                if panels:
                    story.append(Paragraph("Stored Visual Artifacts", section_style))
                    row_imgs = []
                    row_caps = []
                    for cap, path_str in panels[:3]:
                        try:
                            row_imgs.append(RLImage(path_str, width=2.1 * inch, height=2.1 * inch, kind="proportional"))
                            row_caps.append(Paragraph(cap, subtitle_style))
                        except Exception:
                            pass
                    if row_imgs:
                        img_tbl = Table([row_imgs, row_caps], colWidths=[2.3 * inch] * len(row_imgs))
                        story.append(img_tbl)

    doc.build(story)
    return buf.getvalue()


def list_reports(db: Session) -> List[ReportResponse]:
    rows = db.query(ReportRecord).order_by(ReportRecord.created_at.desc()).all()
    return [_to_report_response(r) for r in rows]


def get_report_file(db: Session, report_id: str) -> tuple[ReportRecord, bytes, str]:
    rec = db.query(ReportRecord).filter(ReportRecord.id == report_id).first()
    if not rec:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "REPORT_NOT_FOUND", "message": f"Report '{report_id}' was not found."},
        )
    path = resolve_storage_path(rec.relative_path)
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail={"error_code": "REPORT_FILE_MISSING", "message": "Generated report file is missing on disk."},
        )
    media_type = "text/csv" if rec.format == "csv" else "application/pdf"
    return rec, path.read_bytes(), media_type
