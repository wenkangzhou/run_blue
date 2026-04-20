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
import { ChartDataPoint, MetricType, formatMetricValue, getMetricUnit } from '@/lib/stats';

interface VolumeBarChartProps {
  data: ChartDataPoint[];
  metric: MetricType;
  onBarClick?: (data: ChartDataPoint) => void;
}

export function VolumeBarChart({ data, metric, onBarClick }: VolumeBarChartProps) {
  const { t } = useTranslation();

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 font-mono text-sm">
        {t('errors.noData')}
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  // Determine Y-axis tick count and format
  const yTickFormatter = (value: number) => {
    return formatMetricValue(value, metric);
  };

  // For many bars, enable horizontal scroll on mobile
  const needsScroll = data.length > 20;
  const minChartWidth = needsScroll ? Math.max(data.length * 24, 320) : '100%';

  return (
    <div className={needsScroll ? 'overflow-x-auto pb-2' : undefined}>
      <div style={{ minWidth: typeof minChartWidth === 'number' ? minChartWidth : undefined }}>
        <ResponsiveContainer width="100%" height={280} minWidth={typeof minChartWidth === 'number' ? minChartWidth : undefined}>
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
            barCategoryGap="20%"
          >
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="#e4e4e7"
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
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload as ChartDataPoint;
                  return (
                    <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-800 dark:border-zinc-200 px-3 py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
                      <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                        {item.label}
                      </p>
                      <p className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {item.displayValue}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar
              dataKey="value"
              radius={[0, 0, 0, 0]}
              maxBarSize={40}
              animationDuration={600}
              onClick={(_, index) => {
                if (onBarClick && data[index]) {
                  onBarClick(data[index]);
                }
              }}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isCurrent ? '#f97316' : '#3b82f6'}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  stroke={entry.isCurrent ? '#ea580c' : '#2563eb'}
                  strokeWidth={1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
