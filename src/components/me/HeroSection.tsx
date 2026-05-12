'use client';

import React, { useEffect, useRef, useState } from 'react';
import { StravaActivity } from '@/types';
import { formatDistance, formatDuration } from '@/lib/strava';
import { TrajectoryCanvas } from './TrajectoryCanvas';
import { GlitchText } from './GlitchText';

interface HeroSectionProps {
  activities: StravaActivity[];
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

function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {
      setDisplay(value);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 1500;
          const start = performance.now();
          const animate = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplay(Math.floor(eased * value));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

export function HeroSection({ activities, stats }: HeroSectionProps) {
  if (!stats) return null;

  const longestRun = activities.reduce((max, a) => (a.distance > max.distance ? a : max), activities[0]);
  const maxElevation = activities.reduce((max, a) => ((a.total_elevation_gain || 0) > (max.total_elevation_gain || 0) ? a : max), activities[0]);

  return (
    <section className="relative px-4 py-12 sm:py-20 overflow-hidden">
      {/* Background trajectory animation */}
      <TrajectoryCanvas activities={activities} />

      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div className="max-w-6xl mx-auto relative">
        {/* Glitch Title */}
        <div className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
            <GlitchText text="RUNNER ARCHIVE" className="text-zinc-100" />
          </h1>
          <div className="h-px w-24 bg-green-400/50 mt-3" />
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <BigStat
            label="TOTAL DISTANCE"
            value={Math.round(stats.totalDistance / 1000)}
            suffix=" km"
            sub={formatDistance(stats.totalDistance)}
          />
          <BigStat
            label="TOTAL RUNS"
            value={stats.totalRuns}
            suffix=""
            sub={`Since ${new Date(stats.firstRunDate || '').getFullYear()}`}
          />
          <BigStat
            label="TOTAL TIME"
            value={Math.round(stats.totalTime / 3600)}
            suffix=" h"
            sub={formatDuration(stats.totalTime)}
          />
          <BigStat
            label="ELEVATION"
            value={Math.round(stats.totalElevation)}
            suffix=" m"
            sub={`Max ${Math.round(maxElevation.total_elevation_gain || 0)}m`}
          />
        </div>

        {/* Secondary Stats */}
        <div className="mt-8 sm:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <InfoCard
            label="LONGEST RUN"
            value={formatDistance(longestRun.distance)}
            sub={longestRun.name}
            date={new Date(longestRun.start_date).toLocaleDateString('zh-CN')}
          />
          <InfoCard
            label="HIGHEST CLIMB"
            value={`${Math.round(maxElevation.total_elevation_gain || 0)}m`}
            sub={maxElevation.name}
            date={new Date(maxElevation.start_date).toLocaleDateString('zh-CN')}
          />
          <InfoCard
            label="ACTIVE YEARS"
            value={`${stats.yearCount}`}
            sub={`${new Date(stats.firstRunDate || '').getFullYear()} — ${new Date(stats.latestRunDate || '').getFullYear()}`}
            date=""
          />
        </div>
      </div>
    </section>
  );
}

function BigStat({ label, value, suffix, sub }: { label: string; value: number; suffix: string; sub: string }) {
  return (
    <div className="group relative border border-zinc-800 bg-zinc-950 p-4 sm:p-6 hover:border-green-400/30 transition-all duration-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.05)]">
      <div className="text-[10px] text-zinc-500 mb-2 tracking-widest">{label}</div>
      <div className="text-3xl sm:text-5xl font-bold text-zinc-100 tracking-tight group-hover:text-green-400/90 transition-colors">
        <AnimatedNumber value={value} suffix={suffix} />
      </div>
      <div className="text-xs text-zinc-600 mt-1">{sub}</div>
      {/* Corner accent */}
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-zinc-700 group-hover:border-green-400/50 transition-colors" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-zinc-700 group-hover:border-green-400/50 transition-colors" />
    </div>
  );
}

function InfoCard({ label, value, sub, date }: { label: string; value: string; sub: string; date: string }) {
  return (
    <div className="border border-zinc-800/60 bg-zinc-900/20 p-4">
      <div className="text-[10px] text-zinc-500 tracking-widest mb-1">{label}</div>
      <div className="text-lg sm:text-xl font-bold text-zinc-200">{value}</div>
      <div className="text-xs text-zinc-500 mt-1 truncate">{sub}</div>
      {date && <div className="text-[10px] text-zinc-600 mt-1">{date}</div>}
    </div>
  );
}
