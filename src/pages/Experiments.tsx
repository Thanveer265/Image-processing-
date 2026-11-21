import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  Search,
  Trash2,
  Eye,
  Copy,
  Plus,
  ArrowUpDown,
  Download,
  X,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ExperimentRecord } from '../types';

export const Experiments: React.FC = () => {
  const {
    experiments,
    inspectExperimentId,
    setInspectExperimentId,
    refreshExperiments,
    deleteExperiment,
    saveExperimentRecord,
    setActiveTab,
    showToast,
  } = useWorkspace();

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('All');
  const [sortField, setSortField] = useState<'created_at' | 'name' | 'primary_method'>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [activeModalExp, setActiveModalExp] = useState<ExperimentRecord | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!inspectExperimentId) return;
    const found = experiments.find(e => e.id === inspectExperimentId);
    if (found) {
      setActiveModalExp(found);
      setInspectExperimentId(null);
    }
  }, [inspectExperimentId, experiments, setInspectExperimentId]);

  useEffect(() => {
    if (!activeModalExp) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveModalExp(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModalExp]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshExperiments();
      showToast('Refreshed experiment registry', 'info');
    } finally {
      setRefreshing(false);
    }
  };

  const filtered = experiments.filter(exp => {
    const matchesSearch =
      exp.name.toLowerCase().includes(search.toLowerCase()) ||
      exp.id.toLowerCase().includes(search.toLowerCase()) ||
      exp.dataset_name.toLowerCase().includes(search.toLowerCase());
    const matchesMethod =
      methodFilter === 'All' || exp.primary_method.toLowerCase() === methodFilter.toLowerCase();
    return matchesSearch && matchesMethod;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = String(a[sortField] ?? '');
    const bVal = String(b[sortField] ?? '');
    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });

  const handleDuplicate = async (exp: ExperimentRecord) => {
    await saveExperimentRecord({
      name: `${exp.name} (Copy)`,
      input_image_ids: exp.input_image_ids,
      dataset_name: exp.dataset_name,
      selected_methods: exp.selected_methods,
      primary_method: exp.primary_method,
      processing_params: exp.processing_params,
      feature_settings: exp.feature_settings,
      pca_settings: exp.pca_settings,
      svd_rank: exp.svd_rank,
      results: exp.results,
      metrics: exp.metrics,
      model_version: exp.model_version,
      notes: exp.notes,
    });
  };

  const handleExportJSON = (exp: ExperimentRecord) => {
    const blob = new Blob([JSON.stringify(exp, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `${exp.id}_record.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Exported ${exp.id} as JSON`, 'success');
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  return (
    <div className="space-y-6 max-w-[1380px] mx-auto pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3]">
          Persistent SQLite experiment registry surviving restarts
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl transition-colors cursor-pointer"
            title="Reload from SQLite"
          >
            <RefreshCw className={`w-4 h-4 text-[#FE7F2D] ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analysis')}
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] rounded-xl transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Analysis</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C90A0] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search experiments, datasets, IDs..."
            className="w-full h-10 bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl pl-10 pr-8 text-[13px] text-[#111C24] dark:text-[#EAECEF] placeholder-[#7C90A0] focus:outline-none focus:border-[#FE7F2D]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#7C90A0] hover:text-[#111C24] dark:hover:text-[#EAECEF] cursor-pointer"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="text-[#6D8090] dark:text-[#8FA3B3]">Method:</span>
            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="h-10 bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3 text-[13px] text-[#111C24] dark:text-[#EAECEF]"
            >
              <option value="All">All Methods</option>
              <option value="SVD">SVD</option>
              <option value="PCA">PCA</option>
              <option value="Features">Features</option>
              <option value="Comparison">Comparison</option>
              <option value="Medical">Medical</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#6D8090] dark:text-[#8FA3B3]">Sort:</span>
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value as 'created_at' | 'name' | 'primary_method')}
              className="h-10 bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] rounded-xl px-3 text-[13px] text-[#111C24] dark:text-[#EAECEF]"
            >
              <option value="created_at">Date Created</option>
              <option value="name">Name</option>
              <option value="primary_method">Method</option>
            </select>
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              className="h-10 flex items-center gap-1.5 px-3 rounded-xl text-[12px] font-mono text-[#526575] dark:text-[#EAECEF] hover:border-[#FE7F2D] bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] cursor-pointer"
              title={sortAsc ? 'Sorting ascending — click for descending' : 'Sorting descending — click for ascending'}
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-[#FE7F2D]" />
              <span>{sortAsc ? 'ASC' : 'DESC'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 overflow-hidden">
        {sorted.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#F2F4F7] dark:bg-[#16222B] border-b border-[#E5EBF0] dark:border-[#233D4D] text-[#526575] dark:text-[#8FA3B3]">
                <tr>
                  <th className="py-3.5 px-4">Experiment</th>
                  <th className="py-3.5 px-4">Image / Dataset</th>
                  <th className="py-3.5 px-4">Method</th>
                  <th className="py-3.5 px-4">Key Metrics</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Date</th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EBF0] dark:divide-[#233D4D]/60">
                {sorted.map(exp => (
                  <tr key={exp.id} className="hover:bg-[#F6F8FA] dark:hover:bg-[#16222B]/70">
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-[#111C24] dark:text-[#EAECEF] truncate max-w-[240px]">
                          {exp.name}
                        </span>
                        <span className="font-mono text-[11px] text-[#7D95A8]">{exp.id}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-[#526575] dark:text-[#8FA3B3] truncate max-w-[160px]">
                      {exp.dataset_name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[12px] font-semibold text-[#FE7F2D]">
                      {exp.primary_method}
                    </td>
                    <td className="py-3.5 px-4 text-[12px] font-mono text-[#6D8090] dark:text-[#8FA3B3] truncate max-w-[220px]">
                      {exp.svd_rank !== null && exp.svd_rank !== undefined && `rank=${exp.svd_rank} `}
                      {Object.entries(exp.metrics || {})
                        .slice(0, 2)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2EA876]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{exp.status}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[12px] text-[#7D95A8]">
                      {exp.created_at.slice(0, 10)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveModalExp(exp)}
                          className="p-2 rounded-lg text-[#526575] dark:text-[#8FA3B3] hover:text-[#FE7F2D] hover:bg-[#EAECEF] dark:hover:bg-[#1E3140] cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(exp)}
                          className="p-2 rounded-lg text-[#526575] dark:text-[#8FA3B3] hover:text-[#111C24] dark:hover:text-[#EAECEF] hover:bg-[#EAECEF] dark:hover:bg-[#1E3140] cursor-pointer"
                          title="Duplicate"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteExperiment(exp.id)}
                          className="p-2 rounded-lg text-[#526575] dark:text-[#8FA3B3] hover:text-[#E56B6B] hover:bg-[#EAECEF] dark:hover:bg-[#1E3140] cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-14 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[#EAECEF] dark:bg-[#233D4D] flex items-center justify-center text-[#FE7F2D]">
              <FlaskConical className="w-5 h-5" />
            </div>
            <span className="font-display text-[16px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
              No saved experiments yet
            </span>
            <p className="text-[13px] text-[#6D8090] dark:text-[#8FA3B3]">
              Run an analysis and click &ldquo;Save Run&rdquo; to persist results in SQLite.
            </p>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {activeModalExp && (
        <div
          onClick={() => setActiveModalExp(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5EBF0] dark:border-[#233D4D]">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[11.5px] font-mono text-[#FE7F2D] font-bold">
                  {activeModalExp.id}
                </span>
                <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] truncate">
                  {activeModalExp.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalExp(null)}
                className="p-1.5 rounded-lg text-[#7D95A8] hover:text-[#111C24] dark:hover:text-[#EAECEF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-[13px]">
              <div>
                <span className="text-[11.5px] font-mono text-[#6D8090] dark:text-[#8FA3B3] block">Dataset / Image</span>
                <span className="font-semibold text-[#111C24] dark:text-[#EAECEF]">{activeModalExp.dataset_name}</span>
              </div>

              {activeModalExp.notes && (
                <div className="p-3.5 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] text-[#526575] dark:text-[#8FA3B3] italic">
                  {activeModalExp.notes}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold">SQLite Experiment Payload</span>
                  <button
                    type="button"
                    onClick={() => handleExportJSON(activeModalExp)}
                    className="text-[12px] text-[#FE7F2D] font-semibold flex items-center gap-1.5 hover:underline cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON</span>
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-[#070A0D] text-[#8FB4D4] font-mono text-[11px] overflow-x-auto max-h-56 border border-[#233D4D]/70">
                  {JSON.stringify(activeModalExp, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-[#E5EBF0] dark:border-[#233D4D] flex justify-end bg-[#F2F4F7] dark:bg-[#16222B]">
              <button
                type="button"
                onClick={() => setActiveModalExp(null)}
                className="px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] rounded-xl hover:bg-[#EAECEF] dark:hover:bg-[#233D4D] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
