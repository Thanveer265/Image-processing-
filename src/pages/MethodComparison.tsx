import React, { useState, useEffect } from 'react';
import { Play, Download, Sliders, BookmarkPlus, Info } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useWorkspace } from '../context/WorkspaceContext';
import { runComparison } from '../services/api';
import { ComparisonResponse } from '../types';

export const MethodComparison: React.FC = () => {
  const { activeImage, setActiveTab, theme, showToast, saveExperimentRecord } = useWorkspace();

  const [svdRank, setSvdRank] = useState<number>(16);
  const [dctRetention, setDctRetention] = useState<number>(25);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);

  const runBenchmark = async () => {
    if (!activeImage) return;
    setIsRunning(true);
    try {
      const res = await runComparison(activeImage.id, svdRank, dctRetention);
      setComparison(res);
      showToast(`Benchmark completed in ${res.processing_time_ms} ms`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Comparison failed', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    setComparison(null);
    if (activeImage) {
      const maxAllowed = Math.max(1, Math.min(64, activeImage.width, activeImage.height));
      setSvdRank(prev => Math.max(1, Math.min(prev, maxAllowed)));
    }
  }, [activeImage?.id, activeImage?.width, activeImage?.height]);

  const handleSaveComparison = async () => {
    if (!activeImage || !comparison) return;
    const svdItem = comparison.items.find(i => i.method.startsWith('SVD'));
    await saveExperimentRecord({
      name: `${activeImage.filename} - Method Benchmark`,
      input_image_ids: [activeImage.id],
      dataset_name: activeImage.filename,
      selected_methods: comparison.items.map(i => i.method),
      primary_method: 'Comparison',
      svd_rank: svdRank,
      metrics: {
        processingTimeMs: comparison.processing_time_ms,
        svd_mse: svdItem?.mse ?? null,
        svd_psnr: svdItem?.psnr ?? null,
        svd_energy: svdItem?.retained_energy ?? null,
      },
      results: { items: comparison.items },
      notes: `Compared ${comparison.items.length} mathematical representations on ${activeImage.filename}.`,
    });
  };

  const handleExportCSV = () => {
    if (!comparison) return;
    const headers = [
      'Method',
      'Category',
      'Dimensions',
      'Latency (ms)',
      'Memory (KB)',
      'MSE',
      'PSNR (dB)',
      'Retained Energy (%)',
      'Compression Ratio',
    ];
    const rows = comparison.items.map(r => [
      `"${r.method}"`,
      `"${r.category}"`,
      r.dimension ?? '',
      r.processing_time_ms,
      r.memory_kb ?? '',
      r.mse ?? '',
      r.psnr ?? '',
      r.retained_energy ?? '',
      r.compression_ratio ?? '',
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `imagelab_comparison_${activeImage?.id || 'image'}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Exported benchmark CSV', 'success');
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const chartStroke = theme === 'dark' ? '#233D4D' : '#D8E0E6';
  const chartText = theme === 'dark' ? '#8FA3B3' : '#526575';

  const energyChartItems = (comparison?.items || []).filter(i => i.retained_energy !== null);
  const latencyChartItems = comparison?.items || [];

  return (
    <div className="space-y-6 max-w-[1380px] mx-auto pb-12">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3]">
          Real backend benchmarking across Raw Matrix, Feature Descriptors, 2D DCT, SVD, and fitted PCA
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!comparison}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] disabled:opacity-50 rounded-xl cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#FE7F2D]" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handleSaveComparison}
            disabled={!comparison}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF] bg-[#FFFFFF] dark:bg-[#111920] hover:border-[#FE7F2D] border border-[#D8E0E6] dark:border-[#233D4D] disabled:opacity-50 rounded-xl cursor-pointer"
          >
            <BookmarkPlus className="w-4 h-4 text-[#FE7F2D]" />
            <span>Save Run</span>
          </button>
          <button
            type="button"
            onClick={runBenchmark}
            disabled={isRunning || !activeImage}
            className="flex items-center gap-2 px-5 py-2 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{isRunning ? 'Benchmarking...' : 'Run Benchmark'}</span>
          </button>
        </div>
      </div>

      {/* Parameters */}
      <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-semibold text-[#111C24] dark:text-[#EAECEF]">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-[#FE7F2D]" />
            <span className="font-display text-[15px] font-bold">Benchmark Parameters</span>
          </div>
          <span className="text-[12px] font-mono text-[#7D95A8]">
            Target: {activeImage ? activeImage.filename : 'No active image'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 text-[13px]">
          <div className="p-4 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">SVD Rank (k)</span>
              <span className="font-mono font-bold text-[#FE7F2D]">{svdRank}</span>
            </div>
            <input
              type="range"
              min={1}
              max={activeImage ? Math.min(64, activeImage.width, activeImage.height) : 64}
              value={svdRank}
              onChange={e => setSvdRank(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
          </div>

          <div className="p-4 rounded-xl bg-[#F2F4F7] dark:bg-[#16222B] border border-[#D8E0E6] dark:border-[#233D4D] space-y-2">
            <div className="flex justify-between">
              <span className="font-medium">2D DCT Coefficient Retention</span>
              <span className="font-mono font-bold text-[#FE7F2D]">{dctRetention}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={80}
              value={dctRetention}
              onChange={e => setDctRetention(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
          </div>
        </div>
      </div>

      {comparison ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
              <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
                Execution Latency by Method (ms)
              </span>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latencyChartItems} margin={{ top: 5, right: 12, left: -16, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartStroke} />
                    <XAxis
                      dataKey="method"
                      stroke={chartText}
                      fontSize={10}
                      tickLine={false}
                      interval={0}
                      angle={-16}
                      textAnchor="end"
                    />
                    <YAxis stroke={chartText} fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'dark' ? '#0D141A' : '#FFFFFF',
                        borderColor: '#233D4D',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="processing_time_ms" name="Latency (ms)" fill="#FE7F2D" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
              <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
                Retained Energy / Variance (%) &amp; PSNR (dB)
              </span>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={energyChartItems} margin={{ top: 5, right: 12, left: -16, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartStroke} />
                    <XAxis
                      dataKey="method"
                      stroke={chartText}
                      fontSize={10}
                      tickLine={false}
                      interval={0}
                      angle={-16}
                      textAnchor="end"
                    />
                    <YAxis stroke={chartText} fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme === 'dark' ? '#0D141A' : '#FFFFFF',
                        borderColor: '#233D4D',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="retained_energy" name="Retained Energy %" fill="#FE7F2D" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="psnr" name="PSNR (dB)" fill="#7695B8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
            <span className="font-display text-[15px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
              Measured Method Comparison Table
            </span>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#F2F4F7] dark:bg-[#16222B] border-b border-[#E5EBF0] dark:border-[#233D4D] text-[#526575] dark:text-[#8FA3B3]">
                  <tr>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right font-mono">Dims</th>
                    <th className="py-3 px-4 text-right font-mono">Latency (ms)</th>
                    <th className="py-3 px-4 text-right font-mono">MSE</th>
                    <th className="py-3 px-4 text-right font-mono">PSNR (dB)</th>
                    <th className="py-3 px-4 text-right font-mono">Energy / Var</th>
                    <th className="py-3 px-4 text-right font-mono">Compression</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EBF0] dark:divide-[#233D4D]/60">
                  {comparison.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-[#F6F8FA] dark:hover:bg-[#16222B]/70">
                      <td className="py-3 px-4 font-semibold text-[#111C24] dark:text-[#EAECEF]">
                        {item.method}
                      </td>
                      <td className="py-3 px-4 text-[12px] text-[#526575] dark:text-[#8FA3B3]">{item.category}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#526575] dark:text-[#8FA3B3]">
                        {item.dimension ?? '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#526575] dark:text-[#8FA3B3]">
                        {item.processing_time_ms}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {item.mse !== null && item.mse !== undefined ? item.mse : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#FE7F2D]">
                        {item.mse === 0
                          ? 'Exact'
                          : item.psnr !== null && item.psnr !== undefined
                          ? item.psnr
                          : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#2EA876]">
                        {item.retained_energy !== null && item.retained_energy !== undefined
                          ? `${item.retained_energy}%`
                          : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {item.compression_ratio !== null && item.compression_ratio !== undefined
                          ? `${item.compression_ratio}×`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-5 rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 flex items-start gap-3 text-[12.5px] text-[#526575] dark:text-[#8FA3B3]">
            <Info className="w-4 h-4 text-[#FE7F2D] shrink-0 mt-0.5" />
            <div>
              <span className="font-display font-bold text-[#111C24] dark:text-[#EAECEF] block mb-0.5">
                PCA &amp; Medical Evaluation Availability
              </span>
              <span>
                {comparison.pca_available
                  ? 'Active fitted PCA subspace was included in this comparison.'
                  : 'PCA was omitted because no multi-sample PCA model is fitted yet (fit one in PCA & SVD Analysis).'}{' '}
                {comparison.medical_evaluation_message}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="p-14 text-center rounded-3xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 space-y-4">
          <span className="font-display text-[17px] font-bold text-[#111C24] dark:text-[#EAECEF] block">
            {activeImage ? `Benchmark Ready for ${activeImage.filename}` : 'No Active Image'}
          </span>
          <p className="text-[13.5px] text-[#526575] dark:text-[#8FA3B3] max-w-md mx-auto">
            {activeImage
              ? 'Click "Run Benchmark" to execute real timed mathematical extraction, 2D DCT truncation, SVD reconstruction, and PCA projection on the backend.'
              : 'Upload an image or generate a calibration phantom in Image Workspace first.'}
          </p>
          {activeImage ? (
            <button
              type="button"
              onClick={runBenchmark}
              disabled={isRunning}
              className="px-6 py-2.5 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] disabled:opacity-50 rounded-xl cursor-pointer"
            >
              {isRunning ? 'Benchmarking...' : 'Run Benchmark'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('workspace')}
              className="px-6 py-2.5 text-[13px] font-bold text-[#090B0E] bg-[#FE7F2D] hover:bg-[#E86D1F] rounded-xl cursor-pointer"
            >
              Go to Image Workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
};
