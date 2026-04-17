'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton, PixelCard } from '@/components/ui';
import { drawMultiRouteToCanvas, downloadPNG } from '@/lib/multiRouteCanvas';
import type { StravaActivity } from '@/types';
import { X, Download, ImageIcon, CheckCircle2, Calendar } from 'lucide-react';

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
  const [canvasSize, setCanvasSize] = useState<'normal' | 'large'>('normal');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);

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
        const date = new Date(a.start_date_local);
        return date >= cutoff;
      })
      .sort((a, b) => new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime())
      .slice(0, limits[period]);

    return runs;
  }, [activities, period]);

  const count = filtered.length;

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

      const isLarge = items.length > 24;
      setCanvasSize(isLarge ? 'large' : 'normal');
      const url = drawMultiRouteToCanvas({
        items,
        lineColor: '#f97316',
      });
      setDataUrl(url);
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, filtered, period, t]);

  const filename = useMemo(() => {
    const prefixMap: Record<PeriodType, string> = {
      week: 'weekly',
      month: 'monthly',
      quarter: '60days',
      halfYear: '100days',
    };
    const prefix = prefixMap[period];
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
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
                  {t('periodShare.title', '周期海报')}
                </h2>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {t('periodShare.subtitle', '把一周或一个月的跑步汇总成一张海报')}
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
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

          {/* Preview */}
          <div className="mb-5 flex flex-col items-center w-full">
            <div
              className="relative rounded-lg overflow-hidden border-2 border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-100 w-full"
              style={{
                maxWidth: canvasSize === 'large' ? 320 : 280,
              }}
            >
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt="Period summary"
                  className="w-full h-auto object-contain"
                />
              ) : (
                <div
                  className="flex items-center justify-center min-h-[140px]"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                  }}
                >
                  <span className="font-mono text-xs text-zinc-500 text-center px-4">
                    {count === 0
                      ? t('periodShare.noData', '该时间段没有跑步记录')
                      : t('periodShare.generating', '生成中...')}
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
