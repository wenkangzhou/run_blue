'use client';

import React, { useEffect, useRef, useState } from 'react';

interface SimpleLineChartProps {
  data: number[];
  color: string;
  height?: number;
  fill?: boolean;
  xLabels?: string[];
  yUnit?: string;
  formatYLabel?: (value: number) => string;
  domain?: [number, number];
  smooth?: number; // moving average window size
}

export function SimpleLineChart({
  data,
  color,
  height = 220,
  fill = false,
  xLabels,
  yUnit = '',
  formatYLabel,
  domain,
  smooth
}: SimpleLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(320);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerWidth(Math.max(280, Math.floor(rect.width)));
    };
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!data || data.length === 0) return null;

  const targetPoints = smooth ? 120 : 200;
  const sampleRate = Math.ceil(data.length / targetPoints);
  let sampledData = sampleRate > 1
    ? data.filter((_, i) => i % sampleRate === 0)
    : data;

  // Optional moving average smoothing
  if (smooth && smooth > 1 && sampledData.length >= smooth) {
    sampledData = sampledData.map((_, i) => {
      const half = Math.floor(smooth / 2);
      const start = Math.max(0, i - half);
      const end = Math.min(sampledData.length, i + half + 1);
      const slice = sampledData.slice(start, end);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
  }

  const dataMin = Math.min(...sampledData);
  const dataMax = Math.max(...sampledData);

  const min = domain ? domain[0] : dataMin;
  const max = domain ? domain[1] : dataMax;
  const range = max - min || 1;

  const labelWidth = Math.min(52, Math.max(40, Math.round(containerWidth * 0.12)));
  const xLabelHeight = 20;
  const topPad = 22;
  const bottomPad = 14;
  const chartWidth = containerWidth;
  const chartHeight = height - xLabelHeight - topPad - bottomPad;

  // Build segments: split path when values are outside domain
  type Point = { x: number; y: number };
  const segments: Point[][] = [];
  let currentSeg: Point[] = [];

  sampledData.forEach((value, index) => {
    const x = labelWidth + (index / (sampledData.length - 1)) * (chartWidth - labelWidth - 10);
    if (value < min || value > max) {
      if (currentSeg.length) {
        segments.push(currentSeg);
        currentSeg = [];
      }
    } else {
      const y = topPad + ((max - value) / range) * chartHeight;
      currentSeg.push({ x, y });
    }
  });
  if (currentSeg.length) segments.push(currentSeg);

  const linePath = segments
    .map((seg) => {
      if (seg.length === 0) return '';
      if (!smooth || seg.length <= 2) {
        return seg.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p.x},${p.y}`).join(' ');
      }
      let d = `M ${seg[0].x},${seg[0].y}`;
      for (let i = 0; i < seg.length - 1; i++) {
        const p0 = seg[i - 1] || seg[i];
        const p1 = seg[i];
        const p2 = seg[i + 1];
        const p3 = seg[i + 2] || p2;
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      }
      return d;
    })
    .join(' ');

  const fillPath = fill
    ? segments
        .map((seg) => {
          if (seg.length === 0) return '';
          const path = seg.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p.x},${p.y}`).join(' ');
          return `${path} L ${seg[seg.length - 1].x},${topPad + chartHeight} L ${seg[0].x},${topPad + chartHeight} Z`;
        })
        .join(' ')
    : linePath;

  const yTicks = [min, (min + max) / 2, max];

  const textStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 10,
    fontWeight: 400,
  };

  return (
    <div ref={containerRef} className="w-full">
      <svg
        width={chartWidth}
        height={height}
        viewBox={`0 0 ${chartWidth} ${height}`}
        className="block overflow-visible"
      >
        {/* 网格线和Y轴标签 */}
        {yTicks.map((tick, i) => {
          const y = topPad + ((max - tick) / range) * chartHeight;
          return (
            <g key={i}>
              <line
                x1={labelWidth}
                y1={y}
                x2={chartWidth - 6}
                y2={y}
                stroke="#e4e4e7"
                strokeWidth={1}
                strokeDasharray="4,2"
              />
              <text
                x={labelWidth - 8}
                y={y}
                fill="#71717a"
                textAnchor="end"
                dominantBaseline="middle"
                style={textStyle}
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
          strokeWidth={smooth ? 2 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X轴标签 */}
        {xLabels && xLabels.length >= 2 && (
          <>
            <text
              x={labelWidth}
              y={height - 4}
              fill="#71717a"
              textAnchor="start"
              style={textStyle}
            >
              {xLabels[0]}
            </text>
            <text
              x={chartWidth - 6}
              y={height - 4}
              fill="#71717a"
              textAnchor="end"
              style={textStyle}
            >
              {xLabels[xLabels.length - 1]}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
