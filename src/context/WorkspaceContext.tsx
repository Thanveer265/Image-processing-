import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  BackendImage,
  ExperimentCreateRequest,
  ExperimentRecord,
  FeatureExtractResponse,
  HealthStatus,
  MedicalClassificationResult,
  MedicalStatusResponse,
  PCAFitResponse,
  PCAStatusResponse,
  PCATransformResponse,
  PreprocessParams,
  ReportResponse,
  SVDReconstructResponse,
  TabType,
} from '../types';
import {
  ApiError,
  checkHealth,
  classifyMedicalMRI,
  createExperiment,
  deleteExperimentById,
  deleteImageById,
  extractFeatures,
  fetchExperiments,
  fetchImages,
  fetchLatestFeatures,
  fetchReports,
  fitPCAModel,
  getMedicalStatus,
  getPCAStatus,
  loadSamplePhantom,
  preprocessImage,
  reconstructSVD,
  transformPCA,
  uploadImage,
} from '../services/api';

interface ToastState {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface WorkspaceContextType {
  viewMode: 'landing' | 'dashboard';
  setViewMode: (mode: 'landing' | 'dashboard') => void;
  enterDashboard: (targetTab?: TabType) => void;
  openLanding: () => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  theme: 'light' | 'dark';
  themeMode: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark') => void;
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Backend health
  healthStatus: HealthStatus | null;
  backendError: string | null;
  refreshHealth: () => Promise<HealthStatus | null>;
  refreshAllBackendState: () => Promise<HealthStatus | null>;

  // Images & Preprocessing
  images: BackendImage[];
  activeImage: BackendImage | null;
  setActiveImageById: (id: string) => void;
  refreshImages: () => Promise<void>;
  handleUploadImage: (file: File) => Promise<BackendImage | null>;
  handleLoadSample: (sampleType: 'shepp_logan' | 'radial_target' | 'histology_cells') => Promise<BackendImage | null>;
  handleDeleteImage: (id: string) => Promise<void>;
  preprocessParams: PreprocessParams;
  setPreprocessParams: React.Dispatch<React.SetStateAction<PreprocessParams>>;
  resetPreprocessParams: () => void;
  applyBackendPreprocessing: () => Promise<BackendImage | null>;
  lastAppliedOps: string[];

  // Feature Extraction
  featureResult: FeatureExtractResponse | null;
  runFeatureExtraction: (opts?: {
    cannyLow?: number;
    cannyHigh?: number;
    applyShapeThreshold?: boolean;
    shapeThreshold?: number | null;
  }) => Promise<void>;

  // PCA & SVD
  activeAnalysisSubTab: 'PCA' | 'SVD';
  setActiveAnalysisSubTab: (tab: 'PCA' | 'SVD') => void;
  svdRank: number;
  setSvdRank: (rank: number) => void;
  svdResult: SVDReconstructResponse | null;
  runSVDReconstruction: (customRank?: number) => Promise<void>;
  pcaStatus: PCAStatusResponse | null;
  pcaFitResult: PCAFitResponse | null;
  pcaTransformResult: PCATransformResponse | null;
  refreshPCAStatus: () => Promise<void>;
  runPCAFit: (imageIds: string[], nComponents?: number | null, varianceThreshold?: number | null, modelName?: string) => Promise<void>;
  runPCATransform: (imageId?: string) => Promise<void>;

  // Medical Analysis
  medicalStatus: MedicalStatusResponse | null;
  medicalClassification: MedicalClassificationResult | null;
  medicalError: string | null;
  refreshMedicalStatus: () => Promise<void>;
  runMedicalClassification: () => Promise<void>;

  // Experiments & Reports
  experiments: ExperimentRecord[];
  inspectExperimentId: string | null;
  setInspectExperimentId: (id: string | null) => void;
  refreshExperiments: () => Promise<void>;
  saveExperimentRecord: (req: ExperimentCreateRequest) => Promise<ExperimentRecord | null>;
  deleteExperiment: (id: string) => Promise<void>;
  reports: ReportResponse[];
  refreshReports: () => Promise<void>;

  // Status & Feedback
  isComputing: boolean;
  toast: ToastState | null;
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  dismissToast: () => void;
}

export const defaultPreprocessParams: PreprocessParams = {
  operation: 'custom',
  resize_width: null,
  resize_height: null,
  keep_aspect_ratio: true,
  grayscale: true,
  normalization: 'none',
  denoise_method: 'none',
  denoise_strength: 3,
  brightness: 0,
  contrast: 0,
  clahe_enabled: false,
  threshold_enabled: false,
  threshold_value: 127,
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [viewMode, setViewMode] = useState<'landing' | 'dashboard'>('landing');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark');
  const [themeMode, setThemeModeState] = useState<'light' | 'dark' | 'system'>('dark');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(true);

  const enterDashboard = useCallback((targetTab?: TabType) => {
    if (targetTab) setActiveTab(targetTab);
    setViewMode('dashboard');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const openLanding = useCallback(() => {
    setViewMode('landing');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  const [images, setImages] = useState<BackendImage[]>([]);
  const [activeImage, setActiveImage] = useState<BackendImage | null>(null);
  const [preprocessParams, setPreprocessParams] = useState<PreprocessParams>(defaultPreprocessParams);
  const [lastAppliedOps, setLastAppliedOps] = useState<string[]>([]);

  const [featureResult, setFeatureResult] = useState<FeatureExtractResponse | null>(null);

  const [activeAnalysisSubTab, setActiveAnalysisSubTab] = useState<'PCA' | 'SVD'>('SVD');
  const [svdRank, setSvdRank] = useState<number>(16);
  const [svdResult, setSvdResult] = useState<SVDReconstructResponse | null>(null);

  const [pcaStatus, setPcaStatus] = useState<PCAStatusResponse | null>(null);
  const [pcaFitResult, setPcaFitResult] = useState<PCAFitResponse | null>(null);
  const [pcaTransformResult, setPcaTransformResult] = useState<PCATransformResponse | null>(null);

  const [medicalStatus, setMedicalStatus] = useState<MedicalStatusResponse | null>(null);
  const [medicalClassification, setMedicalClassification] = useState<MedicalClassificationResult | null>(null);
  const [medicalError, setMedicalError] = useState<string | null>(null);

  const [experiments, setExperiments] = useState<ExperimentRecord[]>([]);
  const [inspectExperimentId, setInspectExperimentId] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportResponse[]>([]);

  const [isComputing, setIsComputing] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const toggleSidebar = () => setSidebarCollapsed(prev => !prev);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      setToast({ id, message, type });
      setTimeout(() => {
        setToast(curr => (curr?.id === id ? null : curr));
      }, 4000);
    },
    []
  );

  const applyThemeClass = useCallback((resolved: 'light' | 'dark') => {
    setThemeState(resolved);
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const setThemeMode = useCallback(
    (mode: 'light' | 'dark' | 'system') => {
      setThemeModeState(mode);
      localStorage.setItem('imagelab_theme', mode);
      if (mode === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyThemeClass(prefersDark ? 'dark' : 'light');
      } else {
        applyThemeClass(mode);
      }
    },
    [applyThemeClass]
  );

  const setTheme = useCallback(
    (newTheme: 'light' | 'dark') => {
      setThemeMode(newTheme);
    },
    [setThemeMode]
  );

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  const clearImageDependentResults = useCallback(() => {
    setFeatureResult(null);
    setSvdResult(null);
    setPcaTransformResult(null);
    setMedicalClassification(null);
    setMedicalError(null);
  }, []);

  const refreshHealth = useCallback(async (): Promise<HealthStatus | null> => {
    try {
      const h = await checkHealth();
      setHealthStatus(h);
      setBackendError(null);
      return h;
    } catch (err) {
      setHealthStatus(null);
      setBackendError(err instanceof Error ? err.message : 'Backend unavailable');
      return null;
    }
  }, []);

  const refreshImages = useCallback(async () => {
    try {
      const list = await fetchImages(true);
      setImages(list);
      setActiveImage(prev => {
        if (prev) {
          const stillThere = list.find(i => i.id === prev.id);
          if (stillThere) return stillThere;
        }
        return list.length > 0 ? list[0] : null;
      });
    } catch {
      // Handled via health check / error banner
    }
  }, []);

  const refreshPCAStatus = useCallback(async () => {
    try {
      const st = await getPCAStatus();
      setPcaStatus(st);
    } catch {
      // Ignore if backend unreachable
    }
  }, []);

  const refreshMedicalStatus = useCallback(async () => {
    try {
      const st = await getMedicalStatus();
      setMedicalStatus(st);
    } catch {
      // Ignore if backend unreachable
    }
  }, []);

  const refreshExperiments = useCallback(async () => {
    try {
      const list = await fetchExperiments();
      setExperiments(list);
    } catch {
      // Ignore if backend unreachable
    }
  }, []);

  const refreshReports = useCallback(async () => {
    try {
      const list = await fetchReports();
      setReports(list);
    } catch {
      // Ignore if backend unreachable
    }
  }, []);

  const refreshAllBackendState = useCallback(async (): Promise<HealthStatus | null> => {
    const h = await refreshHealth();
    await Promise.all([
      refreshImages(),
      refreshPCAStatus(),
      refreshMedicalStatus(),
      refreshExperiments(),
      refreshReports(),
    ]);
    return h;
  }, [refreshHealth, refreshImages, refreshPCAStatus, refreshMedicalStatus, refreshExperiments, refreshReports]);

  useEffect(() => {
    const saved = localStorage.getItem('imagelab_theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setThemeMode(saved);
    } else {
      setThemeMode('dark');
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMediaChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('imagelab_theme') === 'system') {
        applyThemeClass(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', onMediaChange);

    // Initial backend bootstrap
    void refreshAllBackendState();

    return () => {
      mq.removeEventListener('change', onMediaChange);
    };
  }, [setThemeMode, applyThemeClass, refreshAllBackendState]);

  // Load any previously extracted features and clamp SVD rank when active image changes
  useEffect(() => {
    if (!activeImage) {
      clearImageDependentResults();
      return;
    }
    const maxPossibleRank = Math.max(1, Math.min(activeImage.width, activeImage.height));
    setSvdRank(prev => Math.max(1, Math.min(prev, maxPossibleRank)));

    let cancelled = false;
    fetchLatestFeatures(activeImage.id)
      .then(res => {
        if (!cancelled) setFeatureResult(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeImage?.id, activeImage?.width, activeImage?.height, clearImageDependentResults]);

  const setActiveImageById = (id: string) => {
    const found = images.find(i => i.id === id);
    if (found) {
      setActiveImage(found);
      clearImageDependentResults();
      setLastAppliedOps([]);
      showToast(`Selected ${found.filename}`, 'info');
    }
  };

  const handleUploadImage = async (file: File): Promise<BackendImage | null> => {
    setIsComputing(true);
    try {
      const uploaded = await uploadImage(file);
      await refreshImages();
      setActiveImage(uploaded);
      clearImageDependentResults();
      setLastAppliedOps([]);
      showToast(`Uploaded ${uploaded.filename} (${uploaded.width}×${uploaded.height})`, 'success');
      return uploaded;
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Upload failed';
      showToast(msg, 'error');
      return null;
    } finally {
      setIsComputing(false);
    }
  };

  const handleLoadSample = async (
    sampleType: 'shepp_logan' | 'radial_target' | 'histology_cells'
  ): Promise<BackendImage | null> => {
    setIsComputing(true);
    try {
      const created = await loadSamplePhantom(sampleType);
      await refreshImages();
      setActiveImage(created);
      clearImageDependentResults();
      setLastAppliedOps([]);
      showToast(`Generated calibration phantom: ${created.filename}`, 'success');
      return created;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load phantom', 'error');
      return null;
    } finally {
      setIsComputing(false);
    }
  };

  const handleDeleteImage = async (id: string) => {
    setIsComputing(true);
    try {
      await deleteImageById(id);
      const updated = await fetchImages(true);
      setImages(updated);
      if (activeImage?.id === id) {
        setActiveImage(updated[0] ?? null);
        clearImageDependentResults();
      }
      showToast('Image deleted from workspace', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    } finally {
      setIsComputing(false);
    }
  };

  const resetPreprocessParams = () => {
    setPreprocessParams(defaultPreprocessParams);
    showToast('Reset preprocessing parameters', 'info');
  };

  const applyBackendPreprocessing = async (): Promise<BackendImage | null> => {
    if (!activeImage) return null;
    setIsComputing(true);
    try {
      const res = await preprocessImage(activeImage.id, preprocessParams);
      await refreshImages();
      setActiveImage(res.image);
      clearImageDependentResults();
      setLastAppliedOps(res.applied_operations);
      showToast(
        `Preprocessing saved (${res.applied_operations.join(', ')}) in ${res.processing_time_ms} ms`,
        'success'
      );
      return res.image;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Preprocessing failed', 'error');
      return null;
    } finally {
      setIsComputing(false);
    }
  };

  const runFeatureExtraction = async (opts?: {
    cannyLow?: number;
    cannyHigh?: number;
    applyShapeThreshold?: boolean;
    shapeThreshold?: number | null;
  }) => {
    if (!activeImage) return;
    setIsComputing(true);
    try {
      const res = await extractFeatures({
        image_id: activeImage.id,
        extraction_method: 'comprehensive',
        canny_low: opts?.cannyLow ?? 50,
        canny_high: opts?.cannyHigh ?? 150,
        apply_shape_threshold: opts?.applyShapeThreshold ?? false,
        shape_threshold: opts?.shapeThreshold ?? null,
      });
      setFeatureResult(res);
      showToast(`Extracted ${res.feature_vector.length} numerical descriptors (${res.processing_time_ms} ms)`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Feature extraction failed', 'error');
    } finally {
      setIsComputing(false);
    }
  };

  const runSVDReconstruction = async (customRank?: number) => {
    if (!activeImage) return;
    const maxPossible = Math.max(1, Math.min(activeImage.width, activeImage.height));
    const rankToUse = Math.max(1, Math.min(maxPossible, customRank ?? svdRank));
    setIsComputing(true);
    try {
      const res = await reconstructSVD(activeImage.id, rankToUse);
      setSvdResult(res);
      setSvdRank(res.rank);
      showToast(
        `SVD Rank-${res.rank}: ${res.retained_energy}% energy${res.psnr !== null ? ` · PSNR ${res.psnr} dB` : ' · Exact'}`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'SVD reconstruction failed', 'error');
    } finally {
      setIsComputing(false);
    }
  };

  const runPCAFit = async (
    imageIds: string[],
    nComponents?: number | null,
    varianceThreshold?: number | null,
    modelName = 'ImageLab PCA Subspace'
  ) => {
    setIsComputing(true);
    try {
      const fitRes = await fitPCAModel({
        image_ids: imageIds,
        n_components: nComponents ?? null,
        variance_threshold: varianceThreshold ?? null,
        model_name: modelName,
      });
      setPcaFitResult(fitRes);
      await refreshPCAStatus();
      showToast(
        `PCA fitted on ${fitRes.n_samples} samples (${fitRes.n_components} PCs, ${fitRes.total_explained_variance}% variance)`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'PCA fitting failed', 'error');
    } finally {
      setIsComputing(false);
    }
  };

  const runPCATransform = async (imageId?: string) => {
    const targetId = imageId ?? activeImage?.id;
    if (!targetId) return;
    setIsComputing(true);
    try {
      const tr = await transformPCA(targetId);
      setPcaTransformResult(tr);
      showToast(
        `Projected ${tr.input_dimensions} features → ${tr.reduced_dimensions} PCs (${tr.processing_time_ms} ms)`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'PCA projection failed', 'error');
    } finally {
      setIsComputing(false);
    }
  };

  const runMedicalClassification = async () => {
    if (!activeImage) return;
    setIsComputing(true);
    setMedicalError(null);
    try {
      const res = await classifyMedicalMRI(activeImage.id);
      setMedicalClassification(res);
      showToast(`Classification: ${res.predicted_class} (${(res.confidence * 100).toFixed(1)}%)`, 'success');
    } catch (err) {
      const msg = err instanceof ApiError ? `${err.errorCode}: ${err.message}` : 'Classification unavailable';
      setMedicalClassification(null);
      setMedicalError(msg);
      showToast(err instanceof Error ? err.message : 'Model not configured', 'warning');
    } finally {
      setIsComputing(false);
    }
  };

  const saveExperimentRecord = async (req: ExperimentCreateRequest): Promise<ExperimentRecord | null> => {
    setIsComputing(true);
    try {
      const created = await createExperiment(req);
      await refreshExperiments();
      showToast(`Saved experiment ${created.id} to SQLite`, 'success');
      return created;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save experiment', 'error');
      return null;
    } finally {
      setIsComputing(false);
    }
  };

  const deleteExperiment = async (id: string) => {
    setIsComputing(true);
    try {
      await deleteExperimentById(id);
      await refreshExperiments();
      showToast(`Deleted experiment ${id}`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete experiment', 'error');
    } finally {
      setIsComputing(false);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        viewMode,
        setViewMode,
        enterDashboard,
        openLanding,
        activeTab,
        setActiveTab,
        theme,
        themeMode,
        setTheme,
        setThemeMode,
        toggleTheme,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        healthStatus,
        backendError,
        refreshHealth,
        refreshAllBackendState,
        images,
        activeImage,
        setActiveImageById,
        refreshImages,
        handleUploadImage,
        handleLoadSample,
        handleDeleteImage,
        preprocessParams,
        setPreprocessParams,
        resetPreprocessParams,
        applyBackendPreprocessing,
        lastAppliedOps,
        featureResult,
        runFeatureExtraction,
        activeAnalysisSubTab,
        setActiveAnalysisSubTab,
        svdRank,
        setSvdRank,
        svdResult,
        runSVDReconstruction,
        pcaStatus,
        pcaFitResult,
        pcaTransformResult,
        refreshPCAStatus,
        runPCAFit,
        runPCATransform,
        medicalStatus,
        medicalClassification,
        medicalError,
        refreshMedicalStatus,
        runMedicalClassification,
        experiments,
        inspectExperimentId,
        setInspectExperimentId,
        refreshExperiments,
        saveExperimentRecord,
        deleteExperiment,
        reports,
        refreshReports,
        isComputing,
        toast,
        showToast,
        dismissToast,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
};
