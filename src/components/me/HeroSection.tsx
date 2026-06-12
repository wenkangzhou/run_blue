'use client';

import React, { useEffect, useRef, useState } from 'react';
import { StravaActivity } from '@/types';
import { formatDistance, formatDuration } from '@/lib/strava';
import { TrajectoryCanvas } from './TrajectoryCanvas';
import { formatLocalDateKey, getActivityDate, parseStravaLocalDateParts } from '@/lib/dates';
import { CalendarDays, Clock3, MapPinned, Route, Sparkles } from 'lucide-react';

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
  const firstYear = getYearFromDateString(stats.firstRunDate);
  const latestYear = getYearFromDateString(stats.latestRunDate);
  const currentYear = new Date().getFullYear();
  const now = new Date();
  const recentRuns = activities.filter((activity) => {
    const days = (now.getTime() - getActivityDate(activity).getTime()) / (24 * 60 * 60 * 1000);
    return days >= 0 && days <= 30;
  });
  const currentYearRuns = activities.filter((activity) => getActivityDate(activity).getFullYear() === currentYear);
  const recentDistance = recentRuns.reduce((sum, activity) => sum + activity.distance, 0);
  const currentYearDistance = currentYearRuns.reduce((sum, activity) => sum + activity.distance, 0);
  const avgRunDistance = stats.totalRuns > 0 ? stats.totalDistance / stats.totalRuns : 0;

  return (
    <section className="relative px-4 pb-10 pt-10 sm:pb-14 sm:pt-16">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 shadow-2xl shadow-black/30">
        <TrajectoryCanvas activities={activities} />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,9,11,0.98),rgba(8,9,11,0.88),rgba(8,9,11,0.7))]" />
        <div className="relative grid min-h-[560px] gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.05fr)_380px] lg:p-10">
          <div className="flex flex-col justify-between gap-8">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
                <Sparkles size={13} />
                RUN BLUE PROFILE
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-none tracking-normal text-zinc-50 sm:text-6xl">
                跑步档案
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                从 {firstYear ?? '--'} 到 {latestYear ?? '--'}，把每一次训练留下的路线、跑量和节奏变化整理成一份可浏览的个人记录。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QuickStat icon={<Route size={15} />} label="今年跑量" value={formatDistance(currentYearDistance)} />
              <QuickStat icon={<CalendarDays size={15} />} label="近30天" value={formatDistance(recentDistance)} />
              <QuickStat icon={<Clock3 size={15} />} label="总时长" value={formatDuration(stats.totalTime)} />
              <QuickStat icon={<MapPinned size={15} />} label="平均单次" value={formatDistance(avgRunDistance)} />
            </div>
          </div>

          <div className="grid content-end gap-3">
          <BigStat
            label="累计距离"
            value={Math.round(stats.totalDistance / 1000)}
            suffix=" km"
            sub={formatDistance(stats.totalDistance)}
          />
          <BigStat
            label="累计跑步"
            value={stats.totalRuns}
            suffix=""
            sub={firstYear ? `始于 ${firstYear}` : '始于 --'}
          />
          <BigStat
            label="累计时长"
            value={Math.round(stats.totalTime / 3600)}
            suffix=" h"
            sub={formatDuration(stats.totalTime)}
          />
          <BigStat
            label="累计爬升"
            value={Math.round(stats.totalElevation)}
            suffix=" m"
            sub={`单次最高 ${Math.round(maxElevation.total_elevation_gain || 0)}m`}
          />
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-4 grid max-w-6xl grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoCard
          label="最长单次"
          value={formatDistance(longestRun.distance)}
          sub={longestRun.name}
          date={formatLocalDateKey(getActivityDate(longestRun))}
        />
        <InfoCard
          label="最高爬升"
          value={`${Math.round(maxElevation.total_elevation_gain || 0)}m`}
          sub={maxElevation.name}
          date={formatLocalDateKey(getActivityDate(maxElevation))}
        />
        <InfoCard
          label="活跃年份"
          value={`${stats.yearCount} 年`}
          sub={firstYear && latestYear ? `${firstYear} - ${latestYear}` : '--'}
          date={`${activities.length} 条跑步记录`}
        />
      </div>
    </section>
  );
}

function getYearFromDateString(dateString?: string): number | null {
  if (!dateString) return null;
  const parts = parseStravaLocalDateParts(dateString);
  return Number.isFinite(parts.year) ? parts.year : null;
}

function BigStat({ label, value, suffix, sub }: { label: string; value: number; suffix: string; sub: string }) {
  return (
    <div className="group relative rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 transition-all duration-300 hover:border-cyan-400/30 sm:p-5">
      <div className="mb-2 text-[10px] text-zinc-500">{label}</div>
      <div className="text-3xl font-black tracking-normal text-zinc-100 transition-colors group-hover:text-cyan-200 sm:text-4xl">
        <AnimatedNumber value={value} suffix={suffix} />
      </div>
      <div className="mt-1 text-xs text-zinc-600">{sub}</div>
    </div>
  );
}

function InfoCard({ label, value, sub, date }: { label: string; value: string; sub: string; date: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-4">
      <div className="mb-1 text-[10px] text-zinc-500">{label}</div>
      <div className="text-lg font-black text-zinc-100 sm:text-xl">{value}</div>
      <div className="mt-1 truncate text-xs text-zinc-500">{sub}</div>
      {date && <div className="mt-1 text-[10px] text-zinc-600">{date}</div>}
    </div>
  );
}

function QuickStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-black/30 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-cyan-300">
        {icon}
        <span className="text-[10px] text-zinc-500">{label}</span>
      </div>
      <div className="truncate text-sm font-bold text-zinc-100">{value}</div>
    </div>
  );
}
