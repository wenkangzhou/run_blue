'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Activity, AlertCircle, BarChart3, Database, ListChecks, LogIn, RefreshCw, UserRound } from 'lucide-react';
import { useProfileActivities } from '@/hooks/useProfileActivities';
import type { ActivityHistorySyncProgress } from '@/hooks/useActivityHistorySync';
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
    syncProgress,
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
          syncProgress={syncProgress}
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
  syncProgress,
  syncError,
}: {
  canRefresh: boolean;
  isRefreshDisabled: boolean;
  isRefreshing: boolean;
  lastFetchedAt: number | null;
  onRefresh: () => Promise<void>;
  source: 'strava' | 'demo';
  syncProgress: ActivityHistorySyncProgress | null;
  syncError: string | null;
}) {
  const isBackgroundSyncing = syncProgress?.phase === 'recent' || syncProgress?.phase === 'history';
  const showStatusLine = Boolean(syncError) || source === 'demo';
  const statusText = syncError
    ? syncError
    : source === 'demo'
      ? 'Demo 数据 · 登录后使用你的 Strava 记录'
      : isBackgroundSyncing
        ? getSyncProgressText(syncProgress)
        : '';

  return (
    <div className="sticky top-0 z-20 border-b border-zinc-800/80 bg-[#08090b]/85 backdrop-blur-xl">
      <div className="mx-auto grid max-w-6xl gap-3 px-3 py-2.5 sm:px-4 sm:py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
              <UserRound size={15} />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-black text-zinc-100">个人档案</span>
                <span
                  className={[
                    'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]',
                    source === 'strava'
                      ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-500',
                  ].join(' ')}
                >
                  {source === 'strava' ? 'Strava' : 'Demo'}
                </span>
              </div>
              {showStatusLine && (
                <div
                  className={[
                    'mt-1 flex min-w-0 items-center gap-1.5 text-[10px]',
                    syncError ? 'text-amber-200' : 'text-zinc-500',
                  ].join(' ')}
                >
                  {syncError ? (
                    <AlertCircle size={12} className="shrink-0" />
                  ) : (
                    <Database size={12} className="shrink-0" />
                  )}
                  <span className="truncate">{statusText}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <ProfileNavLink href="/activities" icon={<Activity size={13} />} label="活动" />
          <ProfileNavLink href="/stats" icon={<BarChart3 size={13} />} label="统计" />
          <ProfileNavLink href="/routes" icon={<ListChecks size={13} />} label="路线" />
          {canRefresh && (
            <button
              type="button"
              onClick={() => {
                onRefresh().catch((error) => console.error('[Profile] Refresh failed:', error));
              }}
              disabled={isRefreshDisabled}
              className="col-span-3 inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2 text-[10px] font-bold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-1 sm:px-3"
              title={getRefreshButtonTitle(source, lastFetchedAt)}
              aria-label="更新最新 Strava 数据"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span className="truncate">{isRefreshing ? '同步中' : '同步最新'}</span>
            </button>
          )}
          {source === 'demo' && (
            <a
              href="/api/auth/signin/strava"
              className="col-span-3 inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border border-orange-400/35 bg-orange-500/15 px-2 text-[10px] font-bold text-orange-100 transition-colors hover:border-orange-300/70 hover:bg-orange-500/20 sm:col-span-1 sm:px-3"
            >
              <LogIn size={13} className="shrink-0" />
              <span className="truncate">登录</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileNavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/70 px-2 text-[10px] font-bold text-zinc-300 transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/10 hover:text-cyan-100 sm:px-3"
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function getRefreshButtonTitle(source: 'strava' | 'demo', lastFetchedAt: number | null) {
  if (source === 'demo') return '登录后同步 Strava 数据';
  if (!lastFetchedAt) return '更新最新 Strava 数据';

  return `更新最新 Strava 数据，上次更新时间 ${formatSyncTime(lastFetchedAt)}`;
}

function formatSyncTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function getSyncProgressText(progress: ActivityHistorySyncProgress | null) {
  if (!progress) return '后台同步中';
  if (progress.phase === 'recent') return '正在同步最近活动';
  if (progress.page) {
    return `后台同步历史数据 · 第 ${progress.page} 页 · 新增 ${progress.activitiesFetched} 条`;
  }
  return `后台同步历史数据 · 新增 ${progress.activitiesFetched} 条`;
}
