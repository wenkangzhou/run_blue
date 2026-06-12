'use client';

/* eslint-disable @next/next/no-img-element -- Generated data URL previews need native image save behavior. */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { drawMultiRouteToCanvas, downloadPNG } from '@/lib/multiRouteCanvas';
import type { StravaActivity } from '@/types';
import { X, Download, CheckCircle2, Calendar, Copy, Route, Sparkles } from 'lucide-react';
import { formatLocalDateKey, getActivityDate, getActivityTimestamp } from '@/lib/dates';
import { formatDistance, formatDuration } from '@/lib/strava';

type PeriodType = 'week' | 'month' | 'quarter' | 'halfYear';

interface PeriodShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  activities: StravaActivity[];
}

export function PeriodShareModal({
  isOpen,
  onClose,
  activities,
}: PeriodShareModalProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<PeriodType>('week');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [mode, setMode] = useState<'poster' | 'transparent'>('poster');

  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    const limits: Record<PeriodType, number> = {
      week: 7,
      month: 24,
      quarter: 42,
      halfYear: 70,
    };
    const daysMap: Record<PeriodType, number> = {
      week: 7,
      month: 30,
      quarter: 60,
      halfYear: 100,
    };
    cutoff.setDate(now.getDate() - daysMap[period]);
    cutoff.setHours(0, 0, 0, 0);

    const runs = activities
      .filter((a) => {
        if (a.type !== 'Run') return false;
        const date = getActivityDate(a);
        return date >= cutoff;
      })
      .sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a))
      .slice(0, limits[period]);

    return runs;
  }, [activities, period]);

  const count = filtered.length;
  const periodMeta = useMemo(() => {
    const daysMap: Record<PeriodType, number> = {
      week: 7,
      month: 30,
      quarter: 60,
      halfYear: 100,
    };
    const titleMap: Record<PeriodType, string> = {
      week: t('periodShare.last7Days', '最近7天'),
      month: t('periodShare.last30Days', '最近30天'),
      quarter: t('periodShare.last60Days', '最近60天'),
      halfYear: t('periodShare.last100Days', '最近100天'),
    };
    const totalDistance = filtered.reduce((sum, activity) => sum + activity.distance, 0);
    const totalTime = filtered.reduce((sum, activity) => sum + activity.moving_time, 0);
    const dateKeys = new Set(filtered.map((activity) => formatLocalDateKey(getActivityDate(activity))));

    return {
      days: daysMap[period],
      title: titleMap[period],
      totalDistance,
      totalTime,
      activeDays: dateKeys.size,
      stats: [
        { label: t('activity.distance', '距离'), value: formatDistance(totalDistance, 'km') },
        { label: t('periodShare.runCount', '次数'), value: `${filtered.length}` },
        { label: t('activity.time', '时间'), value: formatDuration(totalTime) },
      ],
    };
  }, [filtered, period, t]);

  useEffect(() => {
    if (!isOpen) {
      setDataUrl(null);
      setShowCopied(false);
      return;
    }
    const timer = setTimeout(() => {
      if (filtered.length === 0) {
        setDataUrl(null);
        return;
      }
      const items = filtered.map((a) => ({
        polyline: a.map?.summary_polyline || a.map?.polyline || '',
      }));

      const url = drawMultiRouteToCanvas({
        items,
        lineColor: mode === 'poster' ? '#ea580c' : '#f97316',
        mode,
        title: periodMeta.title,
        subtitle: `${periodMeta.days} days · ${periodMeta.activeDays} active days`,
        stats: periodMeta.stats,
      });
      setDataUrl(url);
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, filtered, mode, periodMeta]);

  const filename = useMemo(() => {
    const prefixMap: Record<PeriodType, string> = {
      week: 'weekly',
      month: 'monthly',
      quarter: '60days',
      halfYear: '100days',
    };
    const prefix = prefixMap[period];
    const dateStr = formatLocalDateKey(new Date()).replace(/-/g, '');
    return `runblue_${prefix}_${dateStr}.png`;
  }, [period]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (dataUrl) downloadPNG(dataUrl, filename);
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
      handleDownload();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center p-3 sm:p-5"
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
              <Calendar size={18} className="text-orange-600" />
              <h2 className="font-mono text-sm font-black uppercase tracking-wide">
                {t('periodShare.title', '周期海报')}
              </h2>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {periodMeta.title} · {formatDistance(periodMeta.totalDistance, 'km')} · {count}{t('periodShare.runUnit', '次')}
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
          <div className="flex items-center justify-center bg-orange-50 p-4 dark:bg-zinc-900 sm:p-6">
            <div className={[
              'relative w-full overflow-hidden rounded-xl border shadow-xl',
              mode === 'poster'
                ? 'max-w-[380px] border-orange-100 bg-white dark:border-zinc-800'
                : 'max-w-[430px] border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-600',
            ].join(' ')}>
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt="Period summary"
                  className="h-auto w-full object-contain"
                  draggable={false}
                  onContextMenu={() => {}}
                  style={{ WebkitTouchCallout: 'default', userSelect: 'auto' }}
                />
              ) : (
                <div
                  className="flex min-h-[360px] items-center justify-center"
                  style={mode === 'transparent' ? {
                    backgroundImage:
                      'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                    backgroundSize: '18px 18px',
                    backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
                  } : undefined}
                >
                  <span className="px-4 text-center font-mono text-xs text-zinc-500">
                    {count === 0
                      ? t('periodShare.noData', '该时间段没有跑步记录')
                      : t('periodShare.generating', '生成中...')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800 lg:border-l lg:border-t-0 sm:p-5">
            <div className="mb-5 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900/70 dark:bg-orange-950/20">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles size={15} className="text-orange-600 dark:text-orange-400" />
                <span className="font-mono text-xs font-bold text-orange-700 dark:text-orange-300">
                  {mode === 'poster'
                    ? t('periodShare.posterReady', '周期总结海报')
                    : t('periodShare.transparentReady', '路线集合素材')}
                </span>
              </div>
              <p className="font-mono text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                {mode === 'poster'
                  ? t('periodShare.posterDesc', '适合直接发布，包含周期、路线矩阵和关键跑量数据。')
                  : t('periodShare.transparentDesc', '适合二次编辑，只导出透明背景的路线集合。')}
              </p>
            </div>

            <div className="mb-5">
              <p className="mb-2 font-mono text-[10px] font-bold uppercase text-zinc-500">
                {t('periodShare.range', '周期')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <PeriodButton
                  active={period === 'week'}
                  onClick={() => setPeriod('week')}
                  label={t('periodShare.last7Days', '最近7天')}
                />
                <PeriodButton
                  active={period === 'month'}
                  onClick={() => setPeriod('month')}
                  label={t('periodShare.last30Days', '最近30天')}
                />
                <PeriodButton
                  active={period === 'quarter'}
                  onClick={() => setPeriod('quarter')}
                  label={t('periodShare.last60Days', '最近60天')}
                />
                <PeriodButton
                  active={period === 'halfYear'}
                  onClick={() => setPeriod('halfYear')}
                  label={t('periodShare.last100Days', '最近100天')}
                />
              </div>
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
                      ? 'bg-white text-orange-600 shadow-sm dark:bg-zinc-800 dark:text-orange-300'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {t('sharePoster.posterMode', '海报')}
                </button>
                <button
                  onClick={() => setMode('transparent')}
                  className={`rounded-md px-3 py-2 font-mono text-xs font-bold transition-colors ${
                    mode === 'transparent'
                      ? 'bg-white text-orange-600 shadow-sm dark:bg-zinc-800 dark:text-orange-300'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {t('sharePoster.transparentMode', '透明')}
                </button>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-2">
              <MiniStat icon={<Route size={13} />} label={t('activity.distance', '距离')} value={formatDistance(periodMeta.totalDistance, 'km')} />
              <MiniStat icon={<Calendar size={13} />} label={t('periodShare.runCount', '次数')} value={`${count}`} />
              <MiniStat icon={<Route size={13} />} label={t('activity.time', '时间')} value={formatDuration(periodMeta.totalTime)} />
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
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 font-mono text-sm font-bold text-white transition-colors hover:bg-orange-500"
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

function PeriodButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-md border px-3 py-2 font-mono text-xs font-bold transition-colors',
        active
          ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300'
          : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/70">
      <div className="mb-1 flex items-center gap-1 text-orange-600 dark:text-orange-300">
        {icon}
        <span className="truncate font-mono text-[10px] text-zinc-500">{label}</span>
      </div>
      <p className="truncate font-mono text-xs font-black text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}
