'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';

interface CanvasRouteMapProps {
  polyline: string | null;
  height?: string;
}

export function CanvasRouteMap({ polyline, height = '100%' }: CanvasRouteMapProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  React.useEffect(() => {
    if (!canvasRef.current || !polyline || polyline.length < 10) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const points = decodePolyline(polyline);
    if (points.length < 2) return;

    // Get container size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const heightPx = rect.height;

    canvas.width = width * dpr;
    canvas.height = heightPx * dpr;
    ctx.scale(dpr, dpr);

    // Compute bounds
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of points) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    // Add padding
    const latPad = (maxLat - minLat) * 0.15 || 0.001;
    const lngPad = (maxLng - minLng) * 0.15 || 0.001;
    minLat -= latPad;
    maxLat += latPad;
    minLng -= lngPad;
    maxLng += lngPad;

    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;

    // Aspect ratio correction: use the larger range to keep the route centered
    const scaleX = width / lngRange;
    const scaleY = heightPx / latRange;
    const scale = Math.min(scaleX, scaleY);

    const routeWidth = lngRange * scale;
    const routeHeight = latRange * scale;
    const offsetX = (width - routeWidth) / 2;
    const offsetY = (heightPx - routeHeight) / 2;

    // Transform lat/lng to canvas x/y
    const toCanvas = (lat: number, lng: number) => ({
      x: offsetX + (lng - minLng) * scale,
      y: offsetY + (maxLat - lat) * scale, // flip Y since canvas Y grows downward
    });

    // Colors
    const bgColor = isDark ? '#18181b' : '#f4f4f5'; // zinc-900 / zinc-100
    const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    const lineColor = isDark ? '#fbbf24' : '#2563eb'; // amber-400 / blue-600
    const shadowColor = isDark ? 'rgba(251,191,36,0.15)' : 'rgba(37,99,235,0.15)';

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, heightPx);

    // Draw subtle dot grid background
    const gridSpacing = 16;
    ctx.fillStyle = gridColor;
    for (let x = 0; x < width; x += gridSpacing) {
      for (let y = 0; y < heightPx; y += gridSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw route shadow/glow
    ctx.beginPath();
    const first = toCanvas(points[0][0], points[0][1]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const p = toCanvas(points[i][0], points[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = shadowColor;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw route line
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
      const p = toCanvas(points[i][0], points[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw start point
    ctx.beginPath();
    ctx.arc(first.x, first.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw end point
    const last = toCanvas(points[points.length - 1][0], points[points.length - 1][1]);
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.strokeStyle = bgColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [polyline, isDark]);

  const hasValidPolyline = polyline && polyline.length >= 10;
  const bgColor = isDark ? '#18181b' : '#f4f4f5';

  if (!hasValidPolyline) {
    return (
      <div
        style={{ height, backgroundColor: bgColor }}
        className="w-full h-full flex items-center justify-center"
      >
        <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-600" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ height, width: '100%', display: 'block', backgroundColor: bgColor }}
      className="w-full h-full"
    />
  );
}
