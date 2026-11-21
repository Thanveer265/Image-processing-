import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, BarChart2, Download, AlertCircle } from 'lucide-react';
import { downloadFileFromApi, resolveApiUrl } from '../../services/api';
import { useWorkspace } from '../../context/WorkspaceContext';

interface ImageCanvasViewerProps {
  dataUrl: string;
  title?: string;
  subtitle?: string;
  className?: string;
  showHistogram?: boolean;
}

export const ImageCanvasViewer: React.FC<ImageCanvasViewerProps> = ({
  dataUrl,
  title,
  subtitle,
  className = '',
  showHistogram = false,
}) => {
  const { showToast } = useWorkspace();
  const [zoom, setZoom] = useState(1);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number; val: number } | null>(null);
  const [displayHistogram, setDisplayHistogram] = useState(false);
  const [pixelGrid, setPixelGrid] = useState<ImageData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const imgRef = useRef<HTMLImageElement>(null);
  const histCanvasRef = useRef<HTMLCanvasElement>(null);

  const resolvedSrc = resolveApiUrl(dataUrl);

  useEffect(() => {
    setZoom(1);
    setPixelGrid(null);
    setLoadError(false);
    setHoverCoord(null);
  }, [resolvedSrc]);

  const handleImageLoad = () => {
    setLoadError(false);
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = img.naturalWidth;
      offscreen.height = img.naturalHeight;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      setPixelGrid(ctx.getImageData(0, 0, offscreen.width, offscreen.height));
    } catch {
      setPixelGrid(null);
    }
  };

  const handleZoomIn = () => setZoom(z => Math.min(4, Number((z + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoom(z => Math.max(0.5, Number((z - 0.25).toFixed(2))));
  const handleReset = () => setZoom(1);
  const handleFit = () => setZoom(z => (z === 1 ? 1.5 : 1));

  const handleDownloadImage = async () => {
    if (!resolvedSrc) return;
    const slug = (title || 'imagelab_view')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    try {
      await downloadFileFromApi(resolvedSrc, `${slug || 'imagelab_image'}.png`);
      showToast(`Downloaded ${slug || 'image'}.png`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to download image', 'error');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current || !pixelGrid) return;
    const rect = imgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const normX = Math.max(0, Math.min(1, clientX / (rect.width || 1)));
    const normY = Math.max(0, Math.min(1, clientY / (rect.height || 1)));

    const x = Math.min(pixelGrid.width - 1, Math.floor(normX * pixelGrid.width));
    const y = Math.min(pixelGrid.height - 1, Math.floor(normY * pixelGrid.height));
    const idx = (y * pixelGrid.width + x) * 4;
    const r = pixelGrid.data[idx];
    const g = pixelGrid.data[idx + 1];
    const b = pixelGrid.data[idx + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    setHoverCoord({ x, y, val: lum });
  };

  useEffect(() => {
    if (!displayHistogram || !pixelGrid || !histCanvasRef.current) return;
    const canvas = histCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bins = new Array(256).fill(0);
    let maxBin = 0;
    const d = pixelGrid.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = Math.max(0, Math.min(255, Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])));
      bins[lum]++;
      if (bins[lum] > maxBin) maxBin = bins[lum];
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = canvas.width / 256;
    for (let i = 0; i < 256; i++) {
      const barHeight = (bins[i] / (maxBin || 1)) * (canvas.height - 4);
      ctx.fillStyle = '#FE7F2D';
      ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth, barHeight);
    }
  }, [displayHistogram, pixelGrid]);

  const showHeader = Boolean(title || subtitle || resolvedSrc);

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-[#FFFFFF] dark:bg-[#111920] border-[#D8E0E6] dark:border-[#233D4D]/80 overflow-hidden ${className}`}
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#E5EBF0] dark:border-[#233D4D]/65">
          <div className="flex flex-col min-w-0">
            {title && (
              <span className="font-display text-[13.5px] font-bold text-[#111C24] dark:text-[#EAECEF] truncate">
                {title}
              </span>
            )}
            {subtitle && (
              <span className="text-[11.5px] text-[#526575] dark:text-[#8FA3B3] truncate mt-0.5">
                {subtitle}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {showHistogram && (
              <button
                type="button"
                onClick={() => setDisplayHistogram(!displayHistogram)}
                disabled={!resolvedSrc || loadError}
                className={`p-2 rounded-lg text-[11px] transition-colors disabled:opacity-40 cursor-pointer ${
                  displayHistogram
                    ? 'bg-[#233D4D] text-[#FE7F2D]'
                    : 'text-[#526575] dark:text-[#8FA3B3] hover:bg-[#EAECEF] dark:hover:bg-[#192732]'
                }`}
                title="Toggle pixel intensity histogram"
                aria-label="Toggle pixel intensity histogram"
              >
                <BarChart2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={!resolvedSrc || zoom <= 0.5}
              className="p-2 rounded-lg text-[#526575] dark:text-[#8FA3B3] hover:bg-[#EAECEF] dark:hover:bg-[#192732] disabled:opacity-40 transition-colors cursor-pointer"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-[#6D8090] dark:text-[#8FA3B3] px-1 select-none min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={!resolvedSrc || zoom >= 4}
              className="p-2 rounded-lg text-[#526575] dark:text-[#8FA3B3] hover:bg-[#EAECEF] dark:hover:bg-[#192732] disabled:opacity-40 transition-colors cursor-pointer"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFit}
              disabled={!resolvedSrc}
              className="p-2 rounded-lg text-[#526575] dark:text-[#8FA3B3] hover:bg-[#EAECEF] dark:hover:bg-[#192732] disabled:opacity-40 transition-colors cursor-pointer"
              title={zoom === 1 ? 'Enlarge to 150%' : 'Fit to 100%'}
              aria-label="Toggle fit zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!resolvedSrc || zoom === 1}
              className="p-2 rounded-lg text-[#526575] dark:text-[#8FA3B3] hover:bg-[#EAECEF] dark:hover:bg-[#192732] disabled:opacity-40 transition-colors cursor-pointer"
              title="Reset zoom to 100%"
              aria-label="Reset zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            {resolvedSrc && !loadError && (
              <button
                type="button"
                onClick={handleDownloadImage}
                className="p-2 rounded-lg text-[#526575] dark:text-[#8FA3B3] hover:text-[#FE7F2D] hover:bg-[#EAECEF] dark:hover:bg-[#192732] transition-colors cursor-pointer"
                title="Download image PNG"
                aria-label="Download image"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative flex-1 min-h-[290px] max-h-[430px] bg-[#070A0D] flex items-center justify-center p-5 overflow-auto select-none">
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, #EAECEF 1px, transparent 1px), linear-gradient(to bottom, #EAECEF 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {resolvedSrc && !loadError ? (
          <div className="relative flex items-center justify-center min-w-full min-h-full">
            <img
              key={`${resolvedSrc}_${retryKey}`}
              ref={imgRef}
              src={resolvedSrc}
              alt={title || 'Image Preview'}
              crossOrigin="anonymous"
              onLoad={handleImageLoad}
              onError={() => {
                setLoadError(true);
                setPixelGrid(null);
              }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverCoord(null)}
              style={{
                width: zoom === 1 ? undefined : `${Math.round(zoom * 100)}%`,
                maxHeight: zoom === 1 ? '360px' : 'none',
                maxWidth: zoom === 1 ? '100%' : 'none',
                imageRendering: zoom >= 1.5 ? 'pixelated' : 'auto',
                transition: 'width 0.15s ease-out',
              }}
              className="object-contain cursor-crosshair shadow-2xl rounded"
            />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-2.5 text-[#8FA3B3] text-xs z-10">
            <AlertCircle className="w-5 h-5 text-[#E56B6B]" />
            <span>Unable to render image artifact</span>
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                setRetryKey(k => k + 1);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#17232D] border border-[#233D4D] text-[#EAECEF] hover:border-[#FE7F2D] cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-[#7D95A8] text-xs">
            <span>No image loaded</span>
          </div>
        )}

        {hoverCoord && (
          <div className="sticky bottom-2 left-2 self-end px-3 py-1.5 rounded-xl bg-[#090B0E]/92 border border-[#233D4D] text-[11px] font-mono text-[#EAECEF] shadow flex items-center gap-3 pointer-events-none">
            <span>
              X: <strong className="text-[#FE7F2D]">{hoverCoord.x}</strong> Y:{' '}
              <strong className="text-[#FE7F2D]">{hoverCoord.y}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Lum: <strong className="text-[#8FB4D4]">{hoverCoord.val}</strong> / 255
            </span>
          </div>
        )}
      </div>

      {displayHistogram && (
        <div className="p-4 border-t border-[#E5EBF0] dark:border-[#233D4D]/65 bg-[#F7F9FB] dark:bg-[#0D141A]">
          <div className="flex items-center justify-between text-[11.5px] text-[#526575] dark:text-[#8FA3B3] mb-2">
            <span className="font-semibold">Luminance Intensity Histogram</span>
            <span className="font-mono">256 Bins (0–255)</span>
          </div>
          <canvas
            ref={histCanvasRef}
            width={256}
            height={52}
            className="w-full h-13 rounded-xl bg-[#FFFFFF] dark:bg-[#090B0E] border border-[#D8E0E6] dark:border-[#233D4D]"
          />
        </div>
      )}
    </div>
  );
};
