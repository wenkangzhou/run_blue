'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton, PixelCard } from '@/components/ui';
import { drawRouteToCanvas, downloadPNG } from '@/lib/routeCanvas';
import { X, Download, ImageIcon, CheckCircle2 } from 'lucide-react';

interface SharePosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  activityName: string;
  activityDate: string;
  polyline: string | null;
  stats?: {
    distance: string;
    duration: string;
    pace: string;
  } | null;
}

export function SharePosterModal({
  isOpen,
  onClose,
  activityName,
  activityDate,
  polyline,
  stats,
}: SharePosterModalProps) {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setDataUrl(null);
      setShowCopied(false);
      return;
    }
    // Generate on next tick so the modal is already rendered
    const timer = setTimeout(() => {
      const canvasStats = showStats && stats
        ? [
            { label: t('activity.distance', '距离'), value: stats.distance },
            { label: t('activity.time', '时间'), value: stats.duration },
            { label: t('activity.pace', '配速'), value: stats.pace },
          ]
        : null;
      const url = drawRouteToCanvas(polyline, {
        size: 1080,
        padding: 100,
        lineWidth: 12,
        lineColor: '#3b82f6',
        glowColor: '#60a5fa',
        glowBlur: 28,
        showMarkers: true,
        markerSize: 28,
        markerBorderWidth: 6,
        stats: canvasStats,
      });
      setDataUrl(url);
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, polyline, showStats, stats, t]);

  const filename = useMemo(() => {
    const safeName = activityName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '_').slice(0, 30);
    return `runblue_${safeName || 'route'}_${activityDate}.png`;
  }, [activityName, activityDate]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (dataUrl) {
      downloadPNG(dataUrl, filename);
    }
  };

  const handleCopy = async () => {
    if (!dataUrl) return;
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch {
      // Fallback: just download
      handleDownload();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/70 dark:bg-black/80"
        onClick={onClose}
      />
      <PixelCard className="relative w-full max-w-md">
        <div className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border-4 border-zinc-800 dark:border-zinc-200 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <ImageIcon size={20} />
              </div>
              <div>
                <h2 className="font-mono text-lg font-bold leading-tight">
                  {t('sharePoster.title', '分享海报')}
                </h2>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {t('sharePoster.transparentBg', '透明背景 PNG')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:opacity-70"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
          </div>

          <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            {t('sharePoster.description', '下载透明背景的路线图片，方便你在社交媒体上自由叠加文字和贴纸。')}
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-between mb-4 p-3 border-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
            <span className="font-mono text-sm font-bold">
              {t('sharePoster.showStats', '显示跑步数据')}
            </span>
            <button
              onClick={() => setShowStats(v => !v)}
              className={[
                'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                showStats ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600',
              ].join(' ')}
              aria-pressed={showStats}
            >
              <span
                className={[
                  'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                  showStats ? 'translate-x-6' : 'translate-x-1',
                ].join(' ')}
              />
            </button>
          </div>

          {/* Preview */}
          <div className="mb-5 flex flex-col items-center">
            <div
              className="relative rounded-lg overflow-hidden border-2 border-dashed border-zinc-300 dark:border-zinc-600"
              style={{
                width: '100%',
                maxWidth: 280,
                aspectRatio: '1 / 1',
                backgroundImage:
                  'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              }}
            >
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt="Route"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-xs text-zinc-400">
                    {t('sharePoster.generating', '生成中...')}
                  </span>
                </div>
              )}
            </div>
            {isIOS && dataUrl && (
              <p className="mt-3 font-mono text-xs text-zinc-500 text-center">
                {t('sharePoster.iosHint', '长按上方图片即可保存到相册')}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <PixelButton variant="outline" size="md" onClick={onClose}>
              {t('common.close')}
            </PixelButton>
            {dataUrl && (
              <>
                {!isIOS && (
                  <PixelButton
                    variant="secondary"
                    size="md"
                    onClick={handleCopy}
                    disabled={showCopied}
                  >
                    {showCopied ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 size={14} />
                        {t('sharePoster.copied', '已复制')}
                      </span>
                    ) : (
                      t('sharePoster.copy', '复制图片')
                    )}
                  </PixelButton>
                )}
                {!isIOS && (
                  <PixelButton variant="primary" size="md" onClick={handleDownload}>
                    <span className="inline-flex items-center gap-1">
                      <Download size={14} />
                      {t('sharePoster.download', '下载 PNG')}
                    </span>
                  </PixelButton>
                )}
              </>
            )}
          </div>
        </div>
      </PixelCard>
    </div>
  );
}
