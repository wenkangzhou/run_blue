'use client';

import React, { useEffect, useRef, useState } from 'react';

interface SimpleLineChartProps {
  data: number[];
  color: string;
  height?: number;
  fill?: boolean;
  gradientFill?: boolean;
  showYAxis?: boolean;
  xLabels?: string[];
  yUnit?: string;
  formatYLabel?: (value: number) => string;
  domain?: [number, number];
  smooth?: number;
  showAvgLine?: boolean;
  interactive?: boolean;
  onPointClick?: (index: number, value: number) => void;
}

export function SimpleLineChart({
  data,
  color,
  height = 130,
  fill = false,
  gradientFill = true,
  showYAxis = false,
  xLabels,
  yUnit = '',
  formatYLabel,
  domain,
  smooth,
  showAvgLine = true,
  interactive = true,
  onPointClick,
}: SimpleLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(320);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

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
  const dataAvg = sampledData.reduce((a, b) => a + b, 0) / sampledData.length;

  const min = domain ? domain[0] : dataMin;
  const max = domain ? domain[1] : dataMax;
  const range = max - min || 1;

  const labelWidth = showYAxis
    ? Math.min(48, Math.max(36, Math.round(containerWidth * 0.1)))
    : 0;
  const xLabelHeight = 16;
  const topPad = 4;
  const bottomPad = showYAxis ? 14 : 18;
  const chartWidth = containerWidth;
  const chartHeight = height - xLabelHeight - topPad - bottomPad;

  // Gradient id (unique per instance to avoid collisions)
  const gradId = React.useId().replace(/:/g, '');

  // Build segments
  type Point = { x: number; y: number };
  const segments: Point[][] = [];
  let currentSeg: Point[] = [];

  sampledData.forEach((value, index) => {
    const x = labelWidth + (index / (sampledData.length - 1)) * (chartWidth - labelWidth - (showYAxis ? 10 : 4));
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

  const shouldFill = fill || gradientFill;
  const fillPath = shouldFill
    ? segments
        .map((seg) => {
          if (seg.length === 0) return '';
          const path = seg.map((p, i) => (i === 0 ? 'M' : 'L') + ` ${p.x},${p.y}`).join(' ');
          return `${path} L ${seg[seg.length - 1].x},${topPad + chartHeight} L ${seg[0].x},${topPad + chartHeight} Z`;
        })
        .join(' ')
    : '';

  const avgY = topPad + ((max - dataAvg) / range) * chartHeight;

  const yTicks = showYAxis ? [min, (min + max) / 2, max] : [];

  // Click handler: find nearest data point by x position
  const handleChartClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const plotLeft = labelWidth;
    const plotRight = chartWidth - (showYAxis ? 10 : 4);
    const plotWidth = plotRight - plotLeft;
    if (plotWidth <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clickX - plotLeft) / plotWidth));
    const idx = Math.round(ratio * (sampledData.length - 1));
    const clampedIdx = Math.max(0, Math.min(sampledData.length - 1, idx));
    setSelectedIndex(clampedIdx);
    if (onPointClick) {
      onPointClick(clampedIdx, sampledData[clampedIdx]);
    }
  };

  const textStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 9,
    fontWeight: 400,
  };

  // Selected point position
  const selectedPoint = selectedIndex !== null ? (() => {
    const value = sampledData[selectedIndex];
    if (value < min || value > max) return null;
    const x = labelWidth + (selectedIndex / (sampledData.length - 1)) * (chartWidth - labelWidth - (showYAxis ? 10 : 4));
    const y = topPad + ((max - value) / range) * chartHeight;
    return { x, y, value };
  })() : null;

  return (
    <div ref={containerRef} className="w-full select-none">
      <svg
        width={chartWidth}
        height={height}
        viewBox={`0 0 ${chartWidth} ${height}`}
        className="block overflow-visible"
        onClick={handleChartClick}
        style={{ cursor: interactive ? 'crosshair' : 'default' }}
      >
        <defs>
          <linearGradient id={`grad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="60%" stopColor={color} stopOpacity={0.08} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Grid lines & Y-axis labels (only when showYAxis) */}
        {showYAxis && yTicks.map((tick, i) => {
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
                x={labelWidth - 6}
                y={y}
                fill="#a1a1aa"
                textAnchor="end"
                dominantBaseline="middle"
                style={textStyle}
              >
                {formatYLabel ? formatYLabel(tick) : `${Math.round(tick)}${yUnit}`}
              </text>
            </g>
          );
        })}

        {/* Avg line (subtle dashed) */}
        {showAvgLine && (
          <line
            x1={labelWidth}
            y1={avgY}
            x2={chartWidth - (showYAxis ? 10 : 4)}
            y2={avgY}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3,3"
            opacity={0.25}
          />
        )}

        {/* Gradient fill */}
        {shouldFill && fillPath && (
          <path d={fillPath} fill={`url(#grad-${gradId})`} />
        )}

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Selected point indicator (Apple Fitness style) */}
        {interactive && selectedPoint && (
          <g>
            {/* Vertical line */}
            <line
              x1={selectedPoint.x}
              y1={topPad}
              x2={selectedPoint.x}
              y2={topPad + chartHeight}
              stroke={color}
              strokeWidth={1}
              opacity={0.4}
              strokeDasharray="2,2"
            />
            {/* Point dot */}
            <circle
              cx={selectedPoint.x}
              cy={selectedPoint.y}
              r={4}
              fill={color}
              stroke="#fff"
              strokeWidth={2}
            />
            {/* Value label */}
            <text
              x={selectedPoint.x}
              y={selectedPoint.y - 10}
              fill={color}
              textAnchor="middle"
              style={{ ...textStyle, fontSize: 10, fontWeight: 700 }}
            >
              {formatYLabel ? formatYLabel(selectedPoint.value) : `${Math.round(selectedPoint.value)}${yUnit}`}
            </text>
          </g>
        )}

        {/* X-axis labels */}
        {xLabels && xLabels.length >= 2 && (
          <>
            <text
              x={labelWidth}
              y={height - 2}
              fill="#a1a1aa"
              textAnchor="start"
              style={textStyle}
            >
              {xLabels[0]}
            </text>
            <text
              x={chartWidth - (showYAxis ? 10 : 4)}
              y={height - 2}
              fill="#a1a1aa"
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
