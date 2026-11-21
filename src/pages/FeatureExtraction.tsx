import React, { useState } from 'react';
import {
  ScanSearch,
  Play,
  Download,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useWorkspace } from '../context/WorkspaceContext';
import { MetricCard } from '../components/common/MetricCard';
import { ImageCanvasViewer } from '../components/common/ImageCanvasViewer';
import { downloadFileFromApi } from '../services/api';

type FeatureCategoryTab = 'statistical' | 'texture' | 'edge' | 'shape' | 'frequency';

export const FeatureExtraction: React.FC = () => {
  const {
    activeImage,
    featureResult,
    runFeatureExtraction,
    isComputing,
    saveExperimentRecord,
    setActiveTab: setWorkspaceTab,
    theme,
    showToast,
  } = useWorkspace();

  const [activeTab, setActiveTab] = useState<FeatureCategoryTab>('statistical');
  const [showVectorViewer, setShowVectorViewer] = useState(false);
  const [cannyLow, setCannyLow] = useState(50);
  const [cannyHigh, setCannyHigh] = useState(150);
  const [applyShapeThreshold, setApplyShapeThreshold] = useState(false);

  const handleExtract = (overrideShape?: boolean) => {
    const safeLow = Math.max(0, Math.min(254, Number.isFinite(cannyLow) ? cannyLow : 50));
    const safeHigh = Math.max(1, Math.min(255, Number.isFinite(cannyHigh) ? cannyHigh : 150));
    if (safeLow >= safeHigh) {
      showToast('Canny Low threshold must be less than Canny High threshold.', 'warning');
      return;
    }
    runFeatureExtraction({
      cannyLow: safeLow,
      cannyHigh: safeHigh,
      applyShapeThreshold: overrideShape ?? applyShapeThreshold,
    });
  };

  const handleDownloadCSV = async () => {
    if (!activeImage) return;
    try {
      await downloadFileFromApi(`/features/${encodeURIComponent(activeImage.id)}/csv`, `features_${activeImage.id}.csv`);
      showToast(`Downloaded features_${activeImage.id}.csv`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to download CSV', 'error');
    }
  };

  const handleSaveRun = async () => {
    if (!activeImage || !featureResult) return;
    await saveExperimentRecord({
      name: `${activeImage.filename} - Feature Vector (${featureResult.feature_vector.length}D)`,
      input_image_ids: [activeImage.id],
      dataset_name: activeImage.filename,
      selected_methods: ['Statistical', 'GLCM', 'LBP', 'Edge', 'DCT', 'Wavelet'],
      primary_method: 'Features',
      feature_settings: featureResult.parameters,
      metrics: {
        dimensions: featureResult.feature_vector.length,
        processingTimeMs: featureResult.processing_time_ms,
        entropy: featureResult.statistical?.entropy,
        edge_density: featureResult.edges?.edge_density_percent,
      },
      notes: `Extracted ${featureResult.feature_vector.length} consistent numerical descriptors.`,
    });
  };

  const chartStroke = theme === 'dark' ? '#233D4D' : '#D8E0E6';
  const chartText = theme === 'dark' ? '#8FA3B3' : '#526575';

  return (
    <div className="space-y-6 max-w-[1380px] mx-auto pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3]">
          Backend OpenCV, scikit-image &amp; PyWavelets multi-domain feature characterization
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {activeImage && featureResult && (
            <button
              type="button"
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#FE7F2D]" />
              <span>Download CSV</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveRun}
            disabled={!featureResult || isComputing}
            className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            <BookmarkPlus className="w-4 h-4 text-[#FE7F2D]" />
            <span>Save Run</span>
          </button>
          <button
            type="button"
            onClick={() => handleExtract()}
            disabled={isComputing || !activeImage}
            className="flex items-center gap-2 px-5 py-2.5 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{isComputing ? 'Extracting...' : 'Extract Features'}</span>
          </button>
        </div>
      </div>

      {/* Extraction Controls */}
      <div className="p-5 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 flex flex-wrap items-center justify-between gap-4 text-[13px]">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-2.5">
            <span className="text-[#526575] dark:text-[#8FA3B3] font-medium">Canny Low:</span>
            <input
              type="number"
              min={0}
              max={250}
              value={cannyLow}
              onChange={e => setCannyLow(Number(e.target.value))}
              className="w-20 px-3 py-1.5 rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#16222B] font-mono text-[12.5px]"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[#526575] dark:text-[#8FA3B3] font-medium">Canny High:</span>
            <input
              type="number"
              min={1}
              max={255}
              value={cannyHigh}
              onChange={e => setCannyHigh(Number(e.target.value))}
              className="w-20 px-3 py-1.5 rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#16222B] font-mono text-[12.5px]"
            />
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={applyShapeThreshold}
            onChange={e => setApplyShapeThreshold(e.target.checked)}
            className="w-4 h-4 accent-[#FE7F2D] rounded cursor-pointer"
          />
          <span className="text-[#111C24] dark:text-[#EAECEF] font-medium">
            Auto Otsu Binary Mask for Shape Contours
          </span>
        </label>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#FFFFFF] dark:bg-[#111920] border border-[#D8E0E6] dark:border-[#233D4D]/80 overflow-x-auto w-fit max-w-full">
        {(['statistical', 'texture', 'edge', 'shape', 'frequency'] as FeatureCategoryTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[13px] font-semibold rounded-xl capitalize transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab
                ? 'bg-[#233D4D] text-[#EAECEF] ring-1 ring-[#FE7F2D]/40'
                : 'text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {featureResult ? (
        <div className="space-y-6">
          {/* 1. STATISTICAL */}
          {activeTab === 'statistical' && featureResult.statistical && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3.5">
                <MetricCard label="Mean" value={featureResult.statistical.mean} unit="px" />
                <MetricCard label="Median" value={featureResult.statistical.median} unit="px" />
                <MetricCard label="Variance" value={featureResult.statistical.variance} />
                <MetricCard label="Std Dev" value={featureResult.statistical.std_dev} />
                <MetricCard label="Skewness" value={featureResult.statistical.skewness} />
                <MetricCard label="Kurtosis" value={featureResult.statistical.kurtosis} />
                <MetricCard label="Entropy" value={featureResult.statistical.entropy} unit="bits" accent />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ImageCanvasViewer
                  dataUrl={activeImage?.file_url || ''}
                  title="Analyzed Image"
                  subtitle={activeImage?.filename}
                  showHistogram={true}
                />
                <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4 text-[13px]">
                  <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
                    Intensity Distribution Summary
                  </span>
                  <div className="space-y-2.5">
                    <div className="flex justify-between py-2 border-b border-[#E5EBF0] dark:border-[#233D4D]/60">
                      <span className="text-[#526575] dark:text-[#8FA3B3]">Dynamic Range [Min, Max]</span>
                      <span className="font-mono font-semibold">
                        [{featureResult.statistical.min}, {featureResult.statistical.max}]
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#E5EBF0] dark:border-[#233D4D]/60">
                      <span className="text-[#526575] dark:text-[#8FA3B3]">Central Moment Mean (μ)</span>
                      <span className="font-mono font-semibold">{featureResult.statistical.mean}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#E5EBF0] dark:border-[#233D4D]/60">
                      <span className="text-[#526575] dark:text-[#8FA3B3]">Variance (σ²)</span>
                      <span className="font-mono font-semibold">{featureResult.statistical.variance}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#E5EBF0] dark:border-[#233D4D]/60">
                      <span className="text-[#526575] dark:text-[#8FA3B3]">Skewness / Excess Kurtosis</span>
                      <span className="font-mono font-semibold">
                        {featureResult.statistical.skewness} / {featureResult.statistical.kurtosis}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-[#526575] dark:text-[#8FA3B3]">Shannon Entropy</span>
                      <span className="font-mono font-semibold text-[#FE7F2D]">{featureResult.statistical.entropy} bits</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. TEXTURE */}
          {activeTab === 'texture' && featureResult.glcm && featureResult.lbp && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
                <MetricCard label="GLCM Contrast" value={featureResult.glcm.contrast} />
                <MetricCard label="GLCM Dissimilarity" value={featureResult.glcm.dissimilarity} />
                <MetricCard label="GLCM Homogeneity" value={featureResult.glcm.homogeneity} />
                <MetricCard label="GLCM Energy" value={featureResult.glcm.energy} accent />
                <MetricCard label="GLCM Correlation" value={featureResult.glcm.correlation} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ImageCanvasViewer
                  dataUrl={featureResult.visualizations.lbp || ''}
                  title="LBP Feature Map"
                  subtitle="Uniform P=8, R=1"
                />
                <ImageCanvasViewer
                  dataUrl={featureResult.visualizations.glcm || ''}
                  title="GLCM Matrix Heatmap"
                  subtitle="32-level averaged angles"
                />
                <div className="p-5 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[14px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                      LBP Histogram
                    </span>
                    <span className="text-[11.5px] font-mono text-[#FE7F2D]">
                      Uniformity: {featureResult.lbp.uniformity}
                    </span>
                  </div>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={featureResult.lbp.histogram} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartStroke} />
                        <XAxis dataKey="bin" stroke={chartText} fontSize={10} tickLine={false} />
                        <YAxis stroke={chartText} fontSize={10} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: theme === 'dark' ? '#0D141A' : '#FFFFFF',
                            borderColor: '#233D4D',
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="count" fill="#FE7F2D" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. EDGE */}
          {activeTab === 'edge' && featureResult.edges && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MetricCard label="Canny Edge Pixels" value={featureResult.edges.edge_pixel_count} unit="px" />
                <MetricCard label="Edge Density" value={`${featureResult.edges.edge_density_percent}%`} accent />
                <MetricCard label="Mean Sobel Gradient" value={featureResult.edges.sobel_mean_gradient} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ImageCanvasViewer
                  dataUrl={featureResult.visualizations.sobel || ''}
                  title="Sobel Gradient Magnitude"
                  subtitle="√(Gx² + Gy²)"
                />
                <ImageCanvasViewer
                  dataUrl={featureResult.visualizations.canny || ''}
                  title="Canny Edge Map"
                  subtitle={`Thresholds [${featureResult.edges.canny_thresholds.join(', ')}]`}
                />
                <ImageCanvasViewer
                  dataUrl={featureResult.visualizations.laplacian || ''}
                  title="Laplacian Response"
                  subtitle="Second-order ∇²f"
                />
              </div>
            </div>
          )}

          {/* 4. SHAPE */}
          {activeTab === 'shape' && featureResult.shape && (
            <div className="space-y-5">
              {!featureResult.shape.region_detected ? (
                <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
                  <div className="flex items-start gap-3 text-[13.5px] text-[#111C24] dark:text-[#EAECEF]">
                    <Info className="w-5 h-5 text-[#FE7F2D] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-display font-bold block">Binary Mask Required for Shape Geometry</span>
                      <p className="text-[13px] text-[#526575] dark:text-[#8FA3B3]">
                        {featureResult.shape.requirement_message}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setApplyShapeThreshold(true);
                      handleExtract(true);
                    }}
                    disabled={isComputing}
                    className="px-5 py-2.5 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] rounded-xl transition-colors cursor-pointer"
                  >
                    Re-Extract with Auto Otsu Binary Mask
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <MetricCard label="Contour Area" value={featureResult.shape.area ?? 0} unit="px²" />
                    <MetricCard label="Perimeter" value={featureResult.shape.perimeter ?? 0} unit="px" />
                    <MetricCard label="Circularity" value={featureResult.shape.circularity ?? 0} description="4πA / P²" accent />
                    <MetricCard label="Aspect Ratio" value={featureResult.shape.aspect_ratio ?? 0} description="W / H" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ImageCanvasViewer
                      dataUrl={featureResult.visualizations.shape_mask || ''}
                      title="Detected Binary Contour Mask"
                      subtitle={`Source: ${featureResult.shape.mask_source}`}
                    />
                    <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-3 text-[13px]">
                      <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
                        Region Geometry ({featureResult.shape.contour_count} contours)
                      </span>
                      {featureResult.shape.centroid && (
                        <div className="flex justify-between py-2 border-b border-[#E5EBF0] dark:border-[#233D4D]/60">
                          <span className="text-[#526575] dark:text-[#8FA3B3]">Centroid (X, Y)</span>
                          <span className="font-mono font-semibold">
                            ({featureResult.shape.centroid.x}, {featureResult.shape.centroid.y})
                          </span>
                        </div>
                      )}
                      {featureResult.shape.bounding_box && (
                        <div className="flex justify-between py-2 border-b border-[#E5EBF0] dark:border-[#233D4D]/60">
                          <span className="text-[#526575] dark:text-[#8FA3B3]">Bounding Box (W × H)</span>
                          <span className="font-mono font-semibold">
                            {featureResult.shape.bounding_box.w} × {featureResult.shape.bounding_box.h}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between py-2">
                        <span className="text-[#526575] dark:text-[#8FA3B3]">Circularity (1.0 = Circle)</span>
                        <span className="font-mono font-semibold text-[#FE7F2D]">{featureResult.shape.circularity}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 5. FREQUENCY */}
          {activeTab === 'frequency' && featureResult.frequency && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MetricCard
                  label="DCT Top 10% Energy"
                  value={`${featureResult.frequency.dct_energy_top10_percent}%`}
                  accent
                />
                <MetricCard
                  label="Wavelet High-Freq Energy"
                  value={`${featureResult.frequency.high_freq_energy_percent}%`}
                />
                <MetricCard
                  label="Wavelet Coefficients"
                  value={featureResult.frequency.wavelet_coefficients_count}
                  unit="haar"
                />
              </div>

              <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
                <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
                  Haar Wavelet Subband Energy Distribution (%)
                </span>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={featureResult.frequency.wavelet_subbands_energy}
                      margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartStroke} />
                      <XAxis dataKey="band" stroke={chartText} fontSize={11} tickLine={false} />
                      <YAxis stroke={chartText} fontSize={11} tickLine={false} unit="%" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#0D141A' : '#FFFFFF',
                          borderColor: '#233D4D',
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="energy" fill="#FE7F2D" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Unified Feature Vector Viewer */}
          <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                  Consistent ML Feature Vector
                </span>
                <span className="text-[12px] font-mono text-[#FE7F2D]">
                  {featureResult.feature_vector.length} Dimensions · {featureResult.processing_time_ms} ms
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowVectorViewer(!showVectorViewer)}
                className="text-[12.5px] font-semibold text-[#526575] dark:text-[#8FA3B3] hover:text-[#FE7F2D] flex items-center gap-1.5 cursor-pointer"
              >
                <span>{showVectorViewer ? 'Hide Vector' : 'Inspect Numerical Vector'}</span>
                {showVectorViewer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>

            {showVectorViewer && (
              <div className="overflow-x-auto max-h-72 border border-[#E5EBF0] dark:border-[#233D4D] rounded-xl">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#F2F4F7] dark:bg-[#16222B] border-b border-[#E5EBF0] dark:border-[#233D4D] text-[#526575] dark:text-[#8FA3B3] font-semibold sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-4">Descriptor Name</th>
                      <th className="py-2.5 px-4 text-right font-mono">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EBF0] dark:divide-[#233D4D]/60">
                    {featureResult.feature_vector.map((f, i) => (
                      <tr key={i} className="hover:bg-[#F6F8FA] dark:hover:bg-[#16222B]/70">
                        <td className="py-2 px-4 font-mono text-[#7D95A8]">{i + 1}</td>
                        <td className="py-2 px-4 text-[#526575] dark:text-[#8FA3B3]">{f.category}</td>
                        <td className="py-2 px-4 font-medium text-[#111C24] dark:text-[#EAECEF]">{f.name}</td>
                        <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold text-[#FE7F2D]">
                          {f.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-14 text-center rounded-3xl border border-[#D8E0E6] dark:border-[#233D4D]/80 bg-[#FFFFFF] dark:bg-[#111920] space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EAECEF] dark:bg-[#233D4D] flex items-center justify-center text-[#FE7F2D]">
            <ScanSearch className="w-6 h-6" />
          </div>
          <h3 className="font-display text-[17px] font-bold text-[#111C24] dark:text-[#EAECEF]">
            {activeImage ? 'Ready to Extract Features' : 'No Active Image Selected'}
          </h3>
          <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3] max-w-md mx-auto">
            {activeImage
              ? `Extract real statistical, GLCM, LBP, Sobel/Canny/Laplacian, and DCT/Wavelet features from ${activeImage.filename}.`
              : 'Upload an image or load a calibration phantom in Image Workspace first.'}
          </p>
          {activeImage ? (
            <button
              type="button"
              onClick={() => handleExtract()}
              disabled={isComputing}
              className="px-6 py-2.5 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
            >
              {isComputing ? 'Extracting...' : 'Extract Features'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setWorkspaceTab('workspace')}
              className="px-6 py-2.5 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] rounded-xl transition-colors cursor-pointer"
            >
              Go to Image Workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
};
