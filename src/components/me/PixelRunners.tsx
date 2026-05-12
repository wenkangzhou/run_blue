'use client';

import React from 'react';

interface Runner {
  id: number;
  color: string;
  speed: number;
  delay: number;
  yOffset: number;
  scale: number;
}

const RUNNERS: Runner[] = [
  { id: 1, color: '#4ade80', speed: 3.5, delay: 0, yOffset: 2, scale: 1 },
  { id: 2, color: '#fbbf24', speed: 4.2, delay: 0.8, yOffset: 0, scale: 0.85 },
  { id: 3, color: '#f87171', speed: 3, delay: 1.5, yOffset: 4, scale: 1.1 },
  { id: 4, color: '#60a5fa', speed: 3.8, delay: 0.4, yOffset: 1, scale: 0.9 },
  { id: 5, color: '#a78bfa', speed: 4.5, delay: 1.1, yOffset: 3, scale: 0.95 },
  { id: 6, color: '#34d399', speed: 2.8, delay: 2, yOffset: 0, scale: 1.15 },
  { id: 7, color: '#fb923c', speed: 5, delay: 0.2, yOffset: 2, scale: 0.8 },
  { id: 8, color: '#e879f9', speed: 3.3, delay: 1.7, yOffset: 1, scale: 1 },
];

// 8-bit runner frames — each array is a row of pixels (0=empty, 1=color)
// Frame 1: left leg forward / right leg back
const FRAME_A = [
  [0,0,1,1,0,0,0],
  [0,1,1,1,1,0,0],
  [0,0,1,1,0,0,0],
  [0,0,1,1,0,0,0],
  [0,1,0,0,1,0,0],
  [1,0,0,0,0,1,0],
  [0,0,0,0,0,1,1],
];

// Frame 2: right leg forward / left leg back
const FRAME_B = [
  [0,0,1,1,0,0,0],
  [0,1,1,1,1,0,0],
  [0,0,1,1,0,0,0],
  [0,0,1,1,0,0,0],
  [0,1,0,0,1,0,0],
  [0,1,0,0,1,0,0],
  [1,1,0,0,0,0,0],
];

function PixelSprite({ color, size }: { color: string; size: number }) {
  return (
    <div className="relative" style={{ width: 7 * size, height: 7 * size }}>
      {/* Frame A */}
      <div
        className="absolute inset-0 animate-run-frame-a"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(7, ${size}px)`,
          gridTemplateRows: `repeat(7, ${size}px)`,
        }}
      >
        {FRAME_A.flat().map((p, i) => (
          <div key={`a-${i}`} style={{ backgroundColor: p ? color : 'transparent' }} />
        ))}
      </div>
      {/* Frame B */}
      <div
        className="absolute inset-0 animate-run-frame-b"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(7, ${size}px)`,
          gridTemplateRows: `repeat(7, ${size}px)`,
        }}
      >
        {FRAME_B.flat().map((p, i) => (
          <div key={`b-${i}`} style={{ backgroundColor: p ? color : 'transparent' }} />
        ))}
      </div>
    </div>
  );
}

function PixelRunner({ runner }: { runner: Runner }) {
  const pixelSize = runner.scale > 1 ? 4 : 3;
  return (
    <div
      className={`absolute pixel-run-${runner.id}`}
      style={{ top: runner.yOffset }}
    >
      <div className="relative">
        {/* Shadow */}
        <div
          className="absolute -bottom-0.5 left-1/2 w-5 h-1 rounded-full bg-black/30 animate-runner-shadow"
          style={{ filter: 'blur(1px)', marginLeft: -10 }}
        />
        {/* Runner sprite */}
        <div className="animate-real-run">
          <PixelSprite color={runner.color} size={pixelSize} />
        </div>
      </div>
    </div>
  );
}

export function PixelRunners() {
  return (
    <div className="relative w-full h-10 overflow-hidden border-t border-zinc-800/50 bg-zinc-950/30">
      {/* Retro grid lines */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(74,222,128,0.3) 3px, rgba(74,222,128,0.3) 4px)',
          backgroundSize: '100% 4px',
        }}
      />

      {RUNNERS.map((runner) => (
        <PixelRunner key={runner.id} runner={runner} />
      ))}

      {/* Scrolling status text */}
      <div className="absolute bottom-0 left-0 right-0 flex overflow-hidden">
        <div className="text-[9px] text-zinc-700 font-mono whitespace-nowrap flex gap-8 animate-scroll-text">
          <span>morning_run.exe [OK]</span>
          <span>pace: 5:32/km</span>
          <span>distance: 10.2km</span>
          <span>heart_rate: 155bpm</span>
          <span>elevation: +120m</span>
          <span>stride: 1.2m</span>
          <span>cadence: 180spm</span>
          <span>weather: clear</span>
          <span>route: riverside_loop</span>
          <span>status: FINISHED</span>
          <span>morning_run.exe [OK]</span>
          <span>pace: 5:32/km</span>
          <span>distance: 10.2km</span>
          <span>heart_rate: 155bpm</span>
          <span>elevation: +120m</span>
          <span>stride: 1.2m</span>
          <span>cadence: 180spm</span>
          <span>weather: clear</span>
          <span>route: riverside_loop</span>
          <span>status: FINISHED</span>
        </div>
      </div>
    </div>
  );
}
