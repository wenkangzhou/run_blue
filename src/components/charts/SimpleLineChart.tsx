'use client';

import React from 'react';

interface SimpleLineChartProps {
  data: number[];
  color: string;
  height?: number;
  fill?: boolean;
}

export function SimpleLineChart({ data, color, height = 100, fill = false }: SimpleLineChartProps) {
  if (!data || data.length === 0) return null;

  // Sample data points to reduce rendering load
  const sampleRate = Math.ceil(data.length / 100);
  const sampledData = sampleRate > 1 
    ? data.filter((_, i) => i % sampleRate === 0)
    : data;

  const min = Math.min(...sampledData);
  const max = Math.max(...sampledData);
  const range = max - min || 1;

  const width = 100;
  const padding = 2;
  
  // Generate path
  const points = sampledData.map((value, index) => {
    const x = (index / (sampledData.length - 1)) * (width - padding * 2) + padding;
    const y = height - ((value - min) / range) * (height - padding * 2) - padding;
    return `${x},${y}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  
  // Fill path (close the area)
  const fillPath = fill 
    ? `${linePath} L ${width - padding},${height} L ${padding},${height} Z`
    : linePath;

  return (
    <div className="w-full" style={{ height }}>
      <svg 
        viewBox={`0 0 ${width} ${height}`} 
        className="w-full h-full"
        preserveAspectRatio="none"
      >
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
      </svg>
    </div>
  );
}
