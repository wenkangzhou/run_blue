'use client';

import React, { useEffect, useRef } from 'react';

const FRAME_W = 48;
const FRAME_H = 40;
const FRAMES = 4;

interface Runner {
  row: number;
  speed: number;
  offset: number;
  frameOffset: number;
}

const RUNNERS: Runner[] = [
  { row: 0, speed: 90, offset: -40, frameOffset: 0 },
  { row: 1, speed: 70, offset: -180, frameOffset: 0.12 },
  { row: 2, speed: 100, offset: -320, frameOffset: 0.22 },
  { row: 3, speed: 65, offset: -460, frameOffset: 0.06 },
  { row: 4, speed: 80, offset: -600, frameOffset: 0.16 },
  { row: 5, speed: 55, offset: -120, frameOffset: 0.26 },
  { row: 6, speed: 75, offset: -260, frameOffset: 0.08 },
  { row: 7, speed: 85, offset: -400, frameOffset: 0.18 },
];

export function RunnerLane() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = FRAME_H;
    };
    resize();

    const img = new Image();
    img.src = '/images/runner-sprite.png';
    img.onload = () => {
      imgRef.current = img;
      startAnimation();
    };

    function startAnimation() {
      const c = ctx!;
      const cv = canvas!;
      const startTime = performance.now();

      function loop(now: number) {
        const t = (now - startTime) / 1000;
        c.clearRect(0, 0, cv.width, cv.height);

        for (const r of RUNNERS) {
          const total = cv.width + FRAME_W + 100;
          const raw = (r.offset + t * r.speed) % total;
          const x = raw < 0 ? raw + total : raw;

          // 6 fps cycle = 4 frames every 0.667s
          const frameIndex = Math.floor((t + r.frameOffset) * 6) % FRAMES;

          c.drawImage(
            imgRef.current!,
            frameIndex * FRAME_W, r.row * FRAME_H, FRAME_W, FRAME_H,
            x - FRAME_W, 0, FRAME_W, FRAME_H
          );
        }

        animRef.current = requestAnimationFrame(loop);
      }

      animRef.current = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="w-full border-t border-b border-zinc-800/50 bg-zinc-950/30 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full block"
        style={{ height: FRAME_H, imageRendering: 'pixelated' }}
      />
    </div>
  );
}
