export type TabType =
  | 'overview'
  | 'workspace'
  | 'features'
  | 'analysis'
  | 'medical'
  | 'comparison'
  | 'experiments'
  | 'reports'
  | 'settings';

export interface HealthStatus {
  status: string;
  app_name: string;
  version: string;
  database_connected: boolean;
  medical_model_configured: boolean;
  timestamp: string;
}

export interface BackendImage {
  id: string;
  filename: string;
  format: string;
  width: number;
  height: number;
  channels: number;
  color_mode: string;
  file_size: number;
  mean_intensity: number;
  std_dev_intensity: number;
  is_preprocessed: boolean;
  parent_image_id: string | null;
  file_url: string;
  created_at: string;
}

export interface PreprocessParams {
  operation: string;
  resize_width: number | null;
  resize_height: number | null;
  keep_aspect_ratio: boolean;
  grayscale: boolean;
  normalization: 'none' | 'minmax' | 'standardization';
  denoise_method: 'none' | 'gaussian' | 'median';
  denoise_strength: number;
  brightness: number;
  contrast: number;
  clahe_enabled: boolean;
  threshold_enabled: boolean;
  threshold_value: number;
}

export interface PreprocessResponse {
  record_id: string;
  source_image_id: string;
  processed_image_id: string;
  processed_image_url: string;
  output_width: number;
  output_height: number;
  output_channels: number;
  applied_operations: string[];
  processing_time_ms: number;
  image: BackendImage;
}

export interface FeatureVectorItem {
  name: string;
  category: string;
  value: number;
}

export interface StatisticalFeatures {
  mean: number;
  median: number;
  variance: number;
  std_dev: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  entropy: number;
}

export interface GLCMFeatures {
  contrast: number;
  dissimilarity: number;
  homogeneity: number;
  energy: number;
  correlation: number;
}

export interface LBPFeatures {
  uniformity: number;
  entropy: number;
  histogram: { bin: number; count: number }[];
}

export interface EdgeFeatures {
  edge_pixel_count: number;
  edge_density_percent: number;
  sobel_mean_gradient: number;
  canny_thresholds: number[];
}

export interface ShapeFeatures {
  region_detected: boolean;
  requirement_message?: string;
  mask_source?: string;
  contour_count?: number;
  area: number | null;
  perimeter: number | null;
  circularity: number | null;
  aspect_ratio: number | null;
  bounding_box?: { x: number; y: number; w: number; h: number } | null;
  centroid: { x: number; y: number } | null;
}

export interface FrequencyFeatures {
  dct_energy_top10_percent: number;
  dct_energy_top20_percent: number;
  dct_dc_component: number;
  wavelet_family: string;
  wavelet_coefficients_count: number;
  high_freq_energy_percent: number;
  wavelet_subbands_energy: { band: string; energy: number }[];
}

export interface FeatureExtractRequest {
  image_id: string;
  extraction_method: 'comprehensive' | 'statistical' | 'texture' | 'edge' | 'shape' | 'frequency';
  canny_low: number;
  canny_high: number;
  apply_shape_threshold: boolean;
  shape_threshold?: number | null;
}

export interface FeatureExtractResponse {
  id: string;
  image_id: string;
  extraction_method: string;
  parameters: Record<string, unknown>;
  statistical: StatisticalFeatures | null;
  glcm: GLCMFeatures | null;
  lbp: LBPFeatures | null;
  edges: EdgeFeatures | null;
  shape: ShapeFeatures | null;
  frequency: FrequencyFeatures | null;
  feature_names: string[];
  feature_values: number[];
  feature_vector: FeatureVectorItem[];
  visualizations: {
    sobel?: string | null;
    canny?: string | null;
    laplacian?: string | null;
    lbp?: string | null;
    glcm?: string | null;
    shape_mask?: string | null;
  };
  processing_time_ms: number;
  created_at: string;
}

export interface PCACumulativeItem {
  component: number;
  variance: number;
  cumulative: number;
}

export interface PCAFitRequest {
  image_ids: string[];
  n_components?: number | null;
  variance_threshold?: number | null;
  model_name: string;
}

export interface PCAFitResponse {
  model_id: string;
  model_name: string;
  n_samples: number;
  n_features: number;
  n_components: number;
  feature_names: string[];
  explained_variance_ratio: number[];
  cumulative_variance: PCACumulativeItem[];
  total_explained_variance: number;
  reduced_training_vectors: number[][];
  processing_time_ms: number;
  created_at: string;
}

export interface PCATransformResponse {
  model_id: string;
  image_id: string | null;
  input_dimensions: number;
  reduced_dimensions: number;
  original_vector: number[];
  reduced_vector: number[];
  explained_variance_ratio: number[];
  cumulative_variance: PCACumulativeItem[];
  total_explained_variance: number;
  processing_time_ms: number;
}

export interface PCAStatusResponse {
  fitted: boolean;
  model_id?: string | null;
  model_name?: string | null;
  n_samples?: number | null;
  n_features?: number | null;
  n_components?: number | null;
  feature_names?: string[] | null;
  explained_variance_ratio?: number[] | null;
  cumulative_variance?: PCACumulativeItem[] | null;
  total_explained_variance?: number | null;
  created_at?: string | null;
}

export interface SVDCumulativeItem {
  rank: number;
  singularValue: number;
  energy: number;
}

export interface SVDReconstructResponse {
  svd_id: string;
  image_id: string;
  rank: number;
  max_rank: number;
  matrix_rows: number;
  matrix_cols: number;
  singular_values: number[];
  cumulative_energy: SVDCumulativeItem[];
  retained_energy: number;
  mse: number;
  psnr: number | null;
  exact_reconstruction: boolean;
  original_url: string;
  reconstructed_url: string;
  difference_url: string;
  storage_comparison: {
    original_elements: number;
    compressed_elements: number;
    compression_ratio: number;
    storage_savings_percent: number;
  };
  u_sample: number[][];
  v_sample: number[][];
  processing_time_ms: number;
}

export interface SVDStatusResponse {
  decomposed: boolean;
  svd_id?: string | null;
  image_id: string;
  matrix_rows?: number | null;
  matrix_cols?: number | null;
  max_rank?: number | null;
  singular_values?: number[] | null;
  cumulative_energy?: SVDCumulativeItem[] | null;
  last_rank?: number | null;
  last_retained_energy?: number | null;
  last_mse?: number | null;
  last_psnr?: number | null;
  decompose_time_ms?: number | null;
}

export interface ModelFileStatus {
  present: boolean;
  valid: boolean;
  size_bytes: number;
  required: boolean;
}

export interface TrainingClassReportItem {
  precision: number;
  recall: number;
  'f1-score': number;
  support: number;
}

export interface MedicalTrainingMetrics {
  test_accuracy?: number;
  classification_report?: Record<string, TrainingClassReportItem | number>;
  confusion_matrix?: number[][];
}

export interface MedicalStatusResponse {
  classification_configured: boolean;
  segmentation_configured: boolean;
  classification_error_code?: string | null;
  segmentation_error_code?: string | null;
  message: string;
  expected_classification_files: string[];
  expected_segmentation_files: string[];
  supported_classes: string[];
  model_version?: string | null;
  disclaimer: string;
  pytorch_installed?: boolean;
  model_loaded_in_memory?: boolean;
  checkpoint_sha256_prefix?: string | null;
  load_error?: string | null;
  missing_classification_files?: string[];
  classification_files_status?: Record<string, ModelFileStatus>;
  preprocessing_config?: {
    image_size: number[];
    input_size: number;
    color_mode: string;
    mean: number[];
    std: number[];
    architecture: string;
    num_classes?: number | null;
    model_version: string;
  } | null;
  training_metrics?: MedicalTrainingMetrics | null;
}

export interface MedicalClassificationResult {
  image_id: string;
  predicted_class: string;
  confidence: number;
  probabilities: { label: string; probability: number }[];
  model_version: string;
  architecture?: string;
  input_size: number;
  processing_time_ms: number;
  disclaimer: string;
}

export interface ComparisonItem {
  method: string;
  category: string;
  dimension: number | null;
  processing_time_ms: number;
  memory_kb: number | null;
  mse: number | null;
  psnr: number | null;
  retained_energy: number | null;
  compression_ratio: number | null;
  notes?: string | null;
}

export interface ComparisonResponse {
  image_id: string;
  image_name: string;
  items: ComparisonItem[];
  pca_available: boolean;
  medical_evaluation_available: boolean;
  medical_evaluation_message: string;
  processing_time_ms: number;
}

export interface ExperimentRecord {
  id: string;
  name: string;
  input_image_ids: string[];
  dataset_name: string;
  selected_methods: string[];
  primary_method: string;
  processing_params: Record<string, unknown>;
  feature_settings: Record<string, unknown>;
  pca_settings: Record<string, unknown>;
  svd_rank?: number | null;
  results: Record<string, unknown>;
  metrics: Record<string, unknown>;
  model_version?: string | null;
  status: string;
  error_details?: string | null;
  notes?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface ExperimentCreateRequest {
  name: string;
  input_image_ids: string[];
  dataset_name: string;
  selected_methods: string[];
  primary_method: string;
  processing_params?: Record<string, unknown>;
  feature_settings?: Record<string, unknown>;
  pca_settings?: Record<string, unknown>;
  svd_rank?: number | null;
  results?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  model_version?: string | null;
  notes?: string | null;
}

export interface JobResponse {
  id: string;
  job_type: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress_measurable: boolean;
  progress?: number | null;
  message?: string | null;
  result?: ComparisonResponse | Record<string, unknown> | null;
  error_details?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface ReportGenerateRequest {
  title: string;
  report_type: 'summary' | 'svd' | 'pca' | 'features' | 'medical' | 'comparison' | 'full';
  format: 'pdf' | 'csv';
  experiment_ids: string[];
  author: string;
  include_charts: boolean;
  include_metrics: boolean;
  notes?: string | null;
}

export interface ReportResponse {
  id: string;
  title: string;
  report_type: string;
  format: string;
  experiment_ids: string[];
  file_size: number;
  download_url: string;
  created_at: string;
}
