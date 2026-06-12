'use client';

/* eslint-disable @next/next/no-img-element -- Generated data URL previews need native image save behavior. */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { drawRouteToCanvas, downloadPNG } from '@/lib/routeCanvas';
import { X, Download, ImageIcon, CheckCircle2, Copy, Sparkles } from 'lucide-react';

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
  const [showStats, setShowStats] = useState(true);
  const [mode, setMode] = useState<'poster' | 'transparent'>('poster');

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
        padding: mode === 'poster' ? 86 : 100,
        lineWidth: mode === 'poster' ? 18 : 12,
        lineColor: mode === 'poster' ? '#2563eb' : '#3b82f6',
        glowColor: mode === 'poster' ? '#93c5fd' : '#60a5fa',
        glowBlur: mode === 'poster' ? 36 : 28,
        showMarkers: true,
        markerSize: mode === 'poster' ? 34 : 28,
        markerBorderWidth: mode === 'poster' ? 7 : 6,
        stats: canvasStats,
        mode,
        title: activityName,
        subtitle: formatPosterDate(activityDate),
      });
      setDataUrl(url);
    }, 50);
    return () => clearTimeout(timer);
  }, [activityDate, activityName, isOpen, mode, polyline, showStats, stats, t]);

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
      className="fixed inset-0 z-[10001] flex items-center justify-center p-3 sm:p-5"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-zinc-950/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/15 bg-white shadow-2xl dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ImageIcon size={18} className="text-blue-600" />
              <h2 className="font-mono text-sm font-black uppercase tracking-wide">
                {t('sharePoster.title', '分享海报')}
              </h2>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {activityName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex items-center justify-center bg-zinc-100 p-4 dark:bg-zinc-900 sm:p-6">
            <div
              className={[
                'relative aspect-square w-full max-w-[430px] overflow-hidden rounded-xl border shadow-xl',
                mode === 'poster'
                  ? 'border-zinc-200 bg-white dark:border-zinc-800'
                  : 'border-dashed border-zinc-300 dark:border-zinc-600',
              ].join(' ')}
              style={mode === 'transparent' ? {
                backgroundImage:
                  'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                backgroundSize: '18px 18px',
                backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
              } : undefined}
            >
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt="Route poster"
                  className="h-full w-full object-contain"
                  draggable={false}
                  onContextMenu={() => {}}
                  style={{ WebkitTouchCallout: 'default', userSelect: 'auto' }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-xs text-zinc-400">
                    {t('sharePoster.generating', '生成中...')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800 lg:border-l lg:border-t-0 sm:p-5">
            <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/70 dark:bg-blue-950/20">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles size={15} className="text-blue-600 dark:text-blue-400" />
                <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">
                  {mode === 'poster'
                    ? t('sharePoster.posterReady', '成品海报')
                    : t('sharePoster.transparentReady', '透明路线素材')}
                </span>
              </div>
              <p className="font-mono text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                {mode === 'poster'
                  ? t('sharePoster.posterDesc', '适合直接保存和发布，包含路线、标题、日期和关键数据。')
                  : t('sharePoster.transparentDesc', '适合二次编辑，路线 PNG 可以叠加到其他照片或设计里。')}
              </p>
            </div>

            <div className="mb-5">
              <p className="mb-2 font-mono text-[10px] font-bold uppercase text-zinc-500">
                {t('sharePoster.style', '样式')}
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
                <button
                  onClick={() => setMode('poster')}
                  className={`rounded-md px-3 py-2 font-mono text-xs font-bold transition-colors ${
                    mode === 'poster'
                      ? 'bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-300'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {t('sharePoster.posterMode', '海报')}
                </button>
                <button
                  onClick={() => setMode('transparent')}
                  className={`rounded-md px-3 py-2 font-mono text-xs font-bold transition-colors ${
                    mode === 'transparent'
                      ? 'bg-white text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-300'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {t('sharePoster.transparentMode', '透明')}
                </button>
              </div>
            </div>

            <div className="mb-5 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div>
                <span className="font-mono text-sm font-bold">
                  {t('sharePoster.showStats', '显示跑步数据')}
                </span>
                <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                  {t('sharePoster.showStatsHint', '距离、时间、配速')}
                </p>
              </div>
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

            {isIOS && dataUrl && (
              <p className="mb-4 rounded-md bg-zinc-100 p-2 text-center font-mono text-xs text-zinc-500 dark:bg-zinc-900">
                {t('sharePoster.iosHint', '长按上方图片即可保存到相册')}
              </p>
            )}

            <div className="flex flex-col gap-2">
              {dataUrl && !isIOS && (
                <>
                  <button
                    onClick={handleDownload}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-mono text-sm font-bold text-white transition-colors hover:bg-blue-500"
                  >
                    <Download size={16} />
                    {t('sharePoster.download', '下载 PNG')}
                  </button>
                  <button
                    onClick={handleCopy}
                    disabled={showCopied}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 font-mono text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-70 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    {showCopied ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 size={14} />
                        {t('sharePoster.copied', '已复制')}
                      </span>
                    ) : (
                      <>
                        <Copy size={14} />
                        {t('sharePoster.copy', '复制图片')}
                      </>
                    )}
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 font-mono text-xs font-bold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatPosterDate(date: string) {
  if (/^\d{8}$/.test(date)) {
    return `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}`;
  }
  return date;
}
