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
  domain?: [number, number];
}

export function SimpleLineChart({ 
  data, 
  color, 
  height = 140, 
  fill = false,
  xLabels,
  yUnit = '',
  formatYLabel,
  domain
}: SimpleLineChartProps) {
  if (!data || data.length === 0) return null;

  const sampleRate = Math.ceil(data.length / 120);
  const sampledData = sampleRate > 1 
    ? data.filter((_, i) => i % sampleRate === 0)
    : data;

  const dataMin = Math.min(...sampledData);
  const dataMax = Math.max(...sampledData);

  const min = domain ? domain[0] : dataMin;
  const max = domain ? domain[1] : dataMax;
  const range = max - min || 1;

  const labelWidth = 52;
  const xLabelHeight = 24;
  const chartWidth = 800;
  const chartHeight = height - xLabelHeight;

  // Build segments: split path when values are outside domain
  type Point = { x: number; y: number };
  const segments: Point[][] = [];
  let currentSeg: Point[] = [];

  sampledData.forEach((value, index) => {
    const x = labelWidth + (index / (sampledData.length - 1)) * (chartWidth - labelWidth - 15);
    if (value < min || value > max) {
      if (currentSeg.length) {
        segments.push(currentSeg);
        currentSeg = [];
      }
    } else {
      const y = ((max - value) / range) * chartHeight;
      currentSeg.push({ x, y });
    }
  });
  if (currentSeg.length) segments.push(currentSeg);

  const linePath = segments
    .map((seg) => seg.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p.x},${p.y}`).join(' '))
    .join(' ');

  const fillPath = fill
    ? segments
        .map((seg) => {
          if (seg.length === 0) return '';
          const path = seg.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p.x},${p.y}`).join(' ');
          return `${path} L ${seg[seg.length - 1].x},${chartHeight} L ${seg[0].x},${chartHeight} Z`;
        })
        .join(' ')
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
