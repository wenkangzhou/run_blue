'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useActivitiesStore } from '@/store/activities';
import { useAuth } from '@/hooks/useAuth';
import { StravaActivity } from '@/types';
import { getActivities } from '@/lib/strava';
import { ChevronLeft, Footprints, Clock, Route, TrendingUp, Zap, Loader2, Download } from 'lucide-react';
import { formatDistance, formatDuration } from '@/lib/strava';
import { formatPaceFromSeconds } from '@/lib/stats';

interface GearStats {
  gearId: string;
  name: string;
  stravaDistance: number;
  activityDistance: number;
  activityTime: number;
  activityCount: number;
  avgPace: number;
  retired: boolean;
}

interface StravaGear {
  id: string;
  name: string;
  distance: number;
  brand_name?: string;
  model_name?: string;
  retired: boolean;
}

interface CachedActivityEntry {
  activity: StravaActivity;
  timestamp: number;
}

const CACHE_PREFIX = 'run_blue_cache_activity_';
const MAX_AUTO_LOAD_PAGES = 5; // max 5 pages = 1000 activities

/** Scan localStorage for activity caches that contain gear data. */
function scanActivityCaches(): StravaActivity[] {
  if (typeof window === 'undefined') return [];
  const activities: StravaActivity[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CACHE_PREFIX)) continue;
    try {
      const data: CachedActivityEntry = JSON.parse(localStorage.getItem(key)!);
      if (data?.activity && (data.activity.gear_id || data.activity.gear)) {
        activities.push(data.activity);
      }
    } catch {
      // ignore malformed cache entries
    }
  }
  return activities;
}

function calculateGearStats(activities: StravaActivity[]): Map<string, Omit<GearStats, 'name' | 'stravaDistance' | 'retired'>> {
  const stats = new Map<string, { distance: number; time: number; count: number; speedSum: number; speedCount: number }>();

  for (const a of activities) {
    const gearId = a.gear_id || a.gear?.id;
    if (!gearId) continue;
    if (a.sport_type !== 'Run' && a.type !== 'Run') continue;

    const s = stats.get(gearId) || { distance: 0, time: 0, count: 0, speedSum: 0, speedCount: 0 };
    s.distance += a.distance;
    s.time += a.moving_time;
    s.count += 1;
    if (a.average_speed > 0) {
      s.speedSum += a.average_speed;
      s.speedCount += 1;
    }
    stats.set(gearId, s);
  }

  const result = new Map<string, Omit<GearStats, 'name' | 'stravaDistance' | 'retired'>>();
  for (const [gearId, s] of stats) {
    result.set(gearId, {
      gearId,
      activityDistance: s.distance,
      activityTime: s.time,
      activityCount: s.count,
      avgPace: s.speedCount > 0 ? s.speedSum / s.speedCount : 0,
    });
  }
  return result;
}

export default function GearPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activities = useActivitiesStore((s) => s.activities);
  const hasMore = useActivitiesStore((s) => s.hasMore);
  const loadedPages = useActivitiesStore((s) => s.loadedPages);
  const appendActivitiesBatch = useActivitiesStore((s) => s.appendActivitiesBatch);

  const [gearDetails, setGearDetails] = React.useState<Map<string, StravaGear>>(new Map());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [loadProgress, setLoadProgress] = React.useState<{ current: number; total: number } | null>(null);

  // Merge activities from store + activity caches
  const allActivitiesWithGear = React.useMemo(() => {
    const cachedActivities = scanActivityCaches();
    const merged = new Map<number, StravaActivity>();
    for (const a of cachedActivities) {
      merged.set(a.id, a);
    }
    for (const a of activities) {
      const existing = merged.get(a.id);
      if (existing && (existing.gear_id || existing.gear) && !(a.gear_id || a.gear)) {
        // keep cache version which has gear data
      } else {
        merged.set(a.id, a);
      }
    }
    return Array.from(merged.values());
  }, [activities]);

  const gearIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const a of allActivitiesWithGear) {
      const gearId = a.gear_id || a.gear?.id;
      if (gearId && (a.sport_type === 'Run' || a.type === 'Run')) {
        ids.add(gearId);
      }
    }
    return Array.from(ids);
  }, [allActivitiesWithGear]);

  const gearNameFromCache = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of allActivitiesWithGear) {
      if (a.gear?.id && a.gear.name) {
        map.set(a.gear.id, a.gear.name);
      }
    }
    return map;
  }, [allActivitiesWithGear]);

  const activityStats = React.useMemo(() => calculateGearStats(allActivitiesWithGear), [allActivitiesWithGear]);

  // Fetch gear details from Strava API
  React.useEffect(() => {
    if (gearIds.length === 0) return;
    const missingIds = gearIds.filter((id) => !gearDetails.has(id));
    if (missingIds.length === 0) return;

    let cancelled = false;
    async function fetchGears() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/gear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gearIds: missingIds }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setGearDetails((prev) => {
            const next = new Map(prev);
            for (const g of data.gears as StravaGear[]) {
              next.set(g.id, g);
            }
            return next;
          });
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGears();
    return () => { cancelled = true; };
  }, [gearIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load more activities to complete gear stats
  const handleLoadMore = React.useCallback(async () => {
    if (!user?.accessToken || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);

    let currentPage = loadedPages > 0 ? loadedPages + 1 : 1;
    const targetPage = currentPage + MAX_AUTO_LOAD_PAGES - 1;
    let localHasMore = hasMore;

    try {
      while (localHasMore && currentPage <= targetPage) {
        setLoadProgress({ current: currentPage - (loadedPages > 0 ? loadedPages : 0), total: MAX_AUTO_LOAD_PAGES });
        const newActivities = await getActivities(user.accessToken, currentPage, 200);

        if (newActivities.length === 0) {
          localHasMore = false;
          useActivitiesStore.getState().batchUpdate({ hasMore: false, loadedPages: currentPage });
          break;
        }

        appendActivitiesBatch(newActivities, currentPage, newActivities.length === 200, Date.now());
        localHasMore = newActivities.length === 200;
        currentPage++;
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('429')) {
        setError('rate_limited');
      } else if (msg.includes('401')) {
        setError('token_expired');
      } else {
        setError('load_failed');
      }
    } finally {
      setIsLoadingMore(false);
      setLoadProgress(null);
    }
  }, [user?.accessToken, isLoadingMore, loadedPages, hasMore, appendActivitiesBatch]);

  // Build final gear stats list (filter out retired)
  const gearStats: GearStats[] = React.useMemo(() => {
    const list: GearStats[] = [];
    for (const [gearId, stats] of activityStats) {
      const detail = gearDetails.get(gearId);
      if (detail?.retired) continue; // skip retired shoes
      const name = detail?.name || gearNameFromCache.get(gearId) || gearId;
      list.push({
        gearId,
        name,
        stravaDistance: detail?.distance || 0,
        retired: detail?.retired || false,
        activityDistance: stats.activityDistance,
        activityTime: stats.activityTime,
        activityCount: stats.activityCount,
        avgPace: stats.avgPace,
      });
    }
    list.sort((a, b) => b.activityDistance - a.activityDistance);
    return list;
  }, [activityStats, gearDetails, gearNameFromCache]);

  const hasData = gearStats.length > 0;
  const totalRunningActivities = allActivitiesWithGear.filter(
    (a) => a.sport_type === 'Run' || a.type === 'Run'
  ).length;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Sticky Header */}
      <div className="bg-white dark:bg-zinc-900 border-b-2 border-zinc-200 dark:border-zinc-700 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/activities"
            className="inline-flex items-center gap-1 font-mono text-sm font-bold uppercase text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </Link>
          <h1 className="font-pixel text-base font-bold">{t('gear.title', '跑鞋统计')}</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Info bar */}
        <div className="mb-4 flex items-center justify-between bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 px-4 py-3">
          <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {t('gear.basedOnActivities', '基于 {{count}} 条跑步记录', { count: totalRunningActivities })}
            {hasMore && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                ({t('gear.hasMore', '还有更多数据')})
              </span>
            )}
          </div>
          {hasMore && !isLoadingMore && (
            <button
              onClick={handleLoadMore}
              className="inline-flex items-center gap-1 font-mono text-xs font-bold uppercase px-3 py-1.5 bg-blue-100 text-blue-700 border-2 border-blue-400 hover:bg-blue-200 transition-colors"
            >
              <Download size={12} />
              {t('gear.loadMore', '加载更多')}
            </button>
          )}
          {isLoadingMore && loadProgress && (
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-blue-500" />
              <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                {t('gear.loadingProgress', '加载中 {{current}}/{{total}}', {
                  current: loadProgress.current,
                  total: loadProgress.total,
                })}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 font-mono text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 px-4 py-2">
            {error === 'token_expired'
              ? t('auth.sessionExpired')
              : error === 'rate_limited'
              ? t('errors.rateLimitedDesc')
              : t('gear.loadFailed', '加载失败，请重试')}
          </div>
        )}

        {loading && gearStats.length === 0 && (
          <div className="text-center py-12 font-mono text-sm text-zinc-500">
            {t('common.loading')}
          </div>
        )}

        {!loading && !hasData && !isLoadingMore && (
          <div className="text-center py-16">
            <Footprints size={48} className="mx-auto mb-4 text-zinc-300 dark:text-zinc-600" />
            <p className="font-mono text-base font-bold text-zinc-600 dark:text-zinc-400">
              {t('gear.emptyTitle', '暂无跑鞋数据')}
            </p>
            <p className="font-mono text-sm text-zinc-400 dark:text-zinc-500 mt-2">
              {t('gear.emptyHint', '在 Strava 中为活动添加跑鞋装备后即可查看统计')}
            </p>
          </div>
        )}

        {hasData && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 p-4">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-1">
                  <Footprints size={14} />
                  <span className="font-mono text-xs uppercase">{t('gear.totalShoes', '跑鞋数量')}</span>
                </div>
                <div className="font-pixel text-xl font-bold">{gearStats.length}</div>
              </div>
              <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 p-4">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-1">
                  <Route size={14} />
                  <span className="font-mono text-xs uppercase">{t('gear.totalRuns', '跑步次数')}</span>
                </div>
                <div className="font-pixel text-xl font-bold">
                  {gearStats.reduce((sum, g) => sum + g.activityCount, 0)}
                </div>
              </div>
              <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 p-4">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-1">
                  <TrendingUp size={14} />
                  <span className="font-mono text-xs uppercase">{t('gear.totalDistance', '总距离')}</span>
                </div>
                <div className="font-pixel text-xl font-bold">
                  {formatDistance(gearStats.reduce((sum, g) => sum + g.activityDistance, 0))}
                </div>
              </div>
              <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 p-4">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-1">
                  <Clock size={14} />
                  <span className="font-mono text-xs uppercase">{t('gear.totalTime', '总用时')}</span>
                </div>
                <div className="font-pixel text-xl font-bold">
                  {formatDuration(gearStats.reduce((sum, g) => sum + g.activityTime, 0))}
                </div>
              </div>
            </div>

            {/* Gear Cards */}
            <div className="space-y-3">
              {gearStats.map((gear) => (
                <div
                  key={gear.gearId}
                  className="bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-700 p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
                        <Footprints size={20} className="text-zinc-500 dark:text-zinc-400" />
                      </div>
                      <div>
                        <h3 className="font-mono text-sm font-bold">{gear.name}</h3>
                        <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          {t('gear.officialDistance', '官方里程')}: {formatDistance(gear.stravaDistance)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-pixel text-lg font-bold text-blue-600 dark:text-blue-400">
                        {formatDistance(gear.activityDistance)}
                      </div>
                      <div className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                        {gear.activityCount} {t('stats.runs')}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-3 border-t-2 border-zinc-100 dark:border-zinc-800">
                    <div>
                      <div className="font-mono text-xs text-zinc-400 dark:text-zinc-500 uppercase mb-1">
                        {t('activity.averagePace')}
                      </div>
                      <div className="font-mono text-sm font-bold flex items-center gap-1">
                        <Zap size={12} className="text-amber-500" />
                        {gear.avgPace > 0 ? formatPaceFromSeconds(1000 / gear.avgPace) + '/km' : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-xs text-zinc-400 dark:text-zinc-500 uppercase mb-1">
                        {t('activity.time')}
                      </div>
                      <div className="font-mono text-sm font-bold">
                        {formatDuration(gear.activityTime)}
                      </div>
                    </div>
                    <div>
                      <div className="font-mono text-xs text-zinc-400 dark:text-zinc-500 uppercase mb-1">
                        {t('activity.distance')}
                      </div>
                      <div className="font-mono text-sm font-bold">
                        {formatDistance(gear.activityDistance)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
