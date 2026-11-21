import React, { useMemo } from 'react';
import {
  ImagePlus,
  ScanSearch,
  Layers3,
  Brain,
  FlaskConical,
  Eye,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  Play,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import { useWorkspace } from '../context/WorkspaceContext';
import { resolveApiUrl } from '../services/api';

export const Overview: React.FC = () => {
  const {
    setActiveTab,
    images,
    activeImage,
    setActiveImageById,
    handleLoadSample,
    experiments,
    featureResult,
    svdResult,
    pcaTransformResult,
    medicalClassification,
    setActiveAnalysisSubTab,
    setInspectExperimentId,
    runFeatureExtraction,
    runSVDReconstruction,
    isComputing,
    theme,
  } = useWorkspace();

  const featuresExtractedCount = featureResult ? featureResult.feature_vector.length : 0;

  // Build real, honest bar-chart data matching the dashboard reference's dual-tone orange + slate bar aesthetic
  const chartModel = useMemo(() => {
    if (svdResult && svdResult.singular_values.length > 0) {
      const top = svdResult.singular_values.slice(0, 6);
      const total = top.reduce((acc, v) => acc + v, 0) || 1;
      const items = top.map((v, idx) => ({
        name: `σ${idx + 1}`,
        value: Number(((v / total) * 100).toFixed(1)),
        raw: v.toFixed(1),
        highlight: idx === 0 || idx === 2,
      }));
      return {
        title: 'Singular value spectrum',
        subtitle: `Top 6 singular modes for ${activeImage?.filename ?? 'active matrix'} (Rank ${svdResult.rank})`,
        kpiValue: `${svdResult.retained_energy}%`,
        kpiLabel: 'Retained energy',
        ctaLabel: 'Open SVD lab',
        ctaTab: 'analysis' as const,
        data: items,
        unit: '%',
      };
    }

    if (featureResult && featureResult.statistical && featureResult.edges && featureResult.frequency) {
      const items = [
        { name: 'Mean', value: Number(featureResult.statistical.mean.toFixed(1)), highlight: false },
        { name: 'Std Dev', value: Number(featureResult.statistical.std_dev.toFixed(1)), highlight: true },
        { name: 'Entropy', value: Number((featureResult.statistical.entropy * 10).toFixed(1)), highlight: false },
        { name: 'Sobel', value: Number(featureResult.edges.sobel_mean_gradient.toFixed(1)), highlight: true },
        { name: 'DCT Top', value: Number(featureResult.frequency.dct_energy_top10_percent.toFixed(1)), highlight: false },
        { name: 'Hi-Freq', value: Number(featureResult.frequency.high_freq_energy_percent.toFixed(1)), highlight: false },
      ];
      return {
        title: 'Extracted descriptor profile',
        subtitle: `Live OpenCV & frequency metrics across ${featureResult.feature_vector.length} numerical dimensions`,
        kpiValue: `${featureResult.feature_vector.length}`,
        kpiLabel: 'Active descriptors',
        ctaLabel: 'View feature table',
        ctaTab: 'features' as const,
        data: items,
        unit: '',
      };
    }

    if (images.length > 0) {
      const subset = images.slice(0, 6);
      const items = subset.map((img, idx) => ({
        name: img.filename.replace(/\.[^.]+$/, '').slice(0, 8),
        value: Number(((img.width * img.height) / 1000).toFixed(1)),
        highlight: img.id === activeImage?.id || idx === 1,
      }));
      return {
        title: 'Workspace matrix footprint',
        subtitle: 'Stored image pixel density (kilopixels) ready for feature extraction and SVD',
        kpiValue: `${images.length}`,
        kpiLabel: 'Stored matrices',
        ctaLabel: 'Open workspace',
        ctaTab: 'workspace' as const,
        data: items,
        unit: 'k',
      };
    }

    return null;
  }, [svdResult, featureResult, images, activeImage]);

  // Pipeline stage progress indicators (honestly derived from real state)
  const pipelineStages = [
    { key: 'IN', label: 'Image Matrix', done: Boolean(activeImage) },
    { key: 'FE', label: '22D Features', done: Boolean(featureResult) },
    { key: 'SV', label: 'SVD Rank-k', done: Boolean(svdResult) },
    { key: 'PC', label: 'PCA Subspace', done: Boolean(pcaTransformResult) },
    { key: 'ML', label: 'MRI Model', done: Boolean(medicalClassification) },
  ];
  const completedStages = pipelineStages.filter(s => s.done).length;

  return (
    <div className="space-y-7 max-w-[1380px] mx-auto pb-12">
      {/* ================================================================= */}
      {/* PRIMARY ASYMMETRIC BENTO GRID (Reference-inspired spacious layout) */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* LEFT COLUMN (5 cols): Active Specimen Showcase + Pipeline Matrix Track */}
        <div className="xl:col-span-5 flex flex-col gap-6">
          {/* Active Image Specimen Card */}
          <div className="flex-1 rounded-3xl border border-[#D8E0E6] dark:border-[#233D4D]/85 bg-[#FFFFFF] dark:bg-[#111920] p-6 flex flex-col justify-between gap-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-[17px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                  Active specimen
                </h2>
                <p className="text-[12.5px] text-[#526575] dark:text-[#8FA3B3] mt-0.5">
                  {activeImage
                    ? `${activeImage.filename} · ${activeImage.width}×${activeImage.height} px`
                    : 'No matrix loaded in workspace'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('workspace')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#17232D] hover:border-[#FE7F2D] text-[12px] font-semibold text-[#111C24] dark:text-[#EAECEF] transition-colors cursor-pointer shrink-0"
              >
                <span>Inspect</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#FE7F2D]" />
              </button>
            </div>

            {/* Clean Visual Stage */}
            <div className="relative rounded-2xl bg-[#070A0D] border border-[#233D4D]/70 min-h-[270px] flex items-center justify-center overflow-hidden p-5">
              <div
                className="absolute inset-0 opacity-[0.06] pointer-events-none"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, #EAECEF 1px, transparent 1px), linear-gradient(to bottom, #EAECEF 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }}
              />

              {activeImage ? (
                <>
                  <img
                    src={resolveApiUrl(activeImage.file_url)}
                    alt={activeImage.filename}
                    className="relative z-10 max-h-[240px] max-w-full object-contain rounded-lg shadow-2xl"
                  />
                  {/* Corner floating readouts echoing the industrial telemetry aesthetic */}
                  <div className="absolute bottom-3.5 left-3.5 z-10 px-3 py-2 rounded-xl bg-[#090B0E]/90 border border-[#233D4D] font-mono">
                    <span className="text-[10px] text-[#8FA3B3] block">Matrix Shape</span>
                    <span className="text-[14px] font-bold text-[#EAECEF]">
                      {activeImage.width}×{activeImage.height}
                    </span>
                  </div>
                  <div className="absolute top-3.5 right-3.5 z-10 px-3 py-2 rounded-xl bg-[#090B0E]/90 border border-[#233D4D] font-mono text-right">
                    <span className="text-[10px] text-[#8FA3B3] block">Color Mode</span>
                    <span className="text-[13px] font-bold text-[#FE7F2D]">
                      {activeImage.color_mode}
                    </span>
                  </div>
                </>
              ) : (
                <div className="relative z-10 text-center space-y-4 max-w-xs">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-[#16232D] border border-[#233D4D] flex items-center justify-center text-[#FE7F2D]">
                    <ImagePlus className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-display text-[15px] font-bold text-[#EAECEF]">
                      Load a scientific image
                    </p>
                    <p className="text-[12.5px] text-[#8FA3B3] mt-1">
                      Upload a local PNG/JPEG or generate a deterministic calibration phantom.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isComputing}
                    onClick={() => handleLoadSample('shepp_logan')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FE7F2D] hover:bg-[#E86D1F] text-[#090B0E] text-[12.5px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Generate Shepp-Logan Phantom</span>
                  </button>
                </div>
              )}
            </div>

            {/* Direct 1-click compute bar */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!activeImage || isComputing}
                onClick={() => runFeatureExtraction()}
                className="flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#16232D] hover:border-[#FE7F2D] text-[12.5px] font-semibold text-[#111C24] dark:text-[#EAECEF] transition-colors disabled:opacity-45 cursor-pointer"
              >
                <ScanSearch className="w-4 h-4 text-[#FE7F2D]" />
                <span>Extract 22D</span>
              </button>
              <button
                type="button"
                disabled={!activeImage || isComputing}
                onClick={() => runSVDReconstruction()}
                className="flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl bg-[#233D4D] hover:bg-[#2C4D61] text-[12.5px] font-semibold text-[#EAECEF] transition-colors disabled:opacity-45 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-[#FE7F2D]" />
                <span>Run Live SVD</span>
              </button>
            </div>
          </div>

          {/* Pipeline Matrix Readiness Card (echoing bottom-left Port Matrix in reference) */}
          <div className="rounded-3xl border border-[#D8E0E6] dark:border-[#233D4D]/85 bg-[#FFFFFF] dark:bg-[#111920] p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                  Pipeline matrix
                </h3>
                <p className="text-[12px] text-[#526575] dark:text-[#8FA3B3] mt-0.5">
                  Session computation coverage
                </p>
              </div>
              <span className="font-mono text-[13px] font-bold text-[#FE7F2D]">
                {completedStages} / {pipelineStages.length}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2.5">
              {pipelineStages.map(stage => (
                <div key={stage.key} className="space-y-2 text-center">
                  <span className="text-[11px] font-mono text-[#6D8090] dark:text-[#8FA3B3] block">
                    {stage.key}
                  </span>
                  <div
                    className={`h-2.5 rounded-full transition-colors ${
                      stage.done
                        ? 'bg-[#FE7F2D]'
                        : 'bg-[#E2E8EE] dark:bg-[#1D2E3B]'
                    }`}
                  />
                  <span className="text-[10.5px] font-medium text-[#526575] dark:text-[#9BB0C1] block truncate">
                    {stage.label.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): Hero Chart Card + Bottom 2-Column Split */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          {/* Top Hero Chart Card (echoing "Extraction rate by hour" in reference) */}
          <div className="rounded-3xl border border-[#D8E0E6] dark:border-[#233D4D]/85 bg-[#FFFFFF] dark:bg-[#111920] p-6 lg:p-7 flex flex-col justify-between gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-[20px] font-bold tracking-tight text-[#111C24] dark:text-[#EAECEF]">
                  {chartModel ? chartModel.title : 'Spectral & descriptor telemetry'}
                </h2>
                <p className="text-[13px] text-[#526575] dark:text-[#8FA3B3] mt-1">
                  {chartModel
                    ? chartModel.subtitle
                    : 'Generate a phantom or upload an image to inspect live OpenCV & SVD distributions.'}
                </p>
              </div>

              <span className="font-mono text-[11.5px] text-[#526575] dark:text-[#8FA3B3] px-3 py-1.5 rounded-xl bg-[#F2F4F7] dark:bg-[#17232D] border border-[#D8E0E6] dark:border-[#233D4D]">
                {images.length} images · {experiments.length} experiments
              </span>
            </div>

            {chartModel ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                {/* Left Hero KPI Block */}
                <div className="md:col-span-3 flex flex-col justify-end space-y-3 pb-1">
                  <div>
                    <div className="font-mono text-[32px] font-bold tracking-tight text-[#111C24] dark:text-[#EAECEF] leading-none">
                      {chartModel.kpiValue}
                    </div>
                    <div className="text-[12px] text-[#526575] dark:text-[#8FA3B3] mt-1.5">
                      {chartModel.kpiLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (chartModel.ctaTab === 'analysis') setActiveAnalysisSubTab('SVD');
                      setActiveTab(chartModel.ctaTab);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#17232D] hover:border-[#FE7F2D] text-[12px] font-semibold text-[#111C24] dark:text-[#EAECEF] w-fit transition-colors cursor-pointer"
                  >
                    <span>{chartModel.ctaLabel}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#FE7F2D]" />
                  </button>
                </div>

                {/* Right Signature Dual-Tone Gradient Bar Chart */}
                <div className="md:col-span-9 h-[225px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartModel.data} margin={{ top: 24, right: 8, left: 0, bottom: 4 }}>
                      <defs>
                        <linearGradient id="ilOrangeBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FE7F2D" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#FE7F2D" stopOpacity={0.18} />
                        </linearGradient>
                        <linearGradient id="ilSlateBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7695B8" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="#233D4D" stopOpacity={0.22} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: theme === 'dark' ? '#8FA3B3' : '#526575', fontSize: 12, fontFamily: 'JetBrains Mono' }}
                      />
                      <YAxis hide />
                      <Tooltip
                        cursor={{ fill: theme === 'dark' ? 'rgba(35,61,77,0.22)' : 'rgba(35,61,77,0.08)' }}
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#0D141A' : '#FFFFFF',
                          borderColor: '#233D4D',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontFamily: 'JetBrains Mono',
                          color: theme === 'dark' ? '#EAECEF' : '#111C24',
                        }}
                      />
                      <Bar dataKey="value" radius={[8, 8, 2, 2]} maxBarSize={62}>
                        {chartModel.data.map((entry, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={entry.highlight ? 'url(#ilOrangeBar)' : 'url(#ilSlateBar)'}
                            stroke={entry.highlight ? '#FE7F2D' : '#6A8BAD'}
                            strokeWidth={1}
                          />
                        ))}
                        <LabelList
                          dataKey="value"
                          position="top"
                          formatter={(val: unknown) => `${val}${chartModel.unit}`}
                          style={{
                            fill: theme === 'dark' ? '#EAECEF' : '#111C24',
                            fontSize: 11,
                            fontFamily: 'JetBrains Mono',
                            fontWeight: 600,
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="h-[225px] rounded-2xl border border-dashed border-[#D8E0E6] dark:border-[#233D4D] flex flex-col items-center justify-center gap-3 text-center p-6">
                <p className="text-[13.5px] font-medium text-[#526575] dark:text-[#8FA3B3]">
                  No numerical spectrum computed yet.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    disabled={isComputing}
                    onClick={() => handleLoadSample('radial_target')}
                    className="px-4 py-2 rounded-xl bg-[#FE7F2D] hover:bg-[#E86D1F] text-[#090B0E] text-[12.5px] font-bold transition-colors cursor-pointer"
                  >
                    Load Radial Target Phantom
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('workspace')}
                    className="px-4 py-2 rounded-xl border border-[#233D4D] text-[12.5px] font-semibold hover:border-[#FE7F2D] cursor-pointer"
                  >
                    Upload Custom Image
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom 2-Column Split: Experiments Log + Quick Module Launcher */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 flex-1">
            {/* Experiments Log Card (echoing "Identification log" in reference) */}
            <div className="md:col-span-6 rounded-3xl border border-[#D8E0E6] dark:border-[#233D4D]/85 bg-[#FFFFFF] dark:bg-[#111920] p-6 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[16px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                  Experiments log
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('experiments')}
                  className="text-[12px] font-mono font-semibold text-[#D96014] dark:text-[#FE7F2D] hover:underline cursor-pointer"
                >
                  {experiments.length} total
                </button>
              </div>

              {experiments.length > 0 ? (
                <div className="space-y-3">
                  {experiments.slice(0, 3).map(exp => (
                    <div
                      key={exp.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#F6F8FA] dark:bg-[#16222B] border border-transparent hover:border-[#233D4D] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#EAECEF] dark:bg-[#233D4D] flex items-center justify-center text-[#FE7F2D] shrink-0">
                          <FlaskConical className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[13.5px] font-semibold text-[#111C24] dark:text-[#EAECEF] block truncate">
                            {exp.name}
                          </span>
                          <span className="text-[11.5px] font-mono text-[#6D8090] dark:text-[#8FA3B3] block truncate">
                            {exp.primary_method} · {exp.created_at.slice(0, 10)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setInspectExperimentId(exp.id);
                          setActiveTab('experiments');
                        }}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-[#526575] dark:text-[#8FA3B3] hover:text-[#FE7F2D] hover:bg-[#EAECEF] dark:hover:bg-[#233D4D] transition-colors shrink-0 cursor-pointer"
                        title="Inspect experiment"
                        aria-label={`Inspect ${exp.name}`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center space-y-2">
                  <p className="text-[13px] text-[#6D8090] dark:text-[#8FA3B3]">
                    No saved SQLite runs yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAnalysisSubTab('SVD');
                      setActiveTab('analysis');
                    }}
                    className="text-[12.5px] font-semibold text-[#D96014] dark:text-[#FE7F2D] hover:underline cursor-pointer"
                  >
                    Run SVD &amp; Save Experiment →
                  </button>
                </div>
              )}
            </div>

            {/* Module Port / Quick Launchers Card (echoing "Module port" in reference) */}
            <div className="md:col-span-6 rounded-3xl border border-[#D8E0E6] dark:border-[#233D4D]/85 bg-[#FFFFFF] dark:bg-[#111920] p-6 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[16px] font-bold text-[#111C24] dark:text-[#EAECEF]">
                  Analysis modules
                </h3>
                <span className="text-[11.5px] font-mono text-[#6D8090] dark:text-[#8FA3B3]">
                  {featuresExtractedCount > 0 ? `${featuresExtractedCount} dims ready` : '4 core engines'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace')}
                  className="p-4 rounded-2xl border border-[#E2E8EE] dark:border-[#233D4D]/75 bg-[#F6F8FA] dark:bg-[#16222B] hover:border-[#FE7F2D] text-left transition-all group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EAECEF] dark:bg-[#233D4D] text-[#FE7F2D] flex items-center justify-center mb-3">
                    <ImagePlus className="w-4.5 h-4.5" />
                  </div>
                  <span className="font-display text-[13.5px] font-bold text-[#111C24] dark:text-[#EAECEF] block group-hover:text-[#FE7F2D] transition-colors">
                    Workspace
                  </span>
                  <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3]">
                    Preprocess &amp; CLAHE
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('features')}
                  className="p-4 rounded-2xl border border-[#E2E8EE] dark:border-[#233D4D]/75 bg-[#F6F8FA] dark:bg-[#16222B] hover:border-[#FE7F2D] text-left transition-all group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EAECEF] dark:bg-[#233D4D] text-[#FE7F2D] flex items-center justify-center mb-3">
                    <ScanSearch className="w-4.5 h-4.5" />
                  </div>
                  <span className="font-display text-[13.5px] font-bold text-[#111C24] dark:text-[#EAECEF] block group-hover:text-[#FE7F2D] transition-colors">
                    Features
                  </span>
                  <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3]">
                    GLCM, LBP, DCT
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveAnalysisSubTab('SVD');
                    setActiveTab('analysis');
                  }}
                  className="p-4 rounded-2xl border border-[#E2E8EE] dark:border-[#233D4D]/75 bg-[#F6F8FA] dark:bg-[#16222B] hover:border-[#FE7F2D] text-left transition-all group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EAECEF] dark:bg-[#233D4D] text-[#FE7F2D] flex items-center justify-center mb-3">
                    <Layers3 className="w-4.5 h-4.5" />
                  </div>
                  <span className="font-display text-[13.5px] font-bold text-[#111C24] dark:text-[#EAECEF] block group-hover:text-[#FE7F2D] transition-colors">
                    PCA &amp; SVD
                  </span>
                  <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3]">
                    Rank-k &amp; subspace
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('medical')}
                  className="p-4 rounded-2xl border border-[#E2E8EE] dark:border-[#233D4D]/75 bg-[#F6F8FA] dark:bg-[#16222B] hover:border-[#FE7F2D] text-left transition-all group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EAECEF] dark:bg-[#233D4D] text-[#FE7F2D] flex items-center justify-center mb-3">
                    <Brain className="w-4.5 h-4.5" />
                  </div>
                  <span className="font-display text-[13.5px] font-bold text-[#111C24] dark:text-[#EAECEF] block group-hover:text-[#FE7F2D] transition-colors">
                    Medical MRI
                  </span>
                  <span className="text-[11.5px] text-[#6D8090] dark:text-[#8FA3B3]">
                    ResNet50 eval
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* SPACIOUS WORKSPACE IMAGES & CALIBRATION PHANTOM BAR                */}
      {/* ================================================================= */}
      <div className="rounded-3xl border border-[#D8E0E6] dark:border-[#233D4D]/85 bg-[#FFFFFF] dark:bg-[#111920] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-[16px] font-bold text-[#111C24] dark:text-[#EAECEF]">
              Workspace matrices &amp; calibration phantoms
            </h3>
            <p className="text-[12.5px] text-[#526575] dark:text-[#8FA3B3] mt-0.5">
              Switch the active image or synthesize real grayscale PNG phantoms on the backend
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleLoadSample('shepp_logan')}
              disabled={isComputing}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#16222B] hover:border-[#FE7F2D] text-[#111C24] dark:text-[#EAECEF] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 text-[#FE7F2D]" />
              <span>Shepp-Logan PNG</span>
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('radial_target')}
              disabled={isComputing}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#16222B] hover:border-[#FE7F2D] text-[#111C24] dark:text-[#EAECEF] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 text-[#FE7F2D]" />
              <span>Radial Target PNG</span>
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('histology_cells')}
              disabled={isComputing}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] bg-[#F2F4F7] dark:bg-[#16222B] hover:border-[#FE7F2D] text-[#111C24] dark:text-[#EAECEF] transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 text-[#FE7F2D]" />
              <span>Cell Phantom PNG</span>
            </button>
          </div>
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 pt-1">
            {images.slice(0, 10).map(img => {
              const isSel = activeImage?.id === img.id;
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImageById(img.id)}
                  className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 cursor-pointer ${
                    isSel
                      ? 'border-[#FE7F2D] bg-[#FE7F2D]/8 dark:bg-[#233D4D]/75'
                      : 'border-[#E2E8EE] dark:border-[#233D4D]/70 bg-[#F6F8FA] dark:bg-[#16222B] hover:border-[#7D95A8]'
                  }`}
                >
                  <img
                    src={resolveApiUrl(img.file_url)}
                    alt={img.filename}
                    className="w-11 h-11 rounded-xl object-cover bg-black shrink-0 border border-[#233D4D]/50"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-[12.5px] font-semibold text-[#111C24] dark:text-[#EAECEF] block truncate">
                      {img.filename}
                    </span>
                    <span className="text-[11px] font-mono text-[#6D8090] dark:text-[#8FA3B3]">
                      {img.width}×{img.height}
                    </span>
                  </div>
                  {isSel && <CheckCircle2 className="w-4 h-4 text-[#FE7F2D] shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
