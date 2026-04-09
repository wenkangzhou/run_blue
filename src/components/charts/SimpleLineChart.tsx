'use client';

import React from 'react';

interface SimpleLineChartProps {
  data: number[];
  color: string;
  height?: number;
  fill?: boolean;
  xLabels?: string[];
  yUnit?: string;
  minValue?: number;
  maxValue?: number;
  formatYLabel?: (value: number) => string;
}

export function SimpleLineChart({ 
  data, 
  color, 
  height = 140, 
  fill = false,
  xLabels,
  yUnit = '',
  minValue,
  maxValue,
  formatYLabel
}: SimpleLineChartProps) {
  if (!data || data.length === 0) return null;

  // Sample data points to reduce rendering load
  const sampleRate = Math.ceil(data.length / 100);
  const sampledData = sampleRate > 1 
    ? data.filter((_, i) => i % sampleRate === 0)
    : data;

  // 过滤掉无效数据 (NaN, null, undefined, Infinity)
  const validData = sampledData.filter(v => 
    typeof v === 'number' && !isNaN(v) && isFinite(v)
  );
  
  if (validData.length === 0) return null;
  
  const rawMin = Math.min(...validData);
  const rawMax = Math.max(...validData);
  const min = minValue !== undefined && !isNaN(minValue) ? minValue : rawMin;
  const max = maxValue !== undefined && !isNaN(maxValue) ? maxValue : rawMax;
  const range = Math.abs(max - min) || 1;

  const padding = { top: 10, right: 10, bottom: 25, left: 35 };
  const chartWidth = 300;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Generate path
  const points = sampledData.map((value, index) => {
    const x = padding.left + (index / (sampledData.length - 1)) * (chartWidth - padding.left - padding.right);
    const y = padding.top + chartHeight - ((value - min) / range) * chartHeight;
    return [x, y];
  });

  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p[0]},${p[1]}`).join(' ');
  
  // Fill path (close the area)
  const fillPath = fill 
    ? `${linePath} L ${points[points.length - 1][0]},${padding.top + chartHeight} L ${points[0][0]},${padding.top + chartHeight} Z`
    : linePath;

  // Y轴刻度 (3个) - 确保在合理范围内
  const mid = (min + max) / 2;
  const yTicks = [
    Math.max(min, 0),
    Math.max(Math.min(mid, max), min),
    Math.min(max, 100)
  ].filter((v, i, arr) => {
    // 去重，避免相同值
    return arr.indexOf(v) === i;
  });

  return (
    <div className="w-full" style={{ height }}>
      <svg 
        width="100%"
        height="100%"
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Y轴刻度线和标签 */}
        {yTicks.map((tick, i) => {
          const y = padding.top + chartHeight - ((tick - min) / range) * chartHeight;
          return (
            <g key={i}>
              {/* 网格线 */}
              <line
                x1={padding.left}
                y1={y}
                x2={chartWidth - padding.right}
                y2={y}
                stroke="#e4e4e7"
                strokeWidth={1}
                strokeDasharray="4,2"
              />
              {/* Y轴数值 */}
              <text
                x={padding.left - 5}
                y={y}
                fontSize={11}
                fill="#52525b"
                textAnchor="end"
                dominantBaseline="middle"
                fontWeight="500"
              >
                {(() => {
                  const value = Number(tick);
                  if (isNaN(value)) return '-';
                  if (formatYLabel) {
                    try {
                      return formatYLabel(value);
                    } catch (e) {
                      return `${Math.round(value)}${yUnit}`;
                    }
                  }
                  return `${Math.round(value)}${yUnit}`;
                })()}
              </text>
            </g>
          );
        })}

        {/* 图表区域 */}
        {fill && (
          <path
            d={fillPath}
            fill={color}
            fillOpacity={0.15}
          />
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
              x={padding.left}
              y={height - 5}
              fontSize={11}
              fill="#52525b"
              textAnchor="start"
              fontWeight="500"
            >
              {xLabels[0]}
            </text>
            <text
              x={chartWidth - padding.right}
              y={height - 5}
              fontSize={11}
              fill="#52525b"
              textAnchor="end"
              fontWeight="500"
            >
              {xLabels[xLabels.length - 1]}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
