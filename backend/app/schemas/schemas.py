from datetime import datetime
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    error_code: str
    message: str
    detail: Optional[Any] = None


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    database_connected: bool
    medical_model_configured: bool
    timestamp: datetime


class ImageResponse(BaseModel):
    id: str
    filename: str
    format: str
    width: int
    height: int
    channels: int
    color_mode: str
    file_size: int
    mean_intensity: float
    std_dev_intensity: float
    is_preprocessed: bool
    parent_image_id: Optional[str] = None
    file_url: str
    created_at: datetime


class ImageListResponse(BaseModel):
    images: List[ImageResponse]
    total: int


class PreprocessRequest(BaseModel):
    operation: str = "custom"
    resize_width: Optional[int] = Field(default=None, ge=16, le=2048)
    resize_height: Optional[int] = Field(default=None, ge=16, le=2048)
    keep_aspect_ratio: bool = True
    grayscale: bool = False
    normalization: Literal["none", "minmax", "standardization"] = "none"
    denoise_method: Literal["none", "gaussian", "median"] = "none"
    denoise_strength: int = Field(default=3, ge=1, le=15)
    brightness: int = Field(default=0, ge=-100, le=100)
    contrast: int = Field(default=0, ge=-100, le=100)
    clahe_enabled: bool = False
    threshold_enabled: bool = False
    threshold_value: int = Field(default=127, ge=0, le=255)


class PreprocessResponse(BaseModel):
    record_id: str
    source_image_id: str
    processed_image_id: str
    processed_image_url: str
    output_width: int
    output_height: int
    output_channels: int
    applied_operations: List[str]
    processing_time_ms: float
    image: ImageResponse


class FeatureExtractRequest(BaseModel):
    image_id: str
    extraction_method: Literal["comprehensive", "statistical", "texture", "edge", "shape", "frequency"] = "comprehensive"
    canny_low: int = Field(default=50, ge=0, le=255)
    canny_high: int = Field(default=150, ge=0, le=255)
    apply_shape_threshold: bool = False
    shape_threshold: Optional[int] = Field(default=None, ge=0, le=255)


class FeatureVectorItem(BaseModel):
    name: str
    category: str
    value: float


class FeatureExtractResponse(BaseModel):
    id: str
    image_id: str
    extraction_method: str
    parameters: Dict[str, Any]
    statistical: Optional[Dict[str, Any]] = None
    glcm: Optional[Dict[str, Any]] = None
    lbp: Optional[Dict[str, Any]] = None
    edges: Optional[Dict[str, Any]] = None
    shape: Optional[Dict[str, Any]] = None
    frequency: Optional[Dict[str, Any]] = None
    feature_names: List[str]
    feature_values: List[float]
    feature_vector: List[FeatureVectorItem]
    visualizations: Dict[str, Optional[str]] = Field(default_factory=dict)
    processing_time_ms: float
    created_at: datetime


class PCAFitRequest(BaseModel):
    image_ids: Optional[List[str]] = None
    feature_matrix: Optional[List[List[float]]] = None
    feature_names: Optional[List[str]] = None
    n_components: Optional[int] = Field(default=None, ge=1)
    variance_threshold: Optional[float] = Field(default=None, gt=0.0, le=1.0)
    model_name: str = "Standard PCA Subspace"


class PCAFitResponse(BaseModel):
    model_id: str
    model_name: str
    n_samples: int
    n_features: int
    n_components: int
    feature_names: List[str]
    explained_variance_ratio: List[float]
    cumulative_variance: List[Dict[str, Any]]
    total_explained_variance: float
    reduced_training_vectors: List[List[float]]
    processing_time_ms: float
    created_at: datetime


class PCATransformRequest(BaseModel):
    image_id: Optional[str] = None
    feature_vector: Optional[List[float]] = None
    feature_names: Optional[List[str]] = None


class PCATransformResponse(BaseModel):
    model_id: str
    image_id: Optional[str] = None
    input_dimensions: int
    reduced_dimensions: int
    original_vector: List[float]
    reduced_vector: List[float]
    explained_variance_ratio: List[float]
    cumulative_variance: List[Dict[str, Any]]
    total_explained_variance: float
    processing_time_ms: float


class PCAStatusResponse(BaseModel):
    fitted: bool
    model_id: Optional[str] = None
    model_name: Optional[str] = None
    n_samples: Optional[int] = None
    n_features: Optional[int] = None
    n_components: Optional[int] = None
    feature_names: Optional[List[str]] = None
    explained_variance_ratio: Optional[List[float]] = None
    cumulative_variance: Optional[List[Dict[str, Any]]] = None
    total_explained_variance: Optional[float] = None
    created_at: Optional[datetime] = None


class SVDDecomposeRequest(BaseModel):
    image_id: str
    force_recompute: bool = False


class SVDReconstructRequest(BaseModel):
    image_id: str
    rank: int = Field(ge=1)


class SVDReconstructResponse(BaseModel):
    svd_id: str
    image_id: str
    rank: int
    max_rank: int
    matrix_rows: int
    matrix_cols: int
    singular_values: List[float]
    cumulative_energy: List[Dict[str, Any]]
    retained_energy: float
    mse: float
    psnr: Optional[float] = None
    exact_reconstruction: bool = False
    original_url: str
    reconstructed_url: str
    difference_url: str
    storage_comparison: Dict[str, Any]
    u_sample: List[List[float]]
    v_sample: List[List[float]]
    processing_time_ms: float


class SVDStatusResponse(BaseModel):
    decomposed: bool
    svd_id: Optional[str] = None
    image_id: str
    matrix_rows: Optional[int] = None
    matrix_cols: Optional[int] = None
    max_rank: Optional[int] = None
    singular_values: Optional[List[float]] = None
    cumulative_energy: Optional[List[Dict[str, Any]]] = None
    last_rank: Optional[int] = None
    last_retained_energy: Optional[float] = None
    last_mse: Optional[float] = None
    last_psnr: Optional[float] = None
    decompose_time_ms: Optional[float] = None


class MedicalStatusResponse(BaseModel):
    classification_configured: bool
    segmentation_configured: bool
    classification_error_code: Optional[str] = None
    segmentation_error_code: Optional[str] = None
    message: str
    expected_classification_files: List[str]
    expected_segmentation_files: List[str]
    supported_classes: List[str]
    model_version: Optional[str] = None
    disclaimer: str
    pytorch_installed: bool = False
    model_loaded_in_memory: bool = False
    checkpoint_sha256_prefix: Optional[str] = None
    load_error: Optional[str] = None
    missing_classification_files: List[str] = Field(default_factory=list)
    classification_files_status: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    preprocessing_config: Optional[Dict[str, Any]] = None
    training_metrics: Optional[Dict[str, Any]] = None



class MedicalClassifyRequest(BaseModel):
    image_id: str


class MedicalSegmentRequest(BaseModel):
    image_id: str


class ComparisonRunRequest(BaseModel):
    image_id: str
    svd_rank: int = Field(default=16, ge=1)
    pca_components: Optional[int] = Field(default=None, ge=1)
    dct_retention_percent: int = Field(default=25, ge=1, le=100)


class ComparisonItem(BaseModel):
    method: str
    category: str
    dimension: Optional[int] = None
    processing_time_ms: float
    memory_kb: Optional[float] = None
    mse: Optional[float] = None
    psnr: Optional[float] = None
    retained_energy: Optional[float] = None
    compression_ratio: Optional[float] = None
    notes: Optional[str] = None


class ComparisonResponse(BaseModel):
    image_id: str
    image_name: str
    items: List[ComparisonItem]
    pca_available: bool
    medical_evaluation_available: bool
    medical_evaluation_message: str
    processing_time_ms: float


class ExperimentCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    input_image_ids: List[str] = Field(default_factory=list)
    dataset_name: str = "Uploaded Image"
    selected_methods: List[str] = Field(default_factory=list)
    primary_method: str
    processing_params: Dict[str, Any] = Field(default_factory=dict)
    feature_settings: Dict[str, Any] = Field(default_factory=dict)
    pca_settings: Dict[str, Any] = Field(default_factory=dict)
    svd_rank: Optional[int] = None
    results: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    model_version: Optional[str] = None
    notes: Optional[str] = None


class ExperimentResponse(BaseModel):
    id: str
    name: str
    input_image_ids: List[str]
    dataset_name: str
    selected_methods: List[str]
    primary_method: str
    processing_params: Dict[str, Any]
    feature_settings: Dict[str, Any]
    pca_settings: Dict[str, Any]
    svd_rank: Optional[int] = None
    results: Dict[str, Any]
    metrics: Dict[str, Any]
    model_version: Optional[str] = None
    status: str
    error_details: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class JobResponse(BaseModel):
    id: str
    job_type: str
    status: str
    progress_measurable: bool
    progress: Optional[float] = None
    message: Optional[str] = None
    result: Optional[Any] = None
    error_details: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ReportGenerateRequest(BaseModel):
    title: str = "ImageLab Research Analysis Report"
    report_type: Literal["summary", "svd", "pca", "features", "medical", "comparison", "full"] = "summary"
    format: Literal["pdf", "csv"] = "pdf"
    experiment_ids: List[str] = Field(default_factory=list)
    author: str = "Researcher"
    include_charts: bool = True
    include_metrics: bool = True
    notes: Optional[str] = None


class ReportResponse(BaseModel):
    id: str
    title: str
    report_type: str
    format: str
    experiment_ids: List[str]
    file_size: int
    download_url: str
    created_at: datetime
