'use client';

import React from 'react';

interface SimpleLineChartProps {
  data: number[];
  color: string;
  height?: number;
  fill?: boolean;
  xLabels?: string[]; // X轴标签（距离或时间）
  yUnit?: string; // Y轴单位
  minValue?: number;
  maxValue?: number;
}

export function SimpleLineChart({ 
  data, 
  color, 
  height = 120, 
  fill = false,
  xLabels,
  yUnit = '',
  minValue,
  maxValue
}: SimpleLineChartProps) {
  if (!data || data.length === 0) return null;

  // Sample data points to reduce rendering load
  const sampleRate = Math.ceil(data.length / 100);
  const sampledData = sampleRate > 1 
    ? data.filter((_, i) => i % sampleRate === 0)
    : data;

  const min = minValue !== undefined ? minValue : Math.min(...sampledData);
  const max = maxValue !== undefined ? maxValue : Math.max(...sampledData);
  const range = max - min || 1;

  const chartWidth = 100;
  const chartHeight = 80; // 留给坐标轴空间
  const padding = 5;
  
  // Generate path
  const points = sampledData.map((value, index) => {
    const x = (index / (sampledData.length - 1)) * (chartWidth - padding * 2) + padding;
    const y = chartHeight - ((value - min) / range) * (chartHeight - padding * 2) - padding;
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  
  // Fill path (close the area)
  const fillPath = fill 
    ? `${linePath} L ${chartWidth - padding},${chartHeight} L ${padding},${chartHeight} Z`
    : linePath;

  // Y轴刻度
  const yTicks = [min, (min + max) / 2, max];

  return (
    <div className="w-full" style={{ height }}>
      <svg 
        viewBox={`0 0 ${chartWidth} ${height}`} 
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Y轴刻度线和标签 */}
        {yTicks.map((tick, i) => {
          const y = chartHeight - ((tick - min) / range) * (chartHeight - padding * 2) - padding;
          return (
            <g key={i}>
              {/* 网格线 */}
              <line
                x1={padding}
                y1={y}
                x2={chartWidth - padding}
                y2={y}
                stroke="#e4e4e7"
                strokeWidth={0.3}
                strokeDasharray="2,2"
              />
              {/* Y轴数值 */}
              <text
                x={2}
                y={y}
                fontSize={4}
                fill="#71717a"
                textAnchor="start"
                dominantBaseline="middle"
              >
                {Math.round(tick)}{yUnit}
              </text>
            </g>
          );
        })}

        {/* 图表区域 */}
        <g transform={`translate(0, ${height - chartHeight - 15})`}>
          {fill && (
            <path
              d={fillPath}
              fill={color}
              fillOpacity={0.1}
            />
          )}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* X轴标签 */}
        {xLabels && xLabels.length >= 2 && (
          <>
            <text
              x={padding}
              y={height - 2}
              fontSize={4}
              fill="#71717a"
              textAnchor="start"
            >
              {xLabels[0]}
            </text>
            <text
              x={chartWidth - padding}
              y={height - 2}
              fontSize={4}
              fill="#71717a"
              textAnchor="end"
            >
              {xLabels[xLabels.length - 1]}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
