'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  ChartDataPoint,
  MetricType,
  calculateSummaryStats,
  formatMetricValue,
  formatPaceFromSeconds,
} from '@/lib/stats';
import { formatDuration } from '@/lib/strava';

interface VolumeBarChartProps {
  data: ChartDataPoint[];
  metric: MetricType;
  selectedKey?: string | null;
  onSelect?: (item: ChartDataPoint) => void;
  colors?: {
    bar: string;
    barStroke: string;
    currentBar: string;
    currentBarStroke: string;
  };
}

export function VolumeBarChart({ data, metric, selectedKey, onSelect, colors }: VolumeBarChartProps) {
  const { t } = useTranslation();

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 font-mono text-sm">
        {t('errors.noData')}
      </div>
    );
  }

  // Determine Y-axis tick count and format
  const yTickFormatter = (value: number) => {
    return formatMetricValue(value, metric);
  };

  const needsScroll = data.length > 20;
  const minChartWidth = needsScroll ? Math.max(data.length * 24, 320) : '100%';

  return (
    <div className={needsScroll ? 'overflow-x-auto pb-2' : undefined}>
      <div className="[&_rect]:focus:outline-none" style={{ minWidth: typeof minChartWidth === 'number' ? minChartWidth : undefined }}>
        <ResponsiveContainer width="100%" height={300} minWidth={typeof minChartWidth === 'number' ? minChartWidth : undefined}>
          <BarChart style={{ outline: 'none' }}
            data={data}
            margin={{ top: 12, right: 8, left: -4, bottom: 4 }}
            barCategoryGap="28%"
          >
            <CartesianGrid
              strokeDasharray="3 8"
              stroke="#e5e7eb"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fill: '#71717a' }}
              axisLine={{ stroke: '#d4d4d8' }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fill: '#71717a' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yTickFormatter}
              width={50}
            />
            <Tooltip
              cursor={{ fill: 'rgba(59,130,246,0.08)' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload as ChartDataPoint;
                  const summary = calculateSummaryStats([item]);
                  return (
                    <div className="min-w-[190px] rounded-lg border border-zinc-200 bg-white/95 px-3 py-2 shadow-xl shadow-zinc-200/70 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:shadow-black/30">
                      <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                        {item.label}
                      </p>
                      <p className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                        {item.displayValue}
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                        <span>{t('stats.totalActivities')}</span>
                        <span className="text-right text-zinc-800 dark:text-zinc-100">{summary.activityCount}</span>
                        <span>{t('stats.totalDistance')}</span>
                        <span className="text-right text-zinc-800 dark:text-zinc-100">{(summary.totalDistance / 1000).toFixed(1)} km</span>
                        <span>{t('stats.totalTime')}</span>
                        <span className="text-right text-zinc-800 dark:text-zinc-100">{formatDuration(summary.totalDuration)}</span>
                        <span>{t('stats.avgPace')}</span>
                        <span className="text-right text-zinc-800 dark:text-zinc-100">{formatPaceFromSeconds(summary.avgPace)}/km</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey="value"
              radius={[5, 5, 2, 2]}
              maxBarSize={34}
              animationDuration={600}
              tabIndex={-1}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isCurrent ? (colors?.currentBar || '#f97316') : (colors?.bar || '#3b82f6')}
                  className={`${entry.activities.length > 0 ? 'cursor-pointer' : 'cursor-default'} transition-opacity hover:opacity-80`}
                  onClick={() => entry.activities.length > 0 && onSelect?.(entry)}
                  stroke={selectedKey === entry.key
                    ? (entry.isCurrent ? (colors?.currentBarStroke || '#0f766e') : (colors?.barStroke || '#2563eb'))
                    : entry.isCurrent ? (colors?.currentBarStroke || '#ea580c') : (colors?.barStroke || '#2563eb')}
                  strokeWidth={selectedKey === entry.key ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
