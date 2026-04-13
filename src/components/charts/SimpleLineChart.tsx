'use client';

import React from 'react';

interface SimpleLineChartProps {
  data: number[];
  color: string;
  height?: number;
  fill?: boolean;
  xLabels?: string[];
  yUnit?: string;
  formatYLabel?: (value: number) => string;
}

export function SimpleLineChart({ 
  data, 
  color, 
  height = 120, 
  fill = false,
  xLabels,
  yUnit = '',
  formatYLabel
}: SimpleLineChartProps) {
  if (!data || data.length === 0) return null;

  const sampleRate = Math.ceil(data.length / 100);
  const sampledData = sampleRate > 1 
    ? data.filter((_, i) => i % sampleRate === 0)
    : data;

  const min = Math.min(...sampledData);
  const max = Math.max(...sampledData);
  const range = max - min || 1;

  const labelWidth = 50;
  const xLabelHeight = 22;
  const chartWidth = 800;
  const chartHeight = height - xLabelHeight;
  
  const points = sampledData.map((value, index) => {
    const x = labelWidth + (index / (sampledData.length - 1)) * (chartWidth - labelWidth - 15);
    const y = ((max - value) / range) * chartHeight;
    return [x, y];
  });

  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p[0]},${p[1]}`).join(' ');
  const fillPath = fill 
    ? `${linePath} L ${points[points.length - 1][0]},${chartHeight} L ${points[0][0]},${chartHeight} Z`
    : linePath;

  const yTicks = [min, (min + max) / 2, max];

  return (
    <svg 
      width="100%"
      height={height}
      viewBox={`0 0 ${chartWidth} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* 网格线和Y轴标签 */}
      {yTicks.map((tick, i) => {
        const y = ((max - tick) / range) * chartHeight;
        return (
          <g key={i}>
            <line
              x1={labelWidth}
              y1={y}
              x2={chartWidth - 15}
              y2={y}
              stroke="#e4e4e7"
              strokeWidth={1}
              strokeDasharray="4,2"
            />
            <text
              x={labelWidth - 6}
              y={y}
              fontSize={13}
              fill="#52525b"
              textAnchor="end"
              dominantBaseline="middle"
              fontWeight="500"
            >
              {formatYLabel ? formatYLabel(tick) : `${Math.round(tick)}${yUnit}`}
            </text>
          </g>
        );
      })}

      {/* 图表线 */}
      {fill && (
        <path d={fillPath} fill={color} fillOpacity={0.15} />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* X轴标签 */}
      {xLabels && xLabels.length >= 2 && (
        <>
          <text
            x={labelWidth}
            y={height - 5}
            fontSize={13}
            fill="#52525b"
            textAnchor="start"
            fontWeight="500"
          >
            {xLabels[0]}
          </text>
          <text
            x={chartWidth - 15}
            y={height - 5}
            fontSize={13}
            fill="#52525b"
            textAnchor="end"
            fontWeight="500"
          >
            {xLabels[xLabels.length - 1]}
          </text>
        </>
      )}
    </svg>
  );
}
