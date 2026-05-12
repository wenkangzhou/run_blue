'use client';

import React, { useEffect, useRef } from 'react';
import { StravaActivity } from '@/types';
import { decodePolyline } from '@/lib/strava';

interface TrajectoryCanvasProps {
  activities: StravaActivity[];
}

export function TrajectoryCanvas({ activities }: TrajectoryCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pick random runs with polylines
    const runs = activities
      .filter((a) => a.map?.summary_polyline)
      .sort(() => Math.random() - 0.5)
      .slice(0, 40);

    const paths = runs
      .map((a) => {
        const pts = decodePolyline(a.map!.summary_polyline);
        if (pts.length < 2) return null;
        return pts;
      })
      .filter(Boolean) as [number, number][][];

    let progress = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.offsetWidth * window.devicePixelRatio;
      canvas.height = parent.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      ctx.clearRect(0, 0, w, h);

      // Compute bounding box of all paths
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      paths.forEach((path) => {
        path.forEach(([lat, lng]) => {
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
        });
      });

      const latRange = maxLat - minLat || 1;
      const lngRange = maxLng - minLng || 1;
      const pad = 0.1;

      const mapX = (lng: number) => ((lng - minLng) / lngRange) * (1 - pad * 2) * w + pad * w;
      const mapY = (lat: number) => h - ((lat - minLat) / latRange) * (1 - pad * 2) * h - pad * h;

      paths.forEach((path, idx) => {
        const pathProgress = Math.min(Math.max((progress - idx * 0.02) * 1.5, 0), 1);
        if (pathProgress <= 0) return;

        const drawLen = Math.floor(path.length * pathProgress);
        if (drawLen < 2) return;

        ctx.beginPath();
        ctx.moveTo(mapX(path[0][1]), mapY(path[0][0]));
        for (let i = 1; i < drawLen; i++) {
          ctx.lineTo(mapX(path[i][1]), mapY(path[i][0]));
        }

        const alpha = 0.08 + Math.sin(progress * 2 + idx) * 0.03;
        ctx.strokeStyle = `rgba(74, 222, 128, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      progress += 0.003;
      if (progress > 2) progress = 0;

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [activities]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}
