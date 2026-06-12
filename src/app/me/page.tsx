'use client';

import React, { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
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
    isLoading,
    isSyncing,
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
          isSyncing={isSyncing}
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
            <span>{stats?.totalRuns ?? 0} 次记录 · {stats?.yearCount ?? 0} 年跑步数据 · {source === 'strava' ? 'Strava 缓存' : 'Demo 数据'}</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function ProfileSyncBar({
  canRefresh,
  isSyncing,
  lastFetchedAt,
  onRefresh,
  source,
  syncError,
}: {
  canRefresh: boolean;
  isSyncing: boolean;
  lastFetchedAt: number | null;
  onRefresh: () => Promise<void>;
  source: 'strava' | 'demo';
  syncError: string | null;
}) {
  return (
    <div className="mx-auto flex max-w-6xl justify-end px-4 pt-4">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/70 px-2 py-1.5 text-[10px] text-zinc-500 backdrop-blur">
        <span>{getProfileSyncText(source, lastFetchedAt, syncError)}</span>
        {canRefresh && (
          <button
            type="button"
            onClick={() => {
              onRefresh().catch((error) => console.error('[Profile] Refresh failed:', error));
            }}
            disabled={isSyncing}
            className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            title="更新最新 Strava 数据"
            aria-label="更新最新 Strava 数据"
          >
            <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </div>
  );
}

function getProfileSyncText(source: 'strava' | 'demo', lastFetchedAt: number | null, syncError: string | null) {
  if (syncError) return syncError;
  if (source === 'demo') return '未登录预览';
  if (!lastFetchedAt) return '正在同步 Strava';

  return `最近更新 ${new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(lastFetchedAt))}`;
}
