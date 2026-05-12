'use client';

import React, { useState, useEffect } from 'react';
import { TypingText } from './TypingText';
import { PixelRunners } from './PixelRunners';

interface TerminalHeaderProps {
  stats: {
    totalDistance: number;
    totalTime: number;
    totalElevation: number;
    totalRuns: number;
    yearCount: number;
    firstRunDate?: string;
    latestRunDate?: string;
  } | null;
}

export function TerminalHeader({ stats }: TerminalHeaderProps) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative px-4 pt-8 pb-4">
      <div className="max-w-6xl mx-auto">
        {/* Terminal Window */}
        <div className="border border-zinc-700 bg-zinc-950/80 backdrop-blur-sm">
          {/* Title Bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-[10px] text-zinc-500 ml-2 uppercase tracking-wider">
                runner@wenkangzhou:~ — bash — 80x24
              </span>
            </div>
            <span className="text-[10px] text-zinc-600 font-mono">{time}</span>
          </div>

          {/* Pixel Runners */}
          <PixelRunners />

          {/* Terminal Body */}
          <div className="px-4 py-5 sm:px-6 sm:py-6">
            <div className="text-xs sm:text-sm text-green-400/90 leading-relaxed">
              <TypingText
                text={`$ ./init_runner_profile.sh\n> Loading data archive... [${stats?.totalRuns || 0} records found]\n> Parsing Strava export... OK\n> Generating visualization... OK\n> Welcome to the runner archive.`}
                speed={25}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
