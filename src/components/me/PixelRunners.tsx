'use client';

import React from 'react';

export function PixelRunners() {
  return (
    <div className="relative w-full h-6 overflow-hidden border-t border-zinc-800/50 bg-zinc-950/30">
      <div className="absolute bottom-0 left-0 right-0 flex overflow-hidden py-1">
        <div className="text-[10px] text-zinc-600 font-mono whitespace-nowrap flex gap-8 animate-scroll-text">
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
