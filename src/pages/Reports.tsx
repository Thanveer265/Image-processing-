import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  CheckSquare,
  Square,
  Printer,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { downloadFileFromApi, generateReport, resolveApiUrl } from '../services/api';

export const Reports: React.FC = () => {
  const {
    experiments,
    reports,
    refreshReports,
    activeImage,
    svdResult,
    showToast,
  } = useWorkspace();

  const [title, setTitle] = useState('ImageLab Technical Analysis Report');
  const [reportType, setReportType] = useState<'summary' | 'svd' | 'pca' | 'features' | 'medical' | 'comparison' | 'full'>('summary');
  const [selectedExpIds, setSelectedExpIds] = useState<string[]>([]);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeMetrics, setIncludeMetrics] = useState(true);
  const [authorName, setAuthorName] = useState('Laboratory Research Associate');
  const [notes, setNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const validIds = new Set(experiments.map(e => e.id));
    setSelectedExpIds(prev => {
      const cleaned = prev.filter(id => validIds.has(id));
      if (cleaned.length === 0 && experiments.length > 0) {
        return experiments.slice(0, 5).map(e => e.id);
      }
      return cleaned;
    });
  }, [experiments]);

  const toggleSelectExp = (id: string) => {
    setSelectedExpIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleDownloadExisting = async (downloadUrl: string, filename: string) => {
    try {
      await downloadFileFromApi(downloadUrl, filename);
      showToast(`Downloaded ${filename}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Download failed', 'error');
    }
  };

  const handleGenerate = async (format: 'pdf' | 'csv') => {
    setIsGenerating(true);
    try {
      const created = await generateReport({
        title: title.trim() || 'ImageLab Analysis Report',
        report_type: reportType,
        format,
        experiment_ids: selectedExpIds,
        author: authorName.trim() || 'Researcher',
        include_charts: includeCharts,
        include_metrics: includeMetrics,
        notes: notes.trim() || null,
      });
      await refreshReports();
      showToast(`Generated ${format.toUpperCase()} report (${(created.file_size / 1024).toFixed(1)} KB)`, 'success');

      await downloadFileFromApi(created.download_url, `${created.id}.${format}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Report generation failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const activeExperiments = experiments.filter(e => selectedExpIds.includes(e.id));

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-1 print:hidden">
        <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3]">
          Generate real server-side PDF (ReportLab) and CSV reports from saved SQLite experiments
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleGenerate('csv')}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] disabled:opacity-50 rounded-xl cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#FE7F2D]" />
            <span>Generate CSV</span>
          </button>
          <button
            type="button"
            onClick={() => handleGenerate('pdf')}
            disabled={isGenerating}
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>{isGenerating ? 'Generating...' : 'Generate PDF'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#526575] dark:text-[#8FA3B3] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl hover:border-[#FE7F2D] cursor-pointer"
            title="Print report preview"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-5 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[13px]">
          <div>
            <label className="text-[11.5px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3] block mb-1.5">
              Report Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3.5 py-2 text-[13px]"
            />
          </div>

          <div>
            <label className="text-[11.5px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3] block mb-1.5">
              Report Category
            </label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value as 'summary' | 'svd' | 'pca' | 'features' | 'medical' | 'comparison' | 'full')}
              className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3.5 py-2 text-[13px]"
            >
              <option value="summary">Executive Summary</option>
              <option value="features">Feature Extraction Report</option>
              <option value="pca">PCA Analysis Report</option>
              <option value="svd">SVD Reconstruction Report</option>
              <option value="medical">Medical Analysis Report</option>
              <option value="comparison">Method Comparison Report</option>
              <option value="full">Full Research Dossier</option>
            </select>
          </div>

          <div>
            <label className="text-[11.5px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3] block mb-1.5">
              Author
            </label>
            <input
              type="text"
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
              className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3.5 py-2 text-[13px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional research notes or observations..."
            className="w-full bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3.5 py-2 text-[13px]"
          />
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMetrics}
                onChange={e => setIncludeMetrics(e.target.checked)}
                className="w-4 h-4 accent-[#FE7F2D] cursor-pointer"
              />
              <span>Include Metrics</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCharts}
                onChange={e => setIncludeCharts(e.target.checked)}
                className="w-4 h-4 accent-[#FE7F2D] cursor-pointer"
              />
              <span>Embed Visual Artifacts</span>
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-[#E5EBF0] dark:border-[#233D4D]/65 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-mono uppercase tracking-wider text-[#6D8090] dark:text-[#8FA3B3]">
              Saved Experiments ({selectedExpIds.length} / {experiments.length} selected)
            </span>
            {experiments.length > 0 && (
              <div className="flex items-center gap-3 text-[12px]">
                <button
                  type="button"
                  onClick={() => setSelectedExpIds(experiments.map(e => e.id))}
                  className="text-[#FE7F2D] font-semibold hover:underline cursor-pointer"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedExpIds([])}
                  className="text-[#6D8090] dark:text-[#8FA3B3] hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          {experiments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {experiments.map(exp => {
                const isSel = selectedExpIds.includes(exp.id);
                return (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => toggleSelectExp(exp.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-xl border transition-colors cursor-pointer ${
                      isSel
                        ? 'border-[#FE7F2D] bg-[#FE7F2D]/10 dark:bg-[#233D4D] text-[#D96014] dark:text-[#EAECEF] font-semibold'
                        : 'border-[#D8E0E6] dark:border-[#233D4D]/70 text-[#526575] dark:text-[#8FA3B3]'
                    }`}
                  >
                    {isSel ? <CheckSquare className="w-3.5 h-3.5 text-[#FE7F2D]" /> : <Square className="w-3.5 h-3.5" />}
                    <span>{exp.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-[12px] text-[#6D8090] dark:text-[#8FA3B3]">
              No saved experiments yet. Reports can still be generated as empty templates or after saving runs.
            </span>
          )}
        </div>
      </div>

      {/* Generated Reports Archive */}
      {reports.length > 0 && (
        <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-3 print:hidden">
          <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
            Generated Reports Archive ({reports.length})
          </span>
          <div className="divide-y divide-[#E5EBF0] dark:divide-[#233D4D]/60 text-[13px]">
            {reports.slice(0, 6).map(rep => (
              <div key={rep.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-semibold text-[#111C24] dark:text-[#EAECEF] block truncate">
                    {rep.title}
                  </span>
                  <span className="text-[11.5px] font-mono text-[#7D95A8]">
                    {rep.format.toUpperCase()} · {(rep.file_size / 1024).toFixed(1)} KB · {rep.created_at.slice(0, 16)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadExisting(rep.download_url, `${rep.id}.${rep.format}`)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold text-[#111C24] dark:text-[#EAECEF] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl hover:border-[#FE7F2D] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#FE7F2D]" />
                  <span>Download</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document Preview (Crisp Printable White Paper) */}
      <div className="p-8 md:p-10 rounded-2xl border bg-white text-[#111C24] border-[#D8E0E6] shadow-xs space-y-6 print:p-0 print:border-none print:shadow-none">
        <div className="border-b-2 border-[#233D4D] pb-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[#526575] uppercase tracking-widest font-mono">
            <span>ImageLab Technical Dossier</span>
            <span>Date: {new Date().toLocaleDateString()}</span>
          </div>
          <h1 className="font-display text-[24px] font-bold tracking-tight text-[#111C24]">{title}</h1>
          <div className="text-[12.5px] text-[#526575]">
            <strong>Investigator:</strong> {authorName} · <strong>Active Image:</strong>{' '}
            {activeImage?.filename || 'None'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#F2F4F7] border border-[#D8E0E6] text-[12.5px] leading-relaxed text-[#111C24]">
          <strong>Scientific Scope Notice:</strong> Mathematical transformations (PCA, SVD, DCT, Wavelet, GLCM) characterize spatial and frequency signal properties and are not standalone clinical tumour diagnostic models.
        </div>

        {includeMetrics && (
          <div className="space-y-2.5">
            <h3 className="font-display text-[15px] font-bold text-[#111C24]">
              1. Selected SQLite Experiments ({activeExperiments.length})
            </h3>
            {activeExperiments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px] border border-[#D8E0E6]">
                  <thead className="bg-[#F2F4F7] text-[#111C24] font-semibold border-b border-[#D8E0E6]">
                    <tr>
                      <th className="py-2.5 px-3">Run ID</th>
                      <th className="py-2.5 px-3">Experiment</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3">Dataset</th>
                      <th className="py-2.5 px-3">Metrics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D8E0E6]">
                    {activeExperiments.map(exp => (
                      <tr key={exp.id}>
                        <td className="py-2 px-3 font-mono">{exp.id}</td>
                        <td className="py-2 px-3">{exp.name}</td>
                        <td className="py-2 px-3">{exp.primary_method}</td>
                        <td className="py-2 px-3 text-[#526575]">{exp.dataset_name}</td>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {Object.entries(exp.metrics || {})
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[12.5px] text-[#526575]">No experiments selected.</p>
            )}
          </div>
        )}

        {includeCharts && activeImage && (
          <div className="space-y-3">
            <h3 className="font-display text-[15px] font-bold text-[#111C24]">2. Visual Artifacts</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <img
                  src={resolveApiUrl(activeImage.file_url)}
                  alt="Original"
                  className="w-full aspect-square object-contain bg-black rounded-xl border border-[#D8E0E6]"
                />
                <span className="text-[11.5px] text-[#526575] block mt-1.5">Active Image</span>
              </div>
              {svdResult && (
                <>
                  <div>
                    <img
                      src={resolveApiUrl(svdResult.reconstructed_url)}
                      alt="SVD Reconstructed"
                      className="w-full aspect-square object-contain bg-black rounded-xl border border-[#D8E0E6]"
                    />
                    <span className="text-[11.5px] text-[#526575] block mt-1.5">
                      SVD Rank-{svdResult.rank}
                    </span>
                  </div>
                  <div>
                    <img
                      src={resolveApiUrl(svdResult.difference_url)}
                      alt="Residual Difference"
                      className="w-full aspect-square object-contain bg-black rounded-xl border border-[#D8E0E6]"
                    />
                    <span className="text-[11.5px] text-[#526575] block mt-1.5">Residual Heatmap</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
