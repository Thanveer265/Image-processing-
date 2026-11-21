import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileImage,
  ArrowRight,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Trash2,
  Plus,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ImageCanvasViewer } from '../components/common/ImageCanvasViewer';
import { resolveApiUrl } from '../services/api';

export const ImageWorkspace: React.FC = () => {
  const {
    images,
    activeImage,
    setActiveImageById,
    handleUploadImage,
    handleLoadSample,
    handleDeleteImage,
    preprocessParams,
    setPreprocessParams,
    resetPreprocessParams,
    applyBackendPreprocessing,
    lastAppliedOps,
    setActiveTab,
    isComputing,
    showToast,
  } = useWorkspace();

  const [isDragging, setIsDragging] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.png')) {
      showToast('Only JPG, JPEG, and PNG files are supported.', 'warning');
      return;
    }
    await handleUploadImage(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const validateResize = (): boolean => {
    if (
      preprocessParams.resize_width !== null &&
      (preprocessParams.resize_width < 16 || preprocessParams.resize_width > 2048)
    ) {
      showToast('Target width must be between 16 and 2048 px.', 'warning');
      return false;
    }
    if (
      preprocessParams.resize_height !== null &&
      (preprocessParams.resize_height < 16 || preprocessParams.resize_height > 2048)
    ) {
      showToast('Target height must be between 16 and 2048 px.', 'warning');
      return false;
    }
    return true;
  };

  const handleApplyPreprocessing = async () => {
    if (!validateResize()) return;
    await applyBackendPreprocessing();
  };

  const handleApplyAndContinue = async () => {
    if (!validateResize()) return;
    const res = await applyBackendPreprocessing();
    if (res) {
      setActiveTab('features');
    }
  };

  return (
    <div className="space-y-6 max-w-[1380px] mx-auto pb-12">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3]">
          Upload JPG/PNG imagery, inspect pixel intensities, and save non-destructive OpenCV preprocessing pipelines.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleApplyPreprocessing}
            disabled={!activeImage || isComputing}
            className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] border border-[#D8E0E6] dark:border-[#233D4D] hover:border-[#FE7F2D] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#FE7F2D]" />
            <span>{isComputing ? 'Processing...' : 'Apply Preprocessing'}</span>
          </button>

          <button
            type="button"
            onClick={handleApplyAndContinue}
            disabled={!activeImage || isComputing}
            className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            <span>Apply &amp; Continue</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Upload & Preview (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <div
            onDrop={handleDrop}
            onDragOver={e => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`p-5 rounded-2xl border border-dashed cursor-pointer transition-colors flex items-center justify-between gap-4 ${
              isDragging
                ? 'border-[#FE7F2D] bg-[#FE7F2D]/10 dark:bg-[#233D4D]/70'
                : 'border-[#C8D3DC] dark:border-[#233D4D] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D]'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-[#EAECEF] dark:bg-[#233D4D] text-[#FE7F2D] flex items-center justify-center shrink-0">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="font-display text-[14px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
                  {isComputing ? 'Uploading & validating image...' : 'Drop JPG or PNG image or browse'}
                </span>
                <span className="text-[12px] text-[#6D8090] dark:text-[#8FA3B3]">
                  Validated server-side via Pillow &amp; OpenCV (max 20 MB)
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="px-4 py-2 text-[12px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#F2F4F7] dark:bg-[#1A2934] border border-[#D8E0E6] dark:border-[#233D4D] hover:border-[#FE7F2D] rounded-xl shrink-0 cursor-pointer"
            >
              Browse
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={e => {
                if (e.target.files?.[0]) {
                  handleFile(e.target.files[0]);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
          </div>

          {activeImage ? (
            <div className="space-y-3">
              <ImageCanvasViewer
                dataUrl={activeImage.file_url}
                title={activeImage.filename}
                subtitle={`${activeImage.width} × ${activeImage.height} px · ${activeImage.format} · ${
                  activeImage.is_preprocessed ? 'Preprocessed Copy' : 'Original Upload'
                }`}
                showHistogram={true}
              />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[12px] font-mono text-[#526575] dark:text-[#8FA3B3]">
                <span>
                  ID <strong className="text-[#111C24] dark:text-[#EAECEF]">{activeImage.id}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Size <strong className="text-[#111C24] dark:text-[#EAECEF]">{(activeImage.file_size / 1024).toFixed(1)} KB</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Mean μ <strong className="text-[#FE7F2D]">{activeImage.mean_intensity}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Std σ <strong className="text-[#111C24] dark:text-[#EAECEF]">{activeImage.std_dev_intensity}</strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Channels <strong className="text-[#111C24] dark:text-[#EAECEF]">{activeImage.channels}</strong>
                </span>
              </div>

              {lastAppliedOps.length > 0 && (
                <div className="text-[12px] text-[#2EA876] font-mono px-1">
                  Applied pipeline: {lastAppliedOps.join(' → ')}
                </div>
              )}
            </div>
          ) : (
            <div className="h-72 rounded-2xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#FFFFFF] dark:bg-[#111920] flex flex-col items-center justify-center p-8 text-center space-y-3">
              <FileImage className="w-9 h-9 text-[#7D95A8]" />
              <span className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3] max-w-sm">
                No image in workspace yet. Upload a JPG/PNG above or generate a calibration phantom below.
              </span>
            </div>
          )}

          {/* Workspace Image Gallery & Phantom Generators */}
          <div className="p-5 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-display text-[14px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                Workspace Images ({images.length})
              </span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['shepp_logan', 'Shepp-Logan'],
                    ['radial_target', 'Radial Target'],
                    ['histology_cells', 'Cell Phantom'],
                  ] as const
                ).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleLoadSample(type)}
                    disabled={isComputing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#16222B] text-[#111C24] dark:text-[#EAECEF] hover:border-[#FE7F2D] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#FE7F2D]" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {images.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                {images.map(img => {
                  const isSel = activeImage?.id === img.id;
                  return (
                    <div
                      key={img.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                        isSel
                          ? 'border-[#FE7F2D] bg-[#FE7F2D]/8 dark:bg-[#233D4D]/75'
                          : 'border-[#E2E8EE] dark:border-[#233D4D]/70 bg-[#F6F8FA] dark:bg-[#16222B]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveImageById(img.id)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <img
                          src={resolveApiUrl(img.file_url)}
                          alt={img.filename}
                          className="w-10 h-10 rounded-lg object-cover bg-black shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-[12.5px] font-semibold text-[#111C24] dark:text-[#EAECEF] block truncate">
                            {img.filename}
                          </span>
                          <span className="text-[11px] font-mono text-[#6D8090] dark:text-[#8FA3B3]">
                            {img.width}×{img.height} · {img.is_preprocessed ? 'processed' : 'raw'}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={isComputing}
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteImage(img.id);
                        }}
                        className="p-2 rounded-lg text-[#7D95A8] hover:text-[#E56B6B] hover:bg-[#EAECEF] dark:hover:bg-[#1D2E3B] disabled:opacity-40 shrink-0 cursor-pointer"
                        title="Delete image"
                        aria-label={`Delete ${img.filename}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Preprocessing Controls (5 cols) */}
        <div className="lg:col-span-5 p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-5">
          <div className="flex items-center justify-between border-b border-[#E5EBF0] dark:border-[#233D4D]/65 pb-3.5">
            <h3 className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] flex items-center gap-2.5">
              <Sliders className="w-4 h-4 text-[#FE7F2D]" />
              <span>OpenCV Preprocessing Pipeline</span>
            </h3>
            <button
              type="button"
              onClick={resetPreprocessParams}
              className="text-[12px] font-medium text-[#526575] dark:text-[#8FA3B3] hover:text-[#FE7F2D] flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          {/* Color Space */}
          <div className="space-y-2">
            <label className="text-[11.5px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3] block">
              Color Space Conversion
            </label>
            <div className="grid grid-cols-2 gap-2.5 text-[12.5px]">
              <button
                type="button"
                onClick={() => setPreprocessParams(p => ({ ...p, grayscale: true, operation: 'grayscale' }))}
                className={`py-2.5 px-3 rounded-xl border text-center transition-colors cursor-pointer ${
                  preprocessParams.grayscale
                    ? 'border-[#FE7F2D] bg-[#FE7F2D]/10 dark:bg-[#233D4D] text-[#D96014] dark:text-[#EAECEF] font-semibold'
                    : 'border-[#D8E0E6] dark:border-[#233D4D]/70 text-[#526575] dark:text-[#8FA3B3]'
                }`}
              >
                Grayscale (1-Ch)
              </button>
              <button
                type="button"
                onClick={() => setPreprocessParams(p => ({ ...p, grayscale: false, operation: 'rgb' }))}
                className={`py-2.5 px-3 rounded-xl border text-center transition-colors cursor-pointer ${
                  !preprocessParams.grayscale
                    ? 'border-[#FE7F2D] bg-[#FE7F2D]/10 dark:bg-[#233D4D] text-[#D96014] dark:text-[#EAECEF] font-semibold'
                    : 'border-[#D8E0E6] dark:border-[#233D4D]/70 text-[#526575] dark:text-[#8FA3B3]'
                }`}
              >
                Preserve / RGB
              </button>
            </div>
          </div>

          {/* Normalization */}
          <div className="space-y-2">
            <label className="text-[11.5px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3] block">
              Intensity Normalization
            </label>
            <select
              value={preprocessParams.normalization}
              onChange={e =>
                setPreprocessParams(p => ({
                  ...p,
                  normalization: e.target.value as 'none' | 'minmax' | 'standardization',
                }))
              }
              className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3.5 py-2.5 text-[13px] text-[#111C24] dark:text-[#EAECEF]"
            >
              <option value="none">None (Raw Quantized)</option>
              <option value="minmax">Min-Max [0, 255] Rescaling</option>
              <option value="standardization">Z-Score Standardization</option>
            </select>
          </div>

          {/* Denoising */}
          <div className="space-y-2.5">
            <label className="text-[11.5px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3] block">
              Noise Filtering
            </label>
            <div className="grid grid-cols-3 gap-2.5 text-[12.5px]">
              {(['none', 'gaussian', 'median'] as const).map(method => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPreprocessParams(p => ({ ...p, denoise_method: method }))}
                  className={`py-2 px-2.5 rounded-xl border capitalize transition-colors cursor-pointer ${
                    preprocessParams.denoise_method === method
                      ? 'border-[#FE7F2D] bg-[#FE7F2D]/10 dark:bg-[#233D4D] text-[#D96014] dark:text-[#EAECEF] font-semibold'
                      : 'border-[#D8E0E6] dark:border-[#233D4D]/70 text-[#526575] dark:text-[#8FA3B3]'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>

            {preprocessParams.denoise_method !== 'none' && (
              <div className="space-y-1.5 text-[12.5px] pt-1">
                <div className="flex justify-between">
                  <span className="text-[#526575] dark:text-[#8FA3B3]">Kernel Size</span>
                  <span className="font-mono text-[#FE7F2D]">{preprocessParams.denoise_strength} px</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={11}
                  step={2}
                  value={preprocessParams.denoise_strength}
                  onChange={e =>
                    setPreprocessParams(p => ({ ...p, denoise_strength: Number(e.target.value) }))
                  }
                  className="w-full cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Brightness & Contrast */}
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-[#111C24] dark:text-[#EAECEF] font-medium">Brightness</span>
                <span className="font-mono text-[#FE7F2D] tabular-nums">
                  {preprocessParams.brightness > 0
                    ? `+${preprocessParams.brightness}`
                    : preprocessParams.brightness}
                </span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={preprocessParams.brightness}
                onChange={e => setPreprocessParams(p => ({ ...p, brightness: Number(e.target.value) }))}
                className="w-full cursor-pointer"
              />
            </div>

            <div className="space-y-1.5 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-[#111C24] dark:text-[#EAECEF] font-medium">Contrast</span>
                <span className="font-mono text-[#FE7F2D] tabular-nums">
                  {preprocessParams.contrast > 0
                    ? `+${preprocessParams.contrast}`
                    : preprocessParams.contrast}
                </span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={preprocessParams.contrast}
                onChange={e => setPreprocessParams(p => ({ ...p, contrast: Number(e.target.value) }))}
                className="w-full cursor-pointer"
              />
            </div>
          </div>

          {/* CLAHE & Advanced Resize / Threshold */}
          <div className="border-t border-[#E5EBF0] dark:border-[#233D4D]/65 pt-3.5 space-y-3 text-[13px]">
            <label className="flex items-center justify-between cursor-pointer py-1">
              <span className="text-[#111C24] dark:text-[#EAECEF] font-medium">CLAHE Contrast Equalization</span>
              <input
                type="checkbox"
                checked={preprocessParams.clahe_enabled}
                onChange={e => setPreprocessParams(p => ({ ...p, clahe_enabled: e.target.checked }))}
                className="w-4 h-4 accent-[#FE7F2D] rounded cursor-pointer"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full py-1.5 text-[12.5px] font-semibold text-[#526575] dark:text-[#8FA3B3] hover:text-[#EAECEF] cursor-pointer"
            >
              <span>Resize &amp; Binary Threshold</span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="pt-3 space-y-3.5 border-t border-[#E5EBF0] dark:border-[#233D4D]/60">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1.5">
                      Target Width (px)
                    </label>
                    <input
                      type="number"
                      min={16}
                      max={2048}
                      placeholder="Original"
                      value={preprocessParams.resize_width ?? ''}
                      onChange={e =>
                        setPreprocessParams(p => ({
                          ...p,
                          resize_width: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3 py-2 text-[12.5px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1.5">
                      Target Height (px)
                    </label>
                    <input
                      type="number"
                      min={16}
                      max={2048}
                      placeholder="Auto"
                      value={preprocessParams.resize_height ?? ''}
                      onChange={e =>
                        setPreprocessParams(p => ({
                          ...p,
                          resize_height: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3 py-2 text-[12.5px] font-mono"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[#526575] dark:text-[#8FA3B3]">Keep Aspect Ratio</span>
                  <input
                    type="checkbox"
                    checked={preprocessParams.keep_aspect_ratio}
                    onChange={e =>
                      setPreprocessParams(p => ({ ...p, keep_aspect_ratio: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[#FE7F2D] cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[#111C24] dark:text-[#EAECEF] font-medium">Binary Thresholding</span>
                  <input
                    type="checkbox"
                    checked={preprocessParams.threshold_enabled}
                    onChange={e =>
                      setPreprocessParams(p => ({ ...p, threshold_enabled: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[#FE7F2D] cursor-pointer"
                  />
                </label>

                {preprocessParams.threshold_enabled && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[#526575] dark:text-[#8FA3B3]">Cutoff</span>
                      <span className="font-mono text-[#FE7F2D]">{preprocessParams.threshold_value}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={255}
                      value={preprocessParams.threshold_value}
                      onChange={e =>
                        setPreprocessParams(p => ({ ...p, threshold_value: Number(e.target.value) }))
                      }
                      className="w-full cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
