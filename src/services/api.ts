import {
  BackendImage,
  ComparisonResponse,
  ExperimentCreateRequest,
  ExperimentRecord,
  FeatureExtractRequest,
  FeatureExtractResponse,
  HealthStatus,
  JobResponse,
  MedicalClassificationResult,
  MedicalStatusResponse,
  PCAFitRequest,
  PCAFitResponse,
  PCAStatusResponse,
  PCATransformResponse,
  PreprocessParams,
  PreprocessResponse,
  ReportGenerateRequest,
  ReportResponse,
  SVDReconstructResponse,
  SVDStatusResponse,
} from '../types';

const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api';
export const API_BASE_URL = rawBase.replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  errorCode: string;
  detail?: unknown;

  constructor(status: number, errorCode: string, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.detail = detail;
  }
}

export function resolveApiUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return '';
  if (
    pathOrUrl.startsWith('http://') ||
    pathOrUrl.startsWith('https://') ||
    pathOrUrl.startsWith('data:') ||
    pathOrUrl.startsWith('blob:')
  ) {
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith('/api')) {
    const suffix = pathOrUrl.slice(4);
    return `${API_BASE_URL}${suffix}`;
  }
  const clean = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${API_BASE_URL}${clean}`;
}

export async function downloadFileFromApi(
  pathOrUrl: string,
  fallbackFilename: string
): Promise<void> {
  const url = resolveApiUrl(pathOrUrl);
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `Download failed (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.message) msg = data.message;
    } catch {
      // Non-JSON error body
    }
    throw new ApiError(res.status, `HTTP_${res.status}`, msg);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fallbackFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

async function requestJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const url = resolveApiUrl(endpoint);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(
      0,
      'BACKEND_UNREACHABLE',
      'Cannot reach ImageLab Python backend. Ensure FastAPI server is running.'
    );
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const errCode = body?.error_code || `HTTP_${res.status}`;
    const errMsg = body?.message || res.statusText || 'Request failed';
    throw new ApiError(res.status, errCode, errMsg, body?.detail);
  }

  return body as T;
}

export async function checkHealth(): Promise<HealthStatus> {
  return requestJson<HealthStatus>('/health');
}

export async function uploadImage(file: File): Promise<BackendImage> {
  const form = new FormData();
  form.append('file', file);
  return requestJson<BackendImage>('/images/upload', {
    method: 'POST',
    body: form,
  });
}

export async function loadSamplePhantom(
  sampleType: 'shepp_logan' | 'radial_target' | 'histology_cells'
): Promise<BackendImage> {
  return requestJson<BackendImage>(`/images/sample/${sampleType}`, {
    method: 'POST',
  });
}

export async function fetchImages(includePreprocessed = true): Promise<BackendImage[]> {
  const data = await requestJson<{ images: BackendImage[]; total: number }>(
    `/images?include_preprocessed=${includePreprocessed}`
  );
  return data.images;
}

export async function deleteImageById(imageId: string): Promise<void> {
  await requestJson(`/images/${encodeURIComponent(imageId)}`, {
    method: 'DELETE',
  });
}

export async function preprocessImage(
  imageId: string,
  params: PreprocessParams
): Promise<PreprocessResponse> {
  return requestJson<PreprocessResponse>(`/images/${encodeURIComponent(imageId)}/preprocess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

export async function extractFeatures(req: FeatureExtractRequest): Promise<FeatureExtractResponse> {
  return requestJson<FeatureExtractResponse>('/features/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function fetchLatestFeatures(imageId: string): Promise<FeatureExtractResponse | null> {
  try {
    return await requestJson<FeatureExtractResponse>(`/features/${encodeURIComponent(imageId)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function getPCAStatus(): Promise<PCAStatusResponse> {
  return requestJson<PCAStatusResponse>('/pca/status');
}

export async function fitPCAModel(req: PCAFitRequest): Promise<PCAFitResponse> {
  return requestJson<PCAFitResponse>('/pca/fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function transformPCA(imageId: string): Promise<PCATransformResponse> {
  return requestJson<PCATransformResponse>('/pca/transform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId }),
  });
}

export async function decomposeSVD(
  imageId: string,
  forceRecompute = false
): Promise<SVDStatusResponse> {
  return requestJson<SVDStatusResponse>('/svd/decompose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId, force_recompute: forceRecompute }),
  });
}

export async function reconstructSVD(
  imageId: string,
  rank: number
): Promise<SVDReconstructResponse> {
  return requestJson<SVDReconstructResponse>('/svd/reconstruct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId, rank }),
  });
}

export async function getSVDStatus(imageId: string): Promise<SVDStatusResponse> {
  return requestJson<SVDStatusResponse>(`/svd/${encodeURIComponent(imageId)}/status`);
}

export async function getMedicalStatus(): Promise<MedicalStatusResponse> {
  return requestJson<MedicalStatusResponse>('/medical/status');
}

export async function classifyMedicalMRI(imageId: string): Promise<MedicalClassificationResult> {
  return requestJson<MedicalClassificationResult>('/medical/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId }),
  });
}

export async function segmentMedicalMRI(imageId: string): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>('/medical/segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId }),
  });
}

export async function runComparison(
  imageId: string,
  svdRank: number,
  dctRetentionPercent: number
): Promise<ComparisonResponse> {
  return requestJson<ComparisonResponse>('/comparison/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_id: imageId,
      svd_rank: svdRank,
      dct_retention_percent: dctRetentionPercent,
    }),
  });
}

export async function submitComparisonJob(
  imageId: string,
  svdRank: number,
  dctRetentionPercent: number
): Promise<JobResponse> {
  return requestJson<JobResponse>('/jobs/comparison', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_id: imageId,
      svd_rank: svdRank,
      dct_retention_percent: dctRetentionPercent,
    }),
  });
}

export async function getJobStatus(jobId: string): Promise<JobResponse> {
  return requestJson<JobResponse>(`/jobs/${encodeURIComponent(jobId)}`);
}

export async function fetchExperiments(): Promise<ExperimentRecord[]> {
  return requestJson<ExperimentRecord[]>('/experiments');
}

export async function createExperiment(req: ExperimentCreateRequest): Promise<ExperimentRecord> {
  return requestJson<ExperimentRecord>('/experiments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function deleteExperimentById(id: string): Promise<void> {
  await requestJson(`/experiments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function generateReport(req: ReportGenerateRequest): Promise<ReportResponse> {
  return requestJson<ReportResponse>('/reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export async function fetchReports(): Promise<ReportResponse[]> {
  return requestJson<ReportResponse[]>('/reports');
}
