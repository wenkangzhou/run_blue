'use client';

import React, { useMemo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useProfileActivities } from '@/hooks/useProfileActivities';
import { getActivityYear } from '@/lib/dates';

import { HeroSection } from '@/components/me/HeroSection';
import { MeMap } from '@/components/me/MeMap';
import { MeStats } from '@/components/me/MeStats';
import { ActivityTimeline } from '@/components/me/ActivityTimeline';
import { FadeInSection } from '@/components/me/FadeInSection';
import { TerminalLoader } from '@/components/me/TerminalLoader';


export default function MePage() {
  const {
    activities,
    canRefresh,
    error,
    isRefreshDisabled,
    isRefreshing,
    isLoading,
    lastFetchedAt,
    refresh,
    source,
    syncError,
  } = useProfileActivities();

  const stats = useMemo(() => {
    if (activities.length === 0) return null;
    const totalDistance = activities.reduce((s, a) => s + a.distance, 0);
    const totalTime = activities.reduce((s, a) => s + a.moving_time, 0);
    const totalElevation = activities.reduce((s, a) => s + (a.total_elevation_gain || 0), 0);
    const totalRuns = activities.length;
    const years = new Set(activities.map((a) => getActivityYear(a)));
    const firstRun = activities[activities.length - 1];
    const latestRun = activities[0];
    return {
      totalDistance,
      totalTime,
      totalElevation,
      totalRuns,
      yearCount: years.size,
      firstRunDate: firstRun?.start_date_local || firstRun?.start_date,
      latestRunDate: latestRun?.start_date_local || latestRun?.start_date,
    };
  }, [activities]);

  if (isLoading) {
    return <TerminalLoader />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-red-400 font-mono flex items-center justify-center">
        <span className="text-sm">[ERROR] {error}</span>
      </div>
    );
  }

  return (
    <main className="dark min-h-screen overflow-hidden bg-[#08090b] font-mono text-zinc-100 selection:bg-cyan-400/25">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-96 bg-[linear-gradient(180deg,rgba(8,145,178,0.18),transparent)]" />
      <div className="relative z-10">
        <ProfileSyncBar
          canRefresh={canRefresh}
          isRefreshDisabled={isRefreshDisabled}
          isRefreshing={isRefreshing}
          lastFetchedAt={lastFetchedAt}
          onRefresh={refresh}
          source={source}
          syncError={syncError}
        />
        <FadeInSection>
          <HeroSection activities={activities} stats={stats} />
        </FadeInSection>
        <FadeInSection delay={100}>
          <MeMap activities={activities} />
        </FadeInSection>
        <FadeInSection delay={100}>
          <MeStats activities={activities} />
        </FadeInSection>
        <FadeInSection delay={100}>
          <ActivityTimeline activities={activities} />
        </FadeInSection>

        <footer className="border-t border-zinc-800/80 px-4 py-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
            <span>跑蓝个人档案</span>
            <span>{stats?.totalRuns ?? 0} 次记录 · {stats?.yearCount ?? 0} 年跑步数据 · {source === 'strava' ? 'Strava 数据' : 'Demo 数据'}</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function ProfileSyncBar({
  canRefresh,
  isRefreshDisabled,
  isRefreshing,
  lastFetchedAt,
  onRefresh,
  source,
  syncError,
}: {
  canRefresh: boolean;
  isRefreshDisabled: boolean;
  isRefreshing: boolean;
  lastFetchedAt: number | null;
  onRefresh: () => Promise<void>;
  source: 'strava' | 'demo';
  syncError: string | null;
}) {
  if (!canRefresh && !syncError) return null;

  return (
    <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 px-4 pt-4">
      {syncError && (
        <div className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-amber-400/25 bg-amber-400/10 px-2.5 text-[10px] text-amber-200">
          <AlertCircle size={13} />
          <span>{syncError}</span>
        </div>
      )}

      {canRefresh && (
        <button
          type="button"
          onClick={() => {
            onRefresh().catch((error) => console.error('[Profile] Refresh failed:', error));
          }}
          disabled={isRefreshDisabled}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-3 text-[10px] font-bold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          title={getRefreshButtonTitle(source, lastFetchedAt)}
          aria-label="更新最新 Strava 数据"
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
          <span>{isRefreshing ? '更新中' : '更新最新'}</span>
        </button>
      )}
    </div>
  );
}

function getRefreshButtonTitle(source: 'strava' | 'demo', lastFetchedAt: number | null) {
  if (source === 'demo') return '登录后同步 Strava 数据';
  if (!lastFetchedAt) return '更新最新 Strava 数据';

  return `更新最新 Strava 数据，上次更新时间 ${new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(lastFetchedAt))}`;
}
