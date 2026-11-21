import React, { useState, useEffect } from 'react';
import {
  Play,
  BookmarkPlus,
  Info,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  Layers3,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useWorkspace } from '../context/WorkspaceContext';
import { ImageCanvasViewer } from '../components/common/ImageCanvasViewer';

export const FeatureAnalysis: React.FC = () => {
  const {
    images,
    activeImage,
    activeAnalysisSubTab,
    setActiveAnalysisSubTab,
    svdRank,
    setSvdRank,
    svdResult,
    runSVDReconstruction,
    pcaStatus,
    pcaFitResult,
    pcaTransformResult,
    runPCAFit,
    runPCATransform,
    handleLoadSample,
    setActiveTab,
    isComputing,
    saveExperimentRecord,
    theme,
    showToast,
  } = useWorkspace();

  const [showMathDetails, setShowMathDetails] = useState(false);

  const [selectedTrainIds, setSelectedTrainIds] = useState<string[]>([]);
  const [pcaModelName, setPcaModelName] = useState('Workspace Feature PCA');
  const [pcaMode, setPcaMode] = useState<'components' | 'variance'>('components');
  const [pcaK, setPcaK] = useState<number>(2);
  const [pcaVarThreshold, setPcaVarThreshold] = useState<number>(0.95);

  useEffect(() => {
    const validIds = new Set(images.map(i => i.id));
    setSelectedTrainIds(prev => {
      const cleaned = prev.filter(id => validIds.has(id));
      if (cleaned.length === 0 && images.length >= 2) {
        return images.slice(0, Math.min(5, images.length)).map(i => i.id);
      }
      return cleaned;
    });
  }, [images]);

  useEffect(() => {
    const maxK = Math.max(1, Math.min(selectedTrainIds.length || 1, 22));
    setPcaK(prev => Math.max(1, Math.min(prev, maxK)));
  }, [selectedTrainIds.length]);

  const toggleTrainImage = (id: string) => {
    setSelectedTrainIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleAutoSuggestRank = (targetPercent: number) => {
    if (!svdResult) return;
    const item = svdResult.cumulative_energy.find(e => e.energy >= targetPercent);
    const chosenRank = item ? item.rank : svdResult.max_rank;
    setSvdRank(chosenRank);
    runSVDReconstruction(chosenRank);
  };

  const handleQuickGeneratePhantoms = async () => {
    await handleLoadSample('shepp_logan');
    await handleLoadSample('radial_target');
  };

  const handleSaveSVD = async () => {
    if (!activeImage || !svdResult) return;
    await saveExperimentRecord({
      name: `${activeImage.filename} - Rank ${svdResult.rank} SVD`,
      input_image_ids: [activeImage.id],
      dataset_name: activeImage.filename,
      selected_methods: ['SVD'],
      primary_method: 'SVD',
      svd_rank: svdResult.rank,
      metrics: {
        mse: svdResult.mse,
        psnr: svdResult.psnr,
        retainedEnergy: svdResult.retained_energy,
        compressionRatio: svdResult.storage_comparison.compression_ratio,
        processingTimeMs: svdResult.processing_time_ms,
      },
      notes: `Truncated SVD rank ${svdResult.rank}/${svdResult.max_rank} on ${svdResult.matrix_rows}x${svdResult.matrix_cols} matrix.`,
    });
  };

  const handleSavePCA = async () => {
    if (!pcaStatus?.fitted) return;
    await saveExperimentRecord({
      name: `${pcaStatus.model_name || 'PCA Subspace'} (${pcaStatus.n_components} PCs)`,
      input_image_ids: activeImage ? [activeImage.id] : selectedTrainIds,
      dataset_name: activeImage?.filename || `${pcaStatus.n_samples} training images`,
      selected_methods: ['PCA'],
      primary_method: 'PCA',
      pca_settings: {
        model_id: pcaStatus.model_id,
        n_samples: pcaStatus.n_samples,
        n_features: pcaStatus.n_features,
        n_components: pcaStatus.n_components,
      },
      metrics: {
        retainedEnergy: pcaStatus.total_explained_variance,
        dimensions: pcaStatus.n_components,
        input_dimensions: pcaStatus.n_features,
      },
      notes: pcaTransformResult
        ? `Projected ${activeImage?.filename} from ${pcaTransformResult.input_dimensions}D to ${pcaTransformResult.reduced_dimensions}D.`
        : `Fitted PCA on ${pcaStatus.n_samples} samples.`,
    });
  };

  const handleFitPCA = () => {
    if (selectedTrainIds.length < 2) {
      showToast('Select at least 2 images to fit PCA.', 'warning');
      return;
    }
    const maxPossible = Math.min(selectedTrainIds.length, 22);
    runPCAFit(
      selectedTrainIds,
      pcaMode === 'components' ? Math.min(pcaK, maxPossible) : null,
      pcaMode === 'variance' ? pcaVarThreshold : null,
      pcaModelName
    );
  };

  const chartStrokeColor = theme === 'dark' ? '#233D4D' : '#D8E0E6';
  const chartTextColor = theme === 'dark' ? '#8FA3B3' : '#526575';

  return (
    <div className="space-y-6 max-w-[1380px] mx-auto pb-12">
      {/* Sub-tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3]">
          SVD image matrix reconstruction (per image) &amp; multi-sample PCA feature dimensionality reduction
        </p>

        <div className="flex items-center p-1.5 rounded-2xl bg-[#FFFFFF] dark:bg-[#111920] border border-[#D8E0E6] dark:border-[#233D4D]/80">
          <button
            type="button"
            onClick={() => setActiveAnalysisSubTab('PCA')}
            className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors cursor-pointer ${
              activeAnalysisSubTab === 'PCA'
                ? 'bg-[#233D4D] text-[#EAECEF] ring-1 ring-[#FE7F2D]/40'
                : 'text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF]'
            }`}
          >
            PCA Subspace
          </button>
          <button
            type="button"
            onClick={() => setActiveAnalysisSubTab('SVD')}
            className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors cursor-pointer ${
              activeAnalysisSubTab === 'SVD'
                ? 'bg-[#233D4D] text-[#EAECEF] ring-1 ring-[#FE7F2D]/40'
                : 'text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF]'
            }`}
          >
            SVD Reconstruction
          </button>
        </div>
      </div>

      {/* SVD TAB */}
      {activeAnalysisSubTab === 'SVD' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                  SVD Rank Truncation (Cached U · Σ · Vᵀ)
                </span>
                <span className="text-[12px] font-mono text-[#FE7F2D]">
                  k ∈ [1, {svdResult ? svdResult.max_rank : activeImage ? Math.min(activeImage.width, activeImage.height) : '—'}]
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveSVD}
                  disabled={!svdResult || isComputing}
                  className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#F2F4F7] dark:bg-[#16222B] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
                >
                  <BookmarkPlus className="w-4 h-4 text-[#FE7F2D]" />
                  <span>Save Run</span>
                </button>
                <button
                  type="button"
                  onClick={() => runSVDReconstruction(svdRank)}
                  disabled={isComputing || !activeImage}
                  className="flex items-center gap-2 px-5 py-2 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isComputing ? 'Computing...' : 'Run SVD'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-4 border-t border-[#E5EBF0] dark:border-[#233D4D]/65">
              <div className="md:col-span-8 flex items-center gap-4">
                <span className="text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] shrink-0">
                  Rank (k):
                </span>
                <input
                  type="range"
                  min={1}
                  max={svdResult ? svdResult.max_rank : activeImage ? Math.min(activeImage.width, activeImage.height) : 64}
                  value={Math.min(
                    svdRank,
                    svdResult ? svdResult.max_rank : activeImage ? Math.min(activeImage.width, activeImage.height) : 64
                  )}
                  onChange={e => setSvdRank(Number(e.target.value))}
                  onMouseUp={e => activeImage && runSVDReconstruction(Number(e.currentTarget.value))}
                  onTouchEnd={e => activeImage && runSVDReconstruction(Number(e.currentTarget.value))}
                  onKeyUp={e => {
                    if (activeImage && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
                      runSVDReconstruction(Number(e.currentTarget.value));
                    }
                  }}
                  className="w-full cursor-pointer"
                />
                <input
                  type="number"
                  min={1}
                  max={svdResult ? svdResult.max_rank : activeImage ? Math.min(activeImage.width, activeImage.height) : 2048}
                  value={svdRank}
                  onChange={e => setSvdRank(Math.max(1, Number(e.target.value) || 1))}
                  onBlur={e => activeImage && runSVDReconstruction(Math.max(1, Number(e.currentTarget.value) || 1))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && activeImage) {
                      runSVDReconstruction(Math.max(1, Number(e.currentTarget.value) || 1));
                    }
                  }}
                  className="w-20 px-2.5 py-1.5 text-center font-mono text-[13px] rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#16222B]"
                />
              </div>

              <div className="md:col-span-4 flex items-center justify-end gap-2 text-[12px]">
                <span className="text-[#6D8090] dark:text-[#8FA3B3]">Target Energy:</span>
                {[90, 95, 99].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    disabled={!svdResult}
                    onClick={() => handleAutoSuggestRank(pct)}
                    className="px-3 py-1 rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] text-[#526575] dark:text-[#EAECEF] hover:border-[#FE7F2D] hover:text-[#FE7F2D] disabled:opacity-40 cursor-pointer font-mono"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tri-Panel Visual Comparison */}
          <div className="space-y-3">
            <span className="font-display text-[14px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
              Tri-Panel Comparison: Original · Reconstructed · Residual Difference
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <ImageCanvasViewer
                dataUrl={activeImage?.file_url || ''}
                title="1. Original"
                subtitle={activeImage ? activeImage.filename : 'No active image'}
              />
              <ImageCanvasViewer
                dataUrl={svdResult?.reconstructed_url || ''}
                title={`2. Reconstructed (Rank ${svdResult?.rank ?? svdRank})`}
                subtitle="Low-rank SVD approximation"
              />
              <ImageCanvasViewer
                dataUrl={svdResult?.difference_url || ''}
                title="3. Residual Error Heatmap"
                subtitle="|A - Ak| amplified difference"
              />
            </div>
          </div>

          {/* SVD Metrics */}
          {svdResult && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80">
                <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1">Retained Energy</span>
                <span className="text-[20px] font-bold font-mono tabular-nums text-[#2EA876]">
                  {svdResult.retained_energy}%
                </span>
              </div>
              <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80">
                <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1">MSE</span>
                <span className="text-[20px] font-bold font-mono tabular-nums text-[#111C24] dark:text-[#EAECEF]">
                  {svdResult.mse}
                </span>
              </div>
              <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80">
                <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1">PSNR</span>
                <span className="text-[20px] font-bold font-mono tabular-nums text-[#FE7F2D]">
                  {svdResult.exact_reconstruction || svdResult.psnr === null
                    ? 'Exact (MSE=0)'
                    : `${svdResult.psnr} dB`}
                </span>
              </div>
              <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80">
                <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1">Compression</span>
                <span className="text-[20px] font-bold font-mono tabular-nums text-[#111C24] dark:text-[#EAECEF]">
                  {svdResult.storage_comparison.compression_ratio}×
                </span>
              </div>
              <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80">
                <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1">Latency</span>
                <span className="text-[20px] font-bold font-mono tabular-nums text-[#111C24] dark:text-[#EAECEF]">
                  {svdResult.processing_time_ms} ms
                </span>
              </div>
            </div>
          )}

          {/* Singular Value Spectrum Chart */}
          {svdResult && (
            <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                  Singular Value Spectrum (σᵢ) &amp; Cumulative Energy
                </span>
                <div className="flex items-center gap-4 text-[12px] font-mono">
                  <span className="text-[#FE7F2D] font-semibold">Singular Value</span>
                  <span className="text-[#7695B8] font-semibold">Cumulative Energy %</span>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={svdResult.cumulative_energy} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartStrokeColor} />
                    <XAxis dataKey="rank" stroke={chartTextColor} fontSize={11} tickLine={false} />
                    <YAxis yAxisId="left" stroke={chartTextColor} fontSize={11} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke={chartTextColor} fontSize={11} tickLine={false} unit="%" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'dark' ? '#0D141A' : '#FFFFFF',
                        borderColor: '#233D4D',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <ReferenceLine x={svdResult.rank} stroke="#FE7F2D" strokeDasharray="4 4" />
                    <Line yAxisId="left" type="monotone" dataKey="singularValue" stroke="#FE7F2D" strokeWidth={2.2} dot={{ r: 2 }} />
                    <Line yAxisId="right" type="monotone" dataKey="energy" stroke="#7695B8" strokeWidth={2.2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMathDetails(!showMathDetails)}
              className="w-full flex items-center justify-between p-5 text-left text-[13px] font-semibold text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF] cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Info className="w-4 h-4 text-[#FE7F2D]" />
                <span>Technical Formulation (A = UΣVᵀ)</span>
              </div>
              {showMathDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showMathDetails && (
              <div className="p-5 pt-0 space-y-3 text-[13px] text-[#526575] dark:text-[#8FA3B3] border-t border-[#E5EBF0] dark:border-[#233D4D]/65">
                <div className="p-3.5 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] font-mono text-[12px] text-[#111C24] dark:text-[#EAECEF] mt-4">
                  A = U · Σ · Vᵀ = ∑ (i=1..k) σᵢ · uᵢ · vᵢᵀ
                </div>
                <p>
                  Full SVD is computed once per image via NumPy and cached to disk. Adjusting rank k reuses the cached U, Σ, and Vᵀ matrices without recomputation.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PCA TAB */}
      {activeAnalysisSubTab === 'PCA' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
                  1. Fit Multi-Sample PCA Model (StandardScaler + scikit-learn PCA)
                </span>
                <span className="text-[12.5px] text-[#526575] dark:text-[#8FA3B3]">
                  Requires at least 2 images. Fits on extracted 22-dim feature vectors across selected training samples.
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSavePCA}
                  disabled={!pcaStatus?.fitted || isComputing}
                  className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#F2F4F7] dark:bg-[#16222B] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] disabled:opacity-50 rounded-xl cursor-pointer"
                >
                  <BookmarkPlus className="w-4 h-4 text-[#FE7F2D]" />
                  <span>Save Run</span>
                </button>
                <button
                  type="button"
                  onClick={handleFitPCA}
                  disabled={isComputing || selectedTrainIds.length < 2}
                  className="flex items-center gap-2 px-5 py-2 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl cursor-pointer"
                >
                  <Layers3 className="w-4 h-4" />
                  <span>{isComputing ? 'Fitting...' : `Fit PCA (${selectedTrainIds.length} samples)`}</span>
                </button>
              </div>
            </div>

            {images.length < 2 ? (
              <div className="p-4 rounded-xl bg-[#FE7F2D]/10 border border-[#FE7F2D]/35 text-[13px] text-[#111C24] dark:text-[#EAECEF] flex flex-wrap items-center justify-between gap-4">
                <span>
                  At least 2 images are required in the workspace to fit a valid multi-sample PCA model.
                </span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isComputing}
                    onClick={handleQuickGeneratePhantoms}
                    className="px-4 py-2 text-[12px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl cursor-pointer"
                  >
                    Generate 2 Sample Phantoms
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('workspace')}
                    className="px-4 py-2 text-[12px] font-semibold border border-[#D8E0E6] dark:border-[#233D4D] bg-white dark:bg-[#16222B] rounded-xl hover:border-[#FE7F2D] cursor-pointer"
                  >
                    Open Workspace
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[13px]">
                  <div>
                    <label className="text-[11.5px] font-mono text-[#6D8090] dark:text-[#8FA3B3] block mb-1.5">
                      Model Label
                    </label>
                    <input
                      type="text"
                      value={pcaModelName}
                      onChange={e => setPcaModelName(e.target.value)}
                      className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3.5 py-2 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="text-[11.5px] font-mono text-[#6D8090] dark:text-[#8FA3B3] block mb-1.5">
                      Selection Criterion
                    </label>
                    <select
                      value={pcaMode}
                      onChange={e => setPcaMode(e.target.value as 'components' | 'variance')}
                      className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3.5 py-2 text-[13px]"
                    >
                      <option value="components">Fixed Component Count (n_components)</option>
                      <option value="variance">Variance Threshold (%)</option>
                    </select>
                  </div>
                  <div>
                    {pcaMode === 'components' ? (
                      <>
                        <label className="text-[11.5px] font-mono text-[#6D8090] dark:text-[#8FA3B3] block mb-1.5">
                          n_components (max {Math.min(selectedTrainIds.length || 2, 22)})
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, Math.min(selectedTrainIds.length, 22))}
                          value={pcaK}
                          onChange={e => setPcaK(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3.5 py-2 text-[13px] font-mono"
                        />
                      </>
                    ) : (
                      <>
                        <label className="text-[11.5px] font-mono text-[#6D8090] dark:text-[#8FA3B3] block mb-1.5">
                          Retained Variance Threshold
                        </label>
                        <select
                          value={pcaVarThreshold}
                          onChange={e => setPcaVarThreshold(Number(e.target.value))}
                          className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3.5 py-2 text-[13px] font-mono"
                        >
                          <option value={0.85}>85%</option>
                          <option value={0.9}>90%</option>
                          <option value={0.95}>95%</option>
                          <option value={0.99}>99%</option>
                        </select>
                      </>
                    )}
                  </div>
                </div>

                {/* Training Cohort Checkboxes */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3]">
                      Training Sample Images ({selectedTrainIds.length} selected)
                    </span>
                    <div className="flex items-center gap-3 text-[12px]">
                      <button
                        type="button"
                        onClick={() => setSelectedTrainIds(images.map(i => i.id))}
                        className="text-[#FE7F2D] font-semibold hover:underline cursor-pointer"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTrainIds([])}
                        className="text-[#6D8090] dark:text-[#8FA3B3] hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {images.map(img => {
                      const isSel = selectedTrainIds.includes(img.id);
                      return (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => toggleTrainImage(img.id)}
                          className={`flex items-center gap-2 px-3 py-1.5 text-[12px] rounded-xl border transition-colors cursor-pointer ${
                            isSel
                              ? 'border-[#FE7F2D] bg-[#FE7F2D]/10 dark:bg-[#233D4D] text-[#D96014] dark:text-[#EAECEF] font-semibold'
                              : 'border-[#D8E0E6] dark:border-[#233D4D]/70 text-[#526575] dark:text-[#8FA3B3]'
                          }`}
                        >
                          {isSel ? <CheckSquare className="w-3.5 h-3.5 text-[#FE7F2D]" /> : <Square className="w-3.5 h-3.5" />}
                          <span className="max-w-[150px] truncate">{img.filename}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {pcaStatus?.fitted ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80">
                  <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1">Explained Variance</span>
                  <span className="text-[20px] font-bold font-mono tabular-nums text-[#2EA876]">
                    {pcaStatus.total_explained_variance}%
                  </span>
                </div>
                <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80">
                  <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1">Components</span>
                  <span className="text-[20px] font-bold font-mono tabular-nums text-[#FE7F2D]">
                    {pcaStatus.n_components} / {pcaStatus.n_features}
                  </span>
                </div>
                <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80">
                  <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-1">Training Samples</span>
                  <span className="text-[20px] font-bold font-mono tabular-nums text-[#111C24] dark:text-[#EAECEF]">
                    {pcaStatus.n_samples}
                  </span>
                </div>
                <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3] block mb-0.5">Active Image</span>
                    <span className="text-[12.5px] font-semibold truncate block">
                      {activeImage?.filename || 'None'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => runPCATransform()}
                    disabled={!activeImage || isComputing}
                    className="px-3.5 py-2 text-[12px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl shrink-0 cursor-pointer"
                  >
                    Transform
                  </button>
                </div>
              </div>

              {pcaStatus.cumulative_variance && (
                <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
                  <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
                    Scree Plot: Explained Variance per Principal Component (%)
                  </span>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pcaStatus.cumulative_variance} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartStrokeColor} />
                        <XAxis dataKey="component" stroke={chartTextColor} fontSize={11} tickLine={false} />
                        <YAxis stroke={chartTextColor} fontSize={11} tickLine={false} unit="%" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: theme === 'dark' ? '#0D141A' : '#FFFFFF',
                            borderColor: '#233D4D',
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="variance" name="Variance %" fill="#FE7F2D" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {pcaTransformResult && (
                <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-3.5 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                      Projected Feature Coordinates ({pcaTransformResult.input_dimensions}D → {pcaTransformResult.reduced_dimensions}D)
                    </span>
                    <span className="font-mono text-[12px] text-[#7D95A8]">
                      {pcaTransformResult.processing_time_ms} ms
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {pcaTransformResult.reduced_vector.map((val, idx) => (
                      <div
                        key={idx}
                        className="px-3.5 py-2 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] font-mono text-[12px]"
                      >
                        <span className="text-[#6D8090] dark:text-[#8FA3B3]">PC{idx + 1}: </span>
                        <strong className="text-[#FE7F2D]">{val}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pcaFitResult && (
                <div className="text-[12px] text-[#6D8090] dark:text-[#8FA3B3] font-mono px-1">
                  Fitted artifact `{pcaFitResult.model_id}` persisted on backend ({pcaFitResult.processing_time_ms} ms).
                </div>
              )}
            </div>
          ) : (
            <div className="p-10 text-center rounded-2xl border border-[#D8E0E6] dark:border-[#233D4D]/80 bg-[#FFFFFF] dark:bg-[#111920] text-[13px] text-[#526575] dark:text-[#8FA3B3]">
              No fitted PCA model is active yet. Select at least 2 images above and click &ldquo;Fit PCA&rdquo; to train StandardScaler + PCA before transforming new images.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
