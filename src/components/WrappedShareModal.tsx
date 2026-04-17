'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { PixelButton, PixelCard } from '@/components/ui';
import { drawWrappedToCanvas } from '@/lib/wrappedCanvas';
import { calculateWrapped, getAvailableWrappedYears, type WrappedPeriod } from '@/lib/wrapped';
import { downloadPNG } from '@/lib/multiRouteCanvas';
import { getActivities } from '@/lib/strava';
import type { StravaActivity } from '@/types';
import { X, Download, CheckCircle2, Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface WrappedShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  activities: StravaActivity[];
}

export function WrappedShareModal({
  isOpen,
  onClose,
  activities,
}: WrappedShareModalProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const locale = i18n.language;
  const isZh = locale === 'zh';

  const [period, setPeriod] = useState<WrappedPeriod>('year');
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [quarter, setQuarter] = useState<number>(1);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [allActivities, setAllActivities] = useState<StravaActivity[]>(activities);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    setAllActivities(activities);
  }, [activities]);

  useEffect(() => {
    if (!isOpen || !user?.accessToken) return;
    let cancelled = false;

    const loadAll = async () => {
      setLoadingHistory(true);
      let page = 1;
      let merged = [...allActivities];
      try {
        while (!cancelled) {
          const res = await getActivities(user.accessToken, page, 200);
          if (res.length === 0) break;
          const existingIds = new Set(merged.map((a) => a.id));
          const newOnes = res.filter((a) => !existingIds.has(a.id));
          if (newOnes.length === 0 && res.length < 200) break;
          merged = [...merged, ...newOnes];
          setAllActivities(merged);
          page++;
          if (res.length < 200) break;
        }
      } catch (e) {
        console.error('Failed to load all activities for wrapped:', e);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.accessToken]);

  const availableYears = useMemo(() => getAvailableWrappedYears(allActivities), [allActivities]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(year)) {
      setYear(availableYears[0]);
    }
  }, [availableYears, year]);

  const wrappedData = useMemo(() => {
    return calculateWrapped(allActivities, period, year, period === 'quarter' ? quarter : undefined);
  }, [allActivities, period, year, quarter]);

  useEffect(() => {
    if (!isOpen) {
      setDataUrl(null);
      setShowCopied(false);
      return;
    }
    const timer = setTimeout(() => {
      if (!wrappedData) {
        setDataUrl(null);
        return;
      }
      const url = drawWrappedToCanvas(wrappedData, locale);
      setDataUrl(url);
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, wrappedData, locale]);

  const filename = useMemo(() => {
    const suffix = period === 'quarter' ? `Q${quarter}` : `${year}`;
    return `runblue_wrapped_${suffix}.png`;
  }, [period, quarter, year]);

  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }, []);

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

  const canPrevYear = availableYears.includes(year - 1);
  const canNextYear = availableYears.includes(year + 1);

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/70 dark:bg-black/80"
        onClick={onClose}
      />
      <PixelCard className="relative w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border-4 border-zinc-800 dark:border-zinc-200 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <Calendar size={20} />
              </div>
              <div>
                <h2 className="font-mono text-lg font-bold leading-tight">
                  {t('wrapped.title', '年度回顾')}
                </h2>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {t('wrapped.subtitle', '生成你的跑步年度总结')}
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

          {/* Period selector */}
          <div className="flex items-center gap-2 mb-4">
            <PeriodButton
              active={period === 'year'}
              onClick={() => setPeriod('year')}
              label={t('wrapped.year', '年度')}
            />
            <PeriodButton
              active={period === 'quarter'}
              onClick={() => setPeriod('quarter')}
              label={t('wrapped.quarter', '季度')}
            />
          </div>

          {/* Year / Quarter navigator */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              onClick={() => setYear((y) => y - 1)}
              disabled={!canPrevYear}
              className="p-2 border-2 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>

            <span className="font-mono text-base font-bold min-w-[80px] text-center">
              {period === 'quarter' ? `${year} Q${quarter}` : year}
            </span>

            <button
              onClick={() => setYear((y) => y + 1)}
              disabled={!canNextYear}
              className="p-2 border-2 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {period === 'quarter' && (
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[1, 2, 3, 4].map((q) => (
                <QuarterButton
                  key={q}
                  active={quarter === q}
                  onClick={() => setQuarter(q)}
                  label={`Q${q}`}
                />
              ))}
            </div>
          )}

          {/* Preview */}
          <div className="mb-5 flex flex-col items-center">
            <div
              className="relative rounded-lg overflow-hidden border-2 border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-100"
              style={{
                width: '100%',
                maxWidth: 300,
                aspectRatio: '3 / 5',
              }}
            >
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt="Wrapped summary"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                  }}
                >
                  <span className="font-mono text-xs text-zinc-500 text-center px-4">
                    {!wrappedData
                      ? t('wrapped.noData', '该时间段没有跑步记录')
                      : loadingHistory
                      ? t('wrapped.loadingHistory', '正在加载历史数据...')
                      : t('wrapped.generating', '生成中...')}
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
            {loadingHistory && (
              <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400">
                <Loader2 size={14} className="animate-spin" />
                {t('wrapped.loadingHistory', '加载历史数据中')}
              </span>
            )}
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
        'flex-1 px-3 py-2 font-mono text-sm font-bold border-2 transition-colors',
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function QuarterButton({
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
        'px-3 py-2 font-mono text-sm font-bold border-2 transition-colors',
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
