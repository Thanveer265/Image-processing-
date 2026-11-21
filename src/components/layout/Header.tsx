import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Search,
  Database,
  ArrowRight,
  Menu,
  AlertCircle,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { TabType } from '../../types';

const tabTitles: Record<TabType, { title: string; subtitle: string }> = {
  overview: {
    title: 'General overview',
    subtitle: 'OpenCV, NumPy SVD, and scikit-learn workspace',
  },
  workspace: {
    title: 'Image workspace',
    subtitle: 'Upload, inspect pixels, and preprocess matrices',
  },
  features: {
    title: 'Feature extraction',
    subtitle: '22 statistical, GLCM, LBP, edge, shape, and frequency descriptors',
  },
  analysis: {
    title: 'PCA & SVD analysis',
    subtitle: 'Low-rank matrix decomposition and multi-sample subspace projection',
  },
  medical: {
    title: 'Medical MRI analysis',
    subtitle: 'Separate ResNet50 deep-learning classification module',
  },
  comparison: {
    title: 'Method comparison',
    subtitle: 'Comparative feature and SVD reconstruction benchmarks',
  },
  experiments: {
    title: 'Experiments registry',
    subtitle: 'Persisted SQLite empirical parameter and metric logs',
  },
  reports: {
    title: 'Scientific reports',
    subtitle: 'Automated ReportLab PDF and CSV research exports',
  },
  settings: {
    title: 'Platform settings',
    subtitle: 'Appearance preferences and live backend runtime',
  },
};

export const Header: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    setActiveAnalysisSubTab,
    theme,
    toggleTheme,
    activeImage,
    toggleSidebar,
    backendError,
    showToast,
  } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');

  const currentInfo = tabTitles[activeTab] || {
    title: 'ImageLab',
    subtitle: 'Research Workspace',
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    const q = trimmed.toLowerCase();

    let target: TabType = 'workspace';
    if (q.includes('pca')) {
      setActiveAnalysisSubTab('PCA');
      target = 'analysis';
    } else if (q.includes('svd') || q.includes('rank') || q.includes('singular') || q.includes('recon')) {
      setActiveAnalysisSubTab('SVD');
      target = 'analysis';
    } else if (
      q.includes('feat') ||
      q.includes('glcm') ||
      q.includes('edge') ||
      q.includes('lbp') ||
      q.includes('sobel') ||
      q.includes('canny') ||
      q.includes('shape') ||
      q.includes('dct') ||
      q.includes('wavelet') ||
      q.includes('freq') ||
      q.includes('texture')
    ) {
      target = 'features';
    } else if (q.includes('mri') || q.includes('brain') || q.includes('tumor') || q.includes('med') || q.includes('resnet')) {
      target = 'medical';
    } else if (q.includes('compare') || q.includes('bench')) {
      target = 'comparison';
    } else if (q.includes('exp') || q.includes('log') || q.includes('history')) {
      target = 'experiments';
    } else if (q.includes('rep') || q.includes('pdf') || q.includes('csv') || q.includes('export')) {
      target = 'reports';
    } else if (q.includes('set') || q.includes('theme') || q.includes('dark') || q.includes('health')) {
      target = 'settings';
    } else if (q.includes('over') || q.includes('home') || q.includes('dash')) {
      target = 'overview';
    } else {
      target = 'workspace';
    }

    setActiveTab(target);
    showToast(`Navigated to ${tabTitles[target].title}`, 'info');
    setSearchQuery('');
  };

  return (
    <header className="sticky top-0 z-20 h-20 px-6 lg:px-10 flex items-center justify-between gap-6 bg-[#F2F4F7]/92 dark:bg-[#090B0E]/92 backdrop-blur-md border-b border-[#DCE3EA]/70 dark:border-[#233D4D]/45 transition-colors">
      {/* Left: Spacious Editorial Section Title */}
      <div className="flex items-center gap-4 min-w-0">
        <button
          type="button"
          onClick={toggleSidebar}
          className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#D8E0E6] dark:border-[#233D4D] bg-[#FFFFFF] dark:bg-[#111920] text-[#526575] dark:text-[#8FA3B3] hover:text-[#FE7F2D] md:hidden shrink-0"
          title="Toggle Navigation Menu"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-4.5 h-4.5" />
        </button>

        <div className="min-w-0">
          <h1 className="font-display text-[21px] md:text-[24px] font-bold tracking-tight text-[#111C24] dark:text-[#EAECEF] truncate leading-tight">
            {currentInfo.title}
          </h1>
          <p className="text-[12.5px] text-[#526575] dark:text-[#8FA3B3] truncate mt-0.5 hidden sm:block">
            {currentInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Center: Spacious Search Bar */}
      <form onSubmit={handleSearchSubmit} className="hidden lg:flex items-center relative max-w-[340px] w-full">
        <Search className="w-4 h-4 absolute left-3.5 text-[#7C90A0] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search SVD, PCA, GLCM, MRI, reports..."
          className="w-full h-10 bg-[#FFFFFF] dark:bg-[#111920] border border-[#D8E0E6] dark:border-[#233D4D]/80 rounded-xl pl-10 pr-8 text-[13px] text-[#111C24] dark:text-[#EAECEF] placeholder-[#7C90A0] focus:outline-none focus:border-[#FE7F2D] transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 p-1 rounded-lg text-[#7C90A0] hover:text-[#111C24] dark:hover:text-[#EAECEF]"
            title="Clear search"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </form>

      {/* Right: Breathable Utility Controls */}
      <div className="flex items-center gap-3 shrink-0">
        {backendError && (
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold bg-[#D94F4F]/12 text-[#E56B6B] border border-[#D94F4F]/35 hover:bg-[#D94F4F]/20 transition-colors cursor-pointer"
            title={backendError}
          >
            <AlertCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Backend Offline</span>
          </button>
        )}

        {activeImage && (
          <button
            type="button"
            onClick={() => setActiveTab('workspace')}
            className="hidden xl:flex items-center gap-2.5 h-10 px-3.5 rounded-xl border border-[#D8E0E6] dark:border-[#233D4D]/80 bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] transition-colors cursor-pointer"
            title="Inspect active image in Workspace"
          >
            <Database className="w-3.5 h-3.5 text-[#FE7F2D] shrink-0" />
            <span className="max-w-[135px] truncate text-[12.5px] font-semibold text-[#111C24] dark:text-[#EAECEF]">
              {activeImage.filename}
            </span>
            <span className="text-[11px] font-mono text-[#7C90A0]">
              {activeImage.width}×{activeImage.height}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="w-10 h-10 rounded-xl border border-[#D8E0E6] dark:border-[#233D4D]/80 bg-[#FFFFFF] dark:bg-[#111920] text-[#526575] dark:text-[#EAECEF] hover:border-[#FE7F2D] hover:text-[#FE7F2D] flex items-center justify-center transition-colors cursor-pointer"
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} theme`}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>

        {activeTab !== 'features' && (
          <button
            type="button"
            onClick={() => setActiveTab('features')}
            className="whitespace-nowrap shrink-0 h-10 flex items-center gap-2 px-4 rounded-xl text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] transition-colors cursor-pointer"
          >
            <span className="hidden sm:inline">Extract Features</span>
            <span className="sm:hidden">Extract</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
