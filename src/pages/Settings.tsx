import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  RefreshCw,
  Server,
  AlertCircle,
  Box,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { API_BASE_URL } from '../services/api';

export const Settings: React.FC = () => {
  const {
    themeMode,
    setThemeMode,
    experiments,
    images,
    reports,
    healthStatus,
    backendError,
    refreshAllBackendState,
    openLanding,
    showToast,
  } = useWorkspace();

  const [refreshing, setRefreshing] = useState(false);

  const handleSelectTheme = (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    const label = mode === 'system' ? 'System preference' : `${mode[0].toUpperCase()}${mode.slice(1)} theme`;
    showToast(`Switched appearance to ${label}`, 'info');
  };

  const handleRefreshBackend = async () => {
    setRefreshing(true);
    try {
      const h = await refreshAllBackendState();
      if (h) {
        showToast(`Backend online (v${h.version}) — SQLite ${h.database_connected ? 'connected' : 'degraded'}`, 'success');
      } else {
        showToast('Unable to reach FastAPI backend', 'error');
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-16">
      <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3]">
        Application appearance preferences and FastAPI backend connection diagnostics
      </p>

      {/* 1. Appearance */}
      <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
        <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
          Appearance
        </span>

        <div className="grid grid-cols-3 gap-3.5 text-[13px]">
          <button
            type="button"
            onClick={() => handleSelectTheme('light')}
            className={`p-4 rounded-xl border text-left flex items-center justify-between transition-colors cursor-pointer ${
              themeMode === 'light'
                ? 'border-[#FE7F2D] bg-[#FE7F2D]/10 dark:bg-[#233D4D] text-[#D96014] dark:text-[#EAECEF] font-semibold'
                : 'border-[#D8E0E6] dark:border-[#233D4D]/70 text-[#526575] dark:text-[#8FA3B3] hover:border-[#FE7F2D]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Sun className="w-4 h-4 text-[#FE7F2D]" />
              <span>Light</span>
            </div>
            {themeMode === 'light' && <CheckCircle2 className="w-4 h-4 text-[#FE7F2D]" />}
          </button>

          <button
            type="button"
            onClick={() => handleSelectTheme('dark')}
            className={`p-4 rounded-xl border text-left flex items-center justify-between transition-colors cursor-pointer ${
              themeMode === 'dark'
                ? 'border-[#FE7F2D] bg-[#FE7F2D]/10 dark:bg-[#233D4D] text-[#D96014] dark:text-[#EAECEF] font-semibold'
                : 'border-[#D8E0E6] dark:border-[#233D4D]/70 text-[#526575] dark:text-[#8FA3B3] hover:border-[#FE7F2D]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Moon className="w-4 h-4 text-[#FE7F2D]" />
              <span>Dark</span>
            </div>
            {themeMode === 'dark' && <CheckCircle2 className="w-4 h-4 text-[#FE7F2D]" />}
          </button>

          <button
            type="button"
            onClick={() => handleSelectTheme('system')}
            className={`p-4 rounded-xl border text-left flex items-center justify-between transition-colors cursor-pointer ${
              themeMode === 'system'
                ? 'border-[#FE7F2D] bg-[#FE7F2D]/10 dark:bg-[#233D4D] text-[#D96014] dark:text-[#EAECEF] font-semibold'
                : 'border-[#D8E0E6] dark:border-[#233D4D]/70 text-[#526575] dark:text-[#8FA3B3] hover:border-[#FE7F2D]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Laptop className="w-4 h-4 text-[#FE7F2D]" />
              <span>System</span>
            </div>
            {themeMode === 'system' && <CheckCircle2 className="w-4 h-4 text-[#FE7F2D]" />}
          </button>
        </div>
      </div>

      {/* 2. Backend Connection */}
      <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] flex items-center gap-2.5">
            <Server className="w-4 h-4 text-[#FE7F2D]" />
            <span>Python FastAPI Backend</span>
          </span>

          <button
            type="button"
            onClick={handleRefreshBackend}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-[12px] font-semibold rounded-xl border border-[#D8E0E6] dark:border-[#233D4D] hover:border-[#FE7F2D] disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#FE7F2D] ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        <div className="p-4 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] space-y-2.5">
          <div className="flex justify-between">
            <span className="text-[#6D8090] dark:text-[#8FA3B3]">API Base URL:</span>
            <span className="font-mono text-[#111C24] dark:text-[#EAECEF]">{API_BASE_URL}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6D8090] dark:text-[#8FA3B3]">Service Status:</span>
            {healthStatus ? (
              <span className="font-mono font-semibold text-[#2EA876] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {healthStatus.status.toUpperCase()} (v{healthStatus.version})
              </span>
            ) : (
              <span className="font-mono font-semibold text-[#E56B6B] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                UNREACHABLE
              </span>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-[#6D8090] dark:text-[#8FA3B3]">SQLite Database:</span>
            <span className="font-mono">
              {healthStatus?.database_connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6D8090] dark:text-[#8FA3B3]">Medical ResNet50 Model:</span>
            <span className="font-mono">
              {healthStatus?.medical_model_configured ? 'Configured' : 'Not Configured'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6D8090] dark:text-[#8FA3B3]">Persisted Records:</span>
            <span className="font-mono text-[#FE7F2D]">
              {images.length} images · {experiments.length} experiments · {reports.length} reports
            </span>
          </div>
        </div>

        {backendError && (
          <div className="p-3 rounded-xl bg-[#E56B6B]/10 border border-[#E56B6B]/30 text-[12px] text-[#E56B6B]">
            {backendError}
          </div>
        )}
      </div>

      {/* 3. About & 3D Showcase Link */}
      <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-3 text-[13px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF]">
            ImageLab Research Platform
          </span>
          <button
            type="button"
            onClick={openLanding}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#FE7F2D] hover:underline cursor-pointer"
          >
            <Box className="w-3.5 h-3.5" />
            <span>Return to 3D Showcase</span>
          </button>
        </div>
        <p className="text-[#526575] dark:text-[#8FA3B3] leading-relaxed">
          Scientific image preprocessing, multi-domain feature extraction (Statistical, GLCM, LBP, Sobel/Canny/Laplacian, DCT, Wavelet), multi-sample PCA subspace modeling, cached NumPy SVD reconstruction, and optional PyTorch Brain MRI classification.
        </p>
      </div>
    </div>
  );
};
