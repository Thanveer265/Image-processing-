import React, { useRef, useState } from 'react';
import {
  Play,
  BookmarkPlus,
  Info,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Brain,
  Upload,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ImageCanvasViewer } from '../components/common/ImageCanvasViewer';
import { segmentMedicalMRI } from '../services/api';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export const MedicalAnalysis: React.FC = () => {
  const {
    activeImage,
    medicalStatus,
    medicalClassification,
    medicalError,
    refreshMedicalStatus,
    runMedicalClassification,
    handleUploadImage,
    isComputing,
    saveExperimentRecord,
    setActiveTab: setWorkspaceTab,
    showToast,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<'classification' | 'segmentation'>('classification');
  const [segError, setSegError] = useState<string | null>(null);
  const [segChecking, setSegChecking] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleRefreshStatus = async () => {
    setCheckingStatus(true);
    try {
      await refreshMedicalStatus();
      showToast('Medical model status refreshed from backend', 'info');
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleUploadImage(file);
  };

  const handleRunSegmentation = async () => {
    if (!activeImage) return;
    setSegChecking(true);
    setSegError(null);
    try {
      await segmentMedicalMRI(activeImage.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Segmentation model not configured';
      setSegError(msg);
      showToast(msg, 'warning');
    } finally {
      setSegChecking(false);
    }
  };

  const handleSaveTrial = async () => {
    if (!activeImage || !medicalClassification) return;
    await saveExperimentRecord({
      name: `${activeImage.filename} - MRI Classification (${medicalClassification.predicted_class})`,
      input_image_ids: [activeImage.id],
      dataset_name: activeImage.filename,
      selected_methods: ['ResNet50'],
      primary_method: 'Medical',
      model_version: medicalClassification.model_version,
      metrics: {
        predicted_class: medicalClassification.predicted_class,
        confidence: Number((medicalClassification.confidence * 100).toFixed(2)),
        processingTimeMs: medicalClassification.processing_time_ms,
      },
      notes: `ResNet50 research inference: ${medicalClassification.predicted_class}`,
    });
  };

  return (
    <div className="space-y-6 max-w-[1380px] mx-auto pb-12">
      {/* Hidden MRI file upload input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        onChange={handleDirectUpload}
        className="hidden"
      />

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3]">
          Separately trained ResNet50 deep-learning inference (independent of PCA and SVD mathematical modules)
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isComputing}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[#FE7F2D]" />
            <span>Upload MRI Scan</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshStatus}
            disabled={checkingStatus}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-[#FE7F2D] ${checkingStatus ? 'animate-spin' : ''}`} />
            <span>{checkingStatus ? 'Checking...' : 'Check Model Status'}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveTrial}
            disabled={!medicalClassification || isComputing}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            <BookmarkPlus className="w-4 h-4 text-[#FE7F2D]" />
            <span>Save Trial</span>
          </button>

          <button
            type="button"
            onClick={activeTab === 'classification' ? runMedicalClassification : handleRunSegmentation}
            disabled={isComputing || segChecking || !activeImage}
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              {isComputing || segChecking
                ? 'Running...'
                : activeTab === 'classification'
                ? 'Run ResNet50 Classifier'
                : 'Run U-Net Segmenter'}
            </span>
          </button>
        </div>
      </div>

      {/* Classification | Segmentation Switcher */}
      <div className="flex items-center p-1.5 rounded-2xl bg-[#FFFFFF] dark:bg-[#111920] border border-[#D8E0E6] dark:border-[#233D4D]/80 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('classification')}
          className={`px-4 py-2 text-[13px] font-semibold rounded-xl transition-colors cursor-pointer ${
            activeTab === 'classification'
              ? 'bg-[#233D4D] text-[#EAECEF] ring-1 ring-[#FE7F2D]/40'
              : 'text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF]'
          }`}
        >
          Classification (ResNet50)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('segmentation')}
          className={`px-4 py-2 text-[13px] font-semibold rounded-xl transition-colors cursor-pointer ${
            activeTab === 'segmentation'
              ? 'bg-[#233D4D] text-[#EAECEF] ring-1 ring-[#FE7F2D]/40'
              : 'text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF]'
          }`}
        >
          Segmentation (Optional U-Net)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: MRI Preview */}
        <div className="lg:col-span-7 space-y-4">
          <ImageCanvasViewer
            dataUrl={activeImage?.file_url || ''}
            title={activeImage ? `Active Scan: ${activeImage.filename}` : 'No Image Selected'}
            subtitle={
              activeImage
                ? `${activeImage.width} × ${activeImage.height} px · ${activeImage.color_mode}`
                : 'Upload an MRI scan (JPG or PNG) to run classification'
            }
          />
          {!activeImage && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] rounded-xl transition-colors cursor-pointer"
              >
                Upload MRI Scan
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab('workspace')}
                className="px-5 py-2.5 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] border border-[#D8E0E6] dark:border-[#233D4D] hover:border-[#FE7F2D] rounded-xl transition-colors cursor-pointer"
              >
                Open Image Workspace
              </button>
            </div>
          )}
        </div>

        {/* Right: Real Model Status & Inference Output */}
        <div className="lg:col-span-5 space-y-5">
          {activeTab === 'classification' && (
            <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] flex items-center gap-2.5">
                  <Brain className="w-4.5 h-4.5 text-[#FE7F2D]" />
                  <span>ResNet50 Tumour Classifier</span>
                </span>
                {medicalStatus?.classification_configured && medicalStatus?.pytorch_installed ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2EA876]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{medicalStatus.model_loaded_in_memory ? 'Loaded' : 'Ready'}</span>
                  </span>
                ) : medicalStatus?.classification_configured ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#FE7F2D]">
                    <AlertTriangle className="w-4 h-4" />
                    <span>PyTorch Missing</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#FE7F2D]">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Not Configured</span>
                  </span>
                )}
              </div>

              {!medicalStatus?.classification_configured ? (
                <div className="p-4 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] space-y-3.5 text-[13px]">
                  <span className="font-mono font-bold text-[#111C24] dark:text-[#EAECEF] block">
                    {medicalStatus?.classification_error_code || 'MODEL_NOT_CONFIGURED'}
                  </span>
                  <p className="text-[#526575] dark:text-[#8FA3B3] leading-relaxed">
                    {medicalStatus?.message ||
                      'Trained ResNet50 weights are not present on the backend. ImageLab never fabricates medical predictions.'}
                  </p>
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3] block">
                      Files in backend/app/models/classification/
                    </span>
                    <ul className="font-mono text-[12px] space-y-1.5">
                      {(medicalStatus?.expected_classification_files || [
                        'resnet50_brain_tumor.pth',
                        'class_labels.json',
                        'preprocessing_config.json',
                        'training_metrics.json',
                      ]).map(f => {
                        const st = medicalStatus?.classification_files_status?.[f];
                        const isValid = Boolean(st?.valid);
                        const isPresent = Boolean(st?.present);
                        return (
                          <li key={f} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-[#111C24] dark:text-[#EAECEF] truncate">
                              {isValid ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#2EA876] shrink-0" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-[#FE7F2D] shrink-0" />
                              )}
                              <span className="truncate">{f}</span>
                            </span>
                            <span
                              className={`text-[11px] shrink-0 ${
                                isValid ? 'text-[#2EA876]' : 'text-[#FE7F2D]'
                              }`}
                            >
                              {isValid
                                ? formatBytes(st?.size_bytes ?? 0)
                                : isPresent && (st?.size_bytes ?? 0) === 0
                                ? 'Empty (0 B)'
                                : isPresent
                                ? 'Invalid'
                                : 'Missing'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#6D8090] dark:text-[#8FA3B3] border-t border-[#D8E0E6]/70 dark:border-[#233D4D]/70">
                    <span>
                      Classes:{' '}
                      <span className="font-mono text-[#FE7F2D]">
                        {(medicalStatus?.supported_classes || ['glioma', 'meningioma', 'notumor', 'pituitary']).join(', ')}
                      </span>
                    </span>
                    {medicalStatus?.preprocessing_config && (
                      <span className="font-mono text-[#111C24] dark:text-[#EAECEF]">
                        {medicalStatus.preprocessing_config.architecture} · {medicalStatus.preprocessing_config.image_size.join('×')}
                      </span>
                    )}
                  </div>
                </div>
              ) : medicalClassification ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] flex items-center justify-between">
                    <div>
                      <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block">Predicted Class</span>
                      <span className="font-display text-[18px] font-bold text-[#111C24] dark:text-[#EAECEF] capitalize">
                        {medicalClassification.predicted_class}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block">Softmax Confidence</span>
                      <span className="text-[18px] font-mono font-bold text-[#2EA876]">
                        {(medicalClassification.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {medicalClassification.probabilities.map((item, idx) => {
                      const isTop = item.label === medicalClassification.predicted_class;
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex justify-between text-[12px]">
                            <span
                              className={`capitalize ${
                                isTop ? 'font-semibold text-[#111C24] dark:text-[#EAECEF]' : 'text-[#526575] dark:text-[#8FA3B3]'
                              }`}
                            >
                              {item.label}
                            </span>
                            <span className="font-mono tabular-nums text-[#111C24] dark:text-[#EAECEF]">
                              {(item.probability * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-[#E2E8EE] dark:bg-[#1D2E3B] overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isTop ? 'bg-[#FE7F2D]' : 'bg-[#7695B8]'
                              }`}
                              style={{ width: `${item.probability * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] space-y-1.5 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-[#6D8090] dark:text-[#8FA3B3]">Model Version:</span>
                      <span className="font-mono text-[#111C24] dark:text-[#EAECEF]">
                        {medicalClassification.model_version}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6D8090] dark:text-[#8FA3B3]">Input Resolution:</span>
                      <span className="font-mono text-[#111C24] dark:text-[#EAECEF]">
                        {medicalClassification.input_size}×{medicalClassification.input_size} RGB
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6D8090] dark:text-[#8FA3B3]">Inference Time:</span>
                      <span className="font-mono text-[#FE7F2D]">
                        {medicalClassification.processing_time_ms} ms
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] space-y-2.5 text-[13px]">
                  <p className="text-[#526575] dark:text-[#8FA3B3]">
                    {medicalStatus.pytorch_installed
                      ? 'ResNet50 checkpoint is verified. Click "Run ResNet50 Classifier" to evaluate the active MRI image.'
                      : medicalStatus.message}
                  </p>
                  {medicalStatus.checkpoint_sha256_prefix && (
                    <div className="flex items-center justify-between text-[11.5px] font-mono text-[#6D8090] dark:text-[#8FA3B3]">
                      <span>Checkpoint SHA-256:</span>
                      <span className="text-[#111C24] dark:text-[#EAECEF]">
                        {medicalStatus.checkpoint_sha256_prefix}…
                      </span>
                    </div>
                  )}
                </div>
              )}

              {medicalError && (
                <div className="p-3 rounded-xl bg-[#E56B6B]/10 border border-[#E56B6B]/30 text-[12px] font-mono text-[#E56B6B]">
                  {medicalError}
                </div>
              )}

              {medicalStatus?.training_metrics?.test_accuracy !== undefined && (
                <div className="p-4 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3]">
                      Offline Holdout Test Benchmark
                    </span>
                    <span className="font-mono text-[13px] font-bold text-[#2EA876]">
                      {(medicalStatus.training_metrics.test_accuracy * 100).toFixed(2)}% Test Acc
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3]">
                    Static evaluation recorded in <span className="font-mono">training_metrics.json</span> during training — not the accuracy of an individual scan prediction.
                  </p>
                  {medicalStatus.training_metrics.classification_report && (
                    <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                      {(medicalStatus.supported_classes || []).map(cls => {
                        const row = medicalStatus.training_metrics?.classification_report?.[cls];
                        if (!row || typeof row === 'number') return null;
                        return (
                          <div
                            key={cls}
                            className="p-2 rounded-lg bg-[#FFFFFF] dark:bg-[#111920] border border-[#D8E0E6]/70 dark:border-[#233D4D]/70 flex items-center justify-between"
                          >
                            <span className="capitalize text-[#526575] dark:text-[#8FA3B3]">{cls}</span>
                            <span className="font-mono font-semibold text-[#111C24] dark:text-[#EAECEF]">
                              F1 {(row['f1-score'] * 100).toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'segmentation' && (
            <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                  Optional U-Net Segmentation Interface
                </span>
                <span className="text-[12px] font-semibold text-[#FE7F2D]">
                  {medicalStatus?.segmentation_configured ? 'Configured' : 'Not Configured'}
                </span>
              </div>

              <p className="text-[#526575] dark:text-[#8FA3B3] leading-relaxed">
                Lesion segmentation requires a separately trained segmentation model (e.g. U-Net). Synthetic circular overlays are disabled to preserve scientific integrity.
              </p>

              <div className="p-4 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] space-y-1.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3] block">
                  Expected Files in backend/app/models/segmentation/
                </span>
                <ul className="font-mono text-[12px] text-[#111C24] dark:text-[#EAECEF]">
                  {(medicalStatus?.expected_segmentation_files || [
                    'unet_brain_tumor.pth',
                    'segmentation_config.json',
                  ]).map(f => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </div>

              {segError && (
                <div className="p-3 rounded-xl bg-[#E56B6B]/10 border border-[#E56B6B]/30 text-[12px] text-[#E56B6B]">
                  {segError}
                </div>
              )}
            </div>
          )}

          {/* Research Disclaimer */}
          <div className="p-4 rounded-2xl bg-[#FFFFFF] dark:bg-[#111920] border border-[#D8E0E6] dark:border-[#233D4D]/80 flex items-start gap-3 text-[12px] text-[#526575] dark:text-[#8FA3B3]">
            <Info className="w-4 h-4 text-[#FE7F2D] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {medicalStatus?.disclaimer ||
                'Research & Educational Use Only: Deep-learning inference results are not clinically validated and must not be used for medical diagnosis.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
