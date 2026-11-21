import React, { useState } from 'react';
import {
  ArrowRight,
  Layers3,
  ScanSearch,
  SlidersHorizontal,
  Compass,
  RotateCcw,
  Pause,
  Play,
  FlaskConical,
  FileChartColumn,
  Brain,
  ImagePlus,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  ImageLab3DScene,
  PipelineStageId,
  CameraPreset,
} from '../components/landing/ImageLab3DScene';
import { useWorkspace } from '../context/WorkspaceContext';
import { TabType } from '../types';

interface StageMeta {
  id: PipelineStageId;
  index: string;
  title: string;
  formula: string;
  summary: string;
  metrics: string;
  targetTab: TabType;
  actionLabel: string;
}

const STAGE_DETAILS: Record<PipelineStageId, StageMeta> = {
  preprocess: {
    id: 'preprocess',
    index: '01',
    title: 'Deterministic Preprocessing',
    formula: 'I′ = CLAHE(Gσ * I)',
    summary:
      'Ingest digital images or synthetic calibration phantoms. Apply aspect-safe resizing, grayscale luminance conversion, Gaussian/median/bilateral denoising, and CLAHE contrast normalization.',
    metrics: 'OpenCV 4 · Lossless PNG Storage · Live Pixel Inspector',
    targetTab: 'workspace',
    actionLabel: 'Open Image Workspace',
  },
  features: {
    id: 'features',
    index: '02',
    title: '22-Dim Feature Extraction',
    formula: 'φ(I) ∈ ℝ²²',
    summary:
      'Extract unified numerical descriptors spanning first-order intensity statistics, GLCM co-occurrence texture, LBP micro-patterns, Sobel/Canny/Laplacian edges, Hu shape moments, 2D DCT, and Haar wavelets.',
    metrics: '5 Feature Domains · Visual Diagnostic Maps · CSV Export',
    targetTab: 'features',
    actionLabel: 'Inspect Feature Matrix',
  },
  svd: {
    id: 'svd',
    index: '03',
    title: 'Low-Rank SVD Engine',
    formula: 'Aₖ = Uₖ · Σₖ · Vₖᵀ',
    summary:
      'Decompose grayscale image matrices with cached NumPy singular values. Sweep rank k interactively to inspect MSE, PSNR, SSIM, compression ratio, and cumulative singular energy retention.',
    metrics: 'Cached Decomposition · Real-Time PSNR/SSIM · Spectrum Plot',
    targetTab: 'analysis',
    actionLabel: 'Launch SVD Laboratory',
  },
  pca: {
    id: 'pca',
    index: '04',
    title: 'Multi-Sample PCA & Registry',
    formula: 'Z = (X − μ) · Wₚ',
    summary:
      'Fit standardized scikit-learn PCA subspaces across multi-image cohorts, project 22-dimensional feature vectors into principal components, and persist reproducible runs to SQLite & PDF reports.',
    metrics: 'StandardScaler + PCA · SQLite Registry · ReportLab PDF',
    targetTab: 'analysis',
    actionLabel: 'Open PCA Subspace',
  },
};

export const LandingPage: React.FC = () => {
  const { enterDashboard, setActiveAnalysisSubTab, images, experiments } = useWorkspace();
  const [selectedStage, setSelectedStage] = useState<PipelineStageId>('svd');
  const [explodeAmount, setExplodeAmount] = useState<number>(0.42);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('isometric');
  const [autoOrbit, setAutoOrbit] = useState<boolean>(true);
  const [controlsOpen, setControlsOpen] = useState<boolean>(false);

  const stageMeta = STAGE_DETAILS[selectedStage];

  const handleOpenStage = (stage: StageMeta) => {
    if (stage.id === 'svd') setActiveAnalysisSubTab('SVD');
    if (stage.id === 'pca') setActiveAnalysisSubTab('PCA');
    enterDashboard(stage.targetTab);
  };

  const handleStageSelect = (stage: PipelineStageId) => {
    setSelectedStage(stage);
    if (stage === 'svd') {
      setExplodeAmount(0.72);
    } else if (stage === 'features') {
      setExplodeAmount(0.18);
    }
  };

  return (
    <div className="min-h-screen bg-[#090B0E] text-[#EAECEF] selection:bg-[#FE7F2D]/25 selection:text-[#FE7F2D]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 h-18 bg-[#090B0E]/92 border-b border-[#233D4D]/55">
        <div className="max-w-[1380px] mx-auto h-full px-6 lg:px-10 flex items-center justify-between gap-6">
          {/* Left: Clean Brand Wordmark */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-3 shrink-0 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-[#233D4D] border border-[#345970] flex items-center justify-center group-hover:border-[#FE7F2D] transition-colors">
              <Layers3 className="w-4.5 h-4.5 text-[#FE7F2D]" />
            </div>
            <span className="font-display text-[17px] font-bold tracking-tight text-[#EAECEF]">
              ImageLab
            </span>
          </button>

          {/* Center: Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-9 text-[13.5px] font-medium text-[#8FA3B3]" aria-label="Landing navigation">
            <a href="#pipeline" className="whitespace-nowrap hover:text-[#EAECEF] transition-colors">
              Pipeline
            </a>
            <a href="#algorithms" className="whitespace-nowrap hover:text-[#EAECEF] transition-colors">
              SVD &amp; PCA
            </a>
            <a href="#modules" className="whitespace-nowrap hover:text-[#EAECEF] transition-colors">
              Workspace Modules
            </a>
            <a href="#architecture" className="whitespace-nowrap hover:text-[#EAECEF] transition-colors">
              Architecture
            </a>
          </nav>

          {/* Right: Single Primary Action */}
          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() => enterDashboard('overview')}
              className="whitespace-nowrap shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FE7F2D] hover:bg-[#E86D1F] text-[#090B0E] text-[13.5px] font-bold transition-colors cursor-pointer"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* FULL-BLEED INTERACTIVE 3D HERO                                       */}
      {/* =================================================================== */}
      <section className="relative overflow-hidden border-b border-[#233D4D]/45">
        <div className="max-w-[1380px] mx-auto px-6 lg:px-10 pt-8 pb-10 lg:py-10">
          <div className="relative rounded-3xl border border-[#233D4D]/70 bg-[#0B0F14] overflow-hidden min-h-[640px] lg:min-h-[690px] flex flex-col justify-between">
            {/* Full-Bleed Interactive 3D WebGL Canvas */}
            <div className="absolute inset-0 z-0">
              <ImageLab3DScene
                selectedStage={selectedStage}
                onSelectStage={handleStageSelect}
                explodeAmount={explodeAmount}
                cameraPreset={cameraPreset}
                autoOrbit={autoOrbit}
                onUserOrbit={() => setAutoOrbit(false)}
              />
            </div>

            {/* Soft vignette for guaranteed typographic contrast without backdrop-filter over WebGL */}
            <div
              className="pointer-events-none absolute inset-0 z-[1]"
              style={{
                background:
                  'linear-gradient(95deg, rgba(9,11,14,0.88) 0%, rgba(9,11,14,0.42) 38%, rgba(9,11,14,0.08) 65%, rgba(9,11,14,0.68) 100%)',
              }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-56 z-[1]"
              style={{
                background: 'linear-gradient(180deg, rgba(9,11,14,0) 0%, rgba(9,11,14,0.92) 82%)',
              }}
            />

            {/* Top Row inside Hero: Interactive Pipeline Stage Selector (Left) + Compact 3D Inspector Toggle (Right) */}
            <div className="relative z-10 p-6 lg:p-8 flex flex-wrap items-start justify-between gap-4 pointer-events-none">
              {/* Interactive Mathematical Pipeline Stage Readout Card (inspired by top-left node card in reference) */}
              <div className="pointer-events-auto w-full max-w-[330px] rounded-2xl border border-[#233D4D] bg-[#0D131A]/94 p-5 space-y-3.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-[#8FA3B3]">
                  <span>STAGE {stageMeta.index} / 04</span>
                  <span className="text-[#FE7F2D]">{stageMeta.formula}</span>
                </div>

                <div className="flex items-center gap-1.5 border-b border-[#233D4D]/70 pb-3">
                  {(['preprocess', 'features', 'svd', 'pca'] as PipelineStageId[]).map(st => {
                    const active = selectedStage === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleStageSelect(st)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#233D4D] text-[#FE7F2D] font-semibold'
                            : 'text-[#8FA3B3] hover:text-[#EAECEF] hover:bg-[#14212B]'
                        }`}
                      >
                        {st === 'preprocess' ? 'IN' : st === 'features' ? 'φ(I)' : st === 'svd' ? 'SVD' : 'PCA'}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <h2 className="font-display text-[15px] font-bold text-[#EAECEF]">
                    {stageMeta.title}
                  </h2>
                  <p className="text-[12.5px] text-[#9BB0C1] leading-relaxed mt-1.5">
                    {stageMeta.summary}
                  </p>
                </div>

                <div className="pt-1 flex items-center justify-between gap-2 text-[11px] font-mono text-[#7C95A8]">
                  <span className="truncate">{stageMeta.metrics.split(' · ')[0]}</span>
                  <button
                    type="button"
                    onClick={() => handleOpenStage(stageMeta)}
                    className="inline-flex items-center gap-1 text-[#FE7F2D] hover:text-[#FF9A57] font-semibold shrink-0 cursor-pointer"
                  >
                    <span>Open</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Compact Collapsible 3D Viewport Controls (starts closed so 3D canvas stays unobstructed) */}
              <div className="pointer-events-auto flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => setControlsOpen(prev => !prev)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#233D4D] bg-[#0D131A]/94 hover:border-[#FE7F2D] text-[12px] font-medium text-[#EAECEF] transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#FE7F2D]" />
                  <span>3D Controls</span>
                </button>

                {controlsOpen && (
                  <div className="w-[260px] rounded-2xl border border-[#233D4D] bg-[#0D131A]/96 p-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#8FA3B3] mb-1.5">
                        <span>SVD Plane Separation</span>
                        <span className="text-[#FE7F2D]">{Math.round(explodeAmount * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={explodeAmount}
                        onChange={e => setExplodeAmount(Number(e.target.value))}
                        className="w-full h-1.5 rounded-lg bg-[#233D4D] cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-mono text-[#8FA3B3] block">Camera Angle</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            ['isometric', 'Isometric'],
                            ['svd', 'SVD Planes'],
                            ['features', 'Feature Deck'],
                            ['pca', 'PCA Hub'],
                          ] as Array<[CameraPreset, string]>
                        ).map(([presetId, label]) => (
                          <button
                            key={presetId}
                            type="button"
                            onClick={() => setCameraPreset(presetId)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                              cameraPreset === presetId
                                ? 'bg-[#233D4D] border-[#FE7F2D] text-[#EAECEF]'
                                : 'bg-[#111A22] border-[#233D4D]/70 text-[#8FA3B3] hover:text-[#EAECEF]'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[#233D4D]/60">
                      <button
                        type="button"
                        onClick={() => setAutoOrbit(prev => !prev)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#EAECEF] hover:text-[#FE7F2D] cursor-pointer"
                      >
                        {autoOrbit ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{autoOrbit ? 'Pause Orbit' : 'Auto Orbit'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCameraPreset('isometric');
                          setExplodeAmount(0.42);
                          setAutoOrbit(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-[#8FA3B3] hover:text-[#EAECEF] cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row inside Hero: Subtle Drag Hint (Left) + Editorial Hero Headline & CTAs (Right — echoing reference layout!) */}
            <div className="relative z-10 p-6 lg:p-10 flex flex-col lg:flex-row lg:items-end justify-between gap-8 pointer-events-none">
              <div className="pointer-events-auto flex flex-wrap items-center gap-5 text-[12px] font-mono text-[#8FA3B3]">
                <span className="inline-flex items-center gap-2">
                  <Compass className="w-3.5 h-3.5 text-[#FE7F2D]" />
                  Drag to orbit · Scroll to zoom · Click any 3D node
                </span>
                <span aria-hidden="true" className="text-[#233D4D]">·</span>
                <span className="text-[#EAECEF]">
                  {images.length} workspace images · {experiments.length} saved runs
                </span>
              </div>

              <div className="pointer-events-auto max-w-[540px] space-y-5">
                <h1
                  className="font-display font-extrabold tracking-tight text-[#EAECEF] leading-[1.08]"
                  style={{ fontSize: 'clamp(2.1rem, 3.6vw, 3.35rem)', textWrap: 'balance' }}
                >
                  Linear image transforms, built for exact analysis.
                </h1>
                <p className="text-[15px] text-[#A2B4C2] leading-relaxed max-w-[490px]">
                  Extract 22 numerical descriptors, compute cached Singular Value Decomposition, and project multi-image PCA subspaces inside a real OpenCV &amp; NumPy research studio.
                </p>

                <div className="flex flex-wrap items-center gap-3.5 pt-1">
                  <button
                    type="button"
                    onClick={() => enterDashboard('overview')}
                    className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-[#FE7F2D] hover:bg-[#E86D1F] text-[#090B0E] text-[14px] font-bold transition-colors cursor-pointer"
                  >
                    <span>Open Research Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAnalysisSubTab('SVD');
                      enterDashboard('analysis');
                    }}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#233D4D] bg-[#111920]/90 hover:border-[#FE7F2D] text-[#EAECEF] text-[14px] font-semibold transition-colors cursor-pointer"
                  >
                    <Layers3 className="w-4 h-4 text-[#FE7F2D]" />
                    <span>Try Live SVD Engine</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* SECTION 01: MATHEMATICAL PIPELINE FLOW                               */}
      {/* =================================================================== */}
      <section id="pipeline" className="py-20 lg:py-24 border-b border-[#233D4D]/40">
        <div className="max-w-[1380px] mx-auto px-6 lg:px-10 space-y-12">
          <div className="max-w-2xl space-y-3">
            <span className="text-[12px] font-mono uppercase tracking-widest text-[#FE7F2D]">
              01 · End-to-End Scientific Pipeline
            </span>
            <h2 className="font-display text-[28px] lg:text-[36px] font-bold tracking-tight text-[#EAECEF] leading-tight">
              Every matrix step computed on real pixel arrays.
            </h2>
            <p className="text-[15px] text-[#8FA3B3] leading-relaxed">
              No synthetic placeholders. Each stage executes deterministic OpenCV, NumPy, and scikit-learn routines on the FastAPI backend and saves reproducible artifacts to SQLite.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {Object.values(STAGE_DETAILS).map(stage => (
              <button
                key={stage.id}
                type="button"
                onClick={() => handleOpenStage(stage)}
                className="group text-left p-6 rounded-2xl border border-[#233D4D]/75 bg-[#10171E] hover:bg-[#15212B] hover:border-[#FE7F2D] transition-all flex flex-col justify-between gap-6 cursor-pointer"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] font-semibold text-[#FE7F2D]">
                      {stage.index}
                    </span>
                    <span className="font-mono text-[11px] text-[#7D95A8]">
                      {stage.formula}
                    </span>
                  </div>
                  <h3 className="font-display text-[17px] font-bold text-[#EAECEF] group-hover:text-[#FE7F2D] transition-colors">
                    {stage.title}
                  </h3>
                  <p className="text-[13.5px] text-[#8FA3B3] leading-relaxed">
                    {stage.summary}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#233D4D]/55 flex items-center justify-between text-[12.5px] font-semibold text-[#EAECEF]">
                  <span>{stage.actionLabel}</span>
                  <ArrowRight className="w-4 h-4 text-[#FE7F2D] group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* SECTION 02: ASYMMETRIC BENTO — CORE ALGORITHMS & MODULES             */}
      {/* =================================================================== */}
      <section id="algorithms" className="py-20 lg:py-24 border-b border-[#233D4D]/40 bg-[#0B1015]">
        <div className="max-w-[1380px] mx-auto px-6 lg:px-10 space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-xl space-y-3">
              <span className="text-[12px] font-mono uppercase tracking-widest text-[#FE7F2D]">
                02 · Mathematical Core
              </span>
              <h2 className="font-display text-[28px] lg:text-[36px] font-bold tracking-tight text-[#EAECEF]">
                Clear separation between feature math and deep learning.
              </h2>
            </div>
            <button
              type="button"
              onClick={() => enterDashboard('comparison')}
              className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-[#FE7F2D] hover:text-[#FF9A57] cursor-pointer"
            >
              <span>Inspect Method Comparison Matrix</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div id="modules" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Wide Marquee Card: SVD */}
            <div className="lg:col-span-7 p-8 rounded-2xl border border-[#233D4D] bg-[#111A22] flex flex-col justify-between gap-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-[#233D4D] flex items-center justify-center text-[#FE7F2D]">
                    <Layers3 className="w-5 h-5" />
                  </div>
                  <span className="font-mono text-[12px] text-[#8FA3B3]">
                    NumPy Linear Algebra · Cached
                  </span>
                </div>
                <h3 className="font-display text-[22px] font-bold text-[#EAECEF]">
                  Singular Value Decomposition &amp; Energy Decay
                </h3>
                <p className="text-[14px] text-[#9BB0C1] leading-relaxed max-w-xl">
                  Compute full matrix decompositions once per image, then interactively reconstruct rank-k approximations with exact Frobenius energy retention, Mean Squared Error, PSNR, and SSIM evaluation.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-5 border-t border-[#233D4D]/65 font-mono">
                <div>
                  <span className="text-[11px] text-[#7D95A8] block">Energy Metric</span>
                  <span className="text-[16px] font-semibold text-[#EAECEF]">Σσᵢ² / ‖A‖²</span>
                </div>
                <div>
                  <span className="text-[11px] text-[#7D95A8] block">Quality Audit</span>
                  <span className="text-[16px] font-semibold text-[#FE7F2D]">PSNR · SSIM</span>
                </div>
                <div>
                  <span className="text-[11px] text-[#7D95A8] block">Storage Gain</span>
                  <span className="text-[16px] font-semibold text-[#EAECEF]">k(m+n+1)</span>
                </div>
              </div>
            </div>

            {/* Right Stack: PCA & Multi-Domain Features */}
            <div className="lg:col-span-5 grid grid-cols-1 gap-6">
              <div className="p-7 rounded-2xl border border-[#233D4D]/80 bg-[#10171E] space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#233D4D]/80 flex items-center justify-center text-[#EAECEF]">
                    <ScanSearch className="w-5 h-5 text-[#FE7F2D]" />
                  </div>
                  <span className="font-mono text-[11px] text-[#8FA3B3]">22 Descriptors</span>
                </div>
                <h3 className="font-display text-[18px] font-bold text-[#EAECEF]">
                  Multi-Domain Feature Matrix
                </h3>
                <p className="text-[13.5px] text-[#8FA3B3] leading-relaxed">
                  Combine statistical moments, GLCM contrast/homogeneity, LBP histograms, Sobel/Canny edges, Hu moments, 2D DCT energy ratios, and Haar wavelet bands into one downloadable feature vector.
                </p>
              </div>

              <div className="p-7 rounded-2xl border border-[#233D4D]/80 bg-[#10171E] space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#233D4D]/80 flex items-center justify-center text-[#EAECEF]">
                    <Brain className="w-5 h-5 text-[#FE7F2D]" />
                  </div>
                  <span className="font-mono text-[11px] text-[#8FA3B3]">Separate Optional Module</span>
                </div>
                <h3 className="font-display text-[18px] font-bold text-[#EAECEF]">
                  Brain MRI Deep-Learning Benchmark
                </h3>
                <p className="text-[13.5px] text-[#8FA3B3] leading-relaxed">
                  Dedicated PyTorch ResNet50 evaluation module strictly isolated from PCA/SVD math. Honest checkpoint gating ensures zero fabricated predictions when trained weights are absent.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* SECTION 03: ARCHITECTURE & FINAL CONVERSION                          */}
      {/* =================================================================== */}
      <section id="architecture" className="py-20 lg:py-24">
        <div className="max-w-[1380px] mx-auto px-6 lg:px-10">
          <div className="rounded-3xl border border-[#233D4D] bg-gradient-to-br from-[#121D26] via-[#10171E] to-[#0C1116] p-8 lg:p-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-10">
            <div className="space-y-4 max-w-2xl">
              <div className="inline-flex items-center gap-2 font-mono text-[12px] text-[#FE7F2D]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ready for Empirical Research</span>
              </div>
              <h2 className="font-display text-[28px] lg:text-[34px] font-bold tracking-tight text-[#EAECEF]">
                Enter the ImageLab workstation and run your first matrix decomposition.
              </h2>
              <p className="text-[14.5px] text-[#8FA3B3] leading-relaxed">
                Upload any PNG, JPEG, or medical slice—or generate deterministic Shepp-Logan, Radial Target, and Cell calibration phantoms directly on the server.
              </p>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-[12.5px] font-mono text-[#9BB0C1]">
                <span className="inline-flex items-center gap-2">
                  <ImagePlus className="w-3.5 h-3.5 text-[#FE7F2D]" />
                  OpenCV Preprocessing
                </span>
                <span className="inline-flex items-center gap-2">
                  <FlaskConical className="w-3.5 h-3.5 text-[#FE7F2D]" />
                  SQLite Experiment Logs
                </span>
                <span className="inline-flex items-center gap-2">
                  <FileChartColumn className="w-3.5 h-3.5 text-[#FE7F2D]" />
                  ReportLab PDF &amp; CSV Export
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 shrink-0">
              <button
                type="button"
                onClick={() => enterDashboard('workspace')}
                className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#FE7F2D] hover:bg-[#E86D1F] text-[#090B0E] text-[14px] font-bold transition-colors cursor-pointer"
              >
                <span>Open Image Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => enterDashboard('overview')}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-[#233D4D] bg-[#16232D] hover:border-[#EAECEF]/40 text-[#EAECEF] text-[14px] font-semibold transition-colors cursor-pointer"
              >
                <span>General Overview</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-[#233D4D]/45 py-8">
        <div className="max-w-[1380px] mx-auto px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12.5px] text-[#7D95A8]">
          <div className="flex items-center gap-2.5">
            <Layers3 className="w-4 h-4 text-[#FE7F2D]" />
            <span className="font-display font-semibold text-[#EAECEF]">ImageLab</span>
            <span aria-hidden="true">·</span>
            <span>Linear Transformation &amp; SVD Research Platform</span>
          </div>
          <span className="font-mono text-[11.5px]">
            Academic &amp; Engineering Use · Non-Diagnostic Research Tool
          </span>
        </div>
      </footer>
    </div>
  );
};
