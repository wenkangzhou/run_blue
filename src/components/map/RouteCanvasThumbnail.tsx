'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';

interface RouteCanvasThumbnailProps {
  polyline: string | null;
}

// Match the visual treatment of the old RouteOnlyMap (route line on solid bg, no real tiles).
// Light: bg zinc-100, halo white, line near-black.
// Dark:  bg zinc-800, halo zinc-900, line zinc-400.
const THEME = {
  light: { bg: '#f4f4f5', halo: '#ffffff', haloAlpha: 0.88, line: '#1a1a1a', lineAlpha: 0.9 },
  dark: { bg: '#27272a', halo: '#18181b', haloAlpha: 0.68, line: '#a1a1aa', lineAlpha: 1 },
};

// Padding (px) kept around the route inside the canvas, mirrors Leaflet's fitBounds padding [8,8].
const PADDING = 10;

export function RouteCanvasThumbnail({ polyline }: RouteCanvasThumbnailProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hasValidPolyline = polyline && polyline.length >= 10;
    if (!hasValidPolyline) return; // empty state handled by the fallback below

    const points = decodePolyline(polyline);
    if (points.length < 2) return;

    const palette = isDark ? THEME.dark : THEME.light;

    const draw = () => {
      const container = canvas.parentElement;
      if (!container) return;
      const cssWidth = container.clientWidth;
      const cssHeight = container.clientHeight;
      if (cssWidth === 0 || cssHeight === 0) return;

      const dpr = window.devicePixelRatio || 1;
      // Only reallocate backing store when the pixel size actually changes.
      const targetWidth = Math.round(cssWidth * dpr);
      const targetHeight = Math.round(cssHeight * dpr);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // Background
      ctx.fillStyle = palette.bg;
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      // Bounding box
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (const [lat, lng] of points) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }

      const latRange = maxLat - minLat || 0.0001;
      const lngRange = maxLng - minLng || 0.0001;

      const availWidth = Math.max(cssWidth - PADDING * 2, 1);
      const availHeight = Math.max(cssHeight - PADDING * 2, 1);
      // Scale to fit while preserving aspect ratio.
      const scale = Math.min(availWidth / lngRange, availHeight / latRange);
      const routeWidth = lngRange * scale;
      const routeHeight = latRange * scale;
      const offsetX = (cssWidth - routeWidth) / 2;
      const offsetY = (cssHeight - routeHeight) / 2;

      const project = (lat: number, lng: number) => ({
        x: offsetX + (lng - minLng) * scale,
        y: offsetY + (maxLat - lat) * scale, // invert Y: higher lat = top
      });

      const projected = points.map(([lat, lng]) => project(lat, lng));

      const strokePath = () => {
        ctx.beginPath();
        ctx.moveTo(projected[0].x, projected[0].y);
        for (let i = 1; i < projected.length; i++) {
          ctx.lineTo(projected[i].x, projected[i].y);
        }
      };

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Halo (wide, soft) — matches RouteOnlyMap weight 5.
      strokePath();
      ctx.strokeStyle = palette.halo;
      ctx.globalAlpha = palette.haloAlpha;
      ctx.lineWidth = 5;
      ctx.stroke();

      // Main line — matches RouteOnlyMap weight 2.8.
      strokePath();
      ctx.strokeStyle = palette.line;
      ctx.globalAlpha = palette.lineAlpha;
      ctx.lineWidth = 2.8;
      ctx.stroke();

      ctx.globalAlpha = 1;
    };

    draw();

    // Redraw when the card resizes (responsive grid: 3–6 columns, window resize, theme toggle).
    const resizeObserver = new ResizeObserver(() => draw());
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    return () => resizeObserver.disconnect();
  }, [polyline, isDark]);

  const hasValidPolyline = polyline && polyline.length >= 10;
  const bgColor = isDark ? THEME.dark.bg : THEME.light.bg;

  if (!hasValidPolyline) {
    return (
      <div
        style={{ backgroundColor: bgColor }}
        className="w-full h-full flex items-center justify-center"
      >
        <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-600" />
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ backgroundColor: bgColor }}
    />
  );
}
