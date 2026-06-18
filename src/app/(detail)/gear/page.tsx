'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useActivitiesStore } from '@/store/activities';
import { useAuth } from '@/hooks/useAuth';
import { StravaActivity } from '@/types';
import {
  mergeIntoGearCache,
  getGearCacheActivities,
  setGearCache,
  LightGearActivity,
} from '@/lib/gearCache';
import { useActivityHistorySync } from '@/hooks/useActivityHistorySync';
import {
  ChevronLeft,
  Footprints,
  Clock,
  Route,
  TrendingUp,
  Zap,
} from 'lucide-react';
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
      // ignore
    }
  }
  return activities;
}

/** Unified activity interface for gear stats calculation. */
interface UnifiedActivity {
  id: number;
  distance: number;
  moving_time: number;
  type: string;
  sport_type: string;
  gear_id: string | null;
  gear?: { id: string; name: string; distance: number };
  average_speed: number;
}

function toUnified(a: StravaActivity | LightGearActivity): UnifiedActivity {
  return {
    id: a.id,
    distance: a.distance,
    moving_time: a.moving_time,
    type: a.type,
    sport_type: a.sport_type,
    gear_id: a.gear_id || a.gear?.id || null,
    gear: a.gear,
    average_speed: a.average_speed,
  };
}

function calculateGearStats(activities: UnifiedActivity[]): Map<string, Omit<GearStats, 'name' | 'stravaDistance' | 'retired'>> {
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
  const {
    isSyncing: isLoadingAll,
    syncHistory,
    reset: resetHistorySync,
  } = useActivityHistorySync(user?.accessToken);

  const [gearDetails, setGearDetails] = React.useState<Map<string, StravaGear>>(new Map());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [gearCacheActivities, setGearCacheActivities] = React.useState<LightGearActivity[]>([]);
  const backgroundSyncStartedRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    getGearCacheActivities()
      .then((cachedActivities) => {
        if (!cancelled) setGearCacheActivities(cachedActivities);
      })
      .catch(() => {
        if (!cancelled) setGearCacheActivities([]);
      });
    return () => { cancelled = true; };
  }, []);

  // Merge all data sources: gear cache > activity caches > activities store
  const allActivities = React.useMemo((): UnifiedActivity[] => {
    const merged = new Map<number, UnifiedActivity>();

    // 1. Gear cache (lightweight, can hold 1000+ activities)
    for (const a of gearCacheActivities) {
      merged.set(a.id, toUnified(a));
    }

    // 2. Activity caches from detail pages
    for (const a of scanActivityCaches()) {
      merged.set(a.id, toUnified(a));
    }

    // 3. Activities store
    for (const a of activities) {
      const existing = merged.get(a.id);
      // Prefer existing if it has gear data that store activity lacks
      if (existing && (existing.gear_id || existing.gear) && !(a.gear_id || a.gear)) {
        // keep existing
      } else {
        merged.set(a.id, toUnified(a));
      }
    }

    return Array.from(merged.values());
  }, [activities, gearCacheActivities]);

  const gearIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const a of allActivities) {
      const gearId = a.gear_id || a.gear?.id;
      if (gearId && (a.sport_type === 'Run' || a.type === 'Run')) {
        ids.add(gearId);
      }
    }
    return Array.from(ids);
  }, [allActivities]);

  const gearNameFromCache = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of allActivities) {
      if (a.gear?.id && a.gear.name) {
        map.set(a.gear.id, a.gear.name);
      }
    }
    return map;
  }, [allActivities]);

  const activityStats = React.useMemo(() => calculateGearStats(allActivities), [allActivities]);

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
        const data = (await res.json()) as { gears?: StravaGear[] };
        if (!cancelled) {
          setGearDetails((prev) => {
            const next = new Map(prev);
            for (const g of data.gears || []) {
              next.set(g.id, g);
            }
            return next;
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'load_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGears();
    return () => { cancelled = true; };
  }, [gearIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the lightweight gear cache aligned without exposing sync mechanics in the UI.
  React.useEffect(() => {
    if (!user?.accessToken || backgroundSyncStartedRef.current) return;
    backgroundSyncStartedRef.current = true;

    let cancelled = false;

    async function syncGearHistory() {
      const initialStore = useActivitiesStore.getState();
      if (initialStore.activities.length === 0 && !initialStore.hasMore) return;

      await mergeIntoGearCache(initialStore.activities);
      if (!cancelled) {
        setGearCacheActivities(await getGearCacheActivities());
      }

      if (!initialStore.hasMore) {
        await setGearCache({
          loadedPages: initialStore.loadedPages,
          hasMore: false,
          lastFetchedAt: Date.now(),
        });
        return;
      }

      if (isLoadingAll) return;

      resetHistorySync();
      setError(null);

      try {
        await syncHistory({
          onPageLoaded: async ({ activities: pageActivities }) => {
            if (pageActivities.length > 0) {
              await mergeIntoGearCache(pageActivities);
              if (!cancelled) {
                setGearCacheActivities(await getGearCacheActivities());
              }
            }
          },
        });

        const store = useActivitiesStore.getState();
        await mergeIntoGearCache(store.activities);
        await setGearCache({ loadedPages: store.loadedPages, hasMore: store.hasMore, lastFetchedAt: Date.now() });
        if (!cancelled) {
          setGearCacheActivities(await getGearCacheActivities());
        }
      } catch (err) {
        console.error('[Gear] Background sync failed:', err);
        const msg = err instanceof Error ? err.message : '';
        if (!cancelled) {
          if (msg.includes('429')) setError('rate_limited');
          else if (msg.includes('401')) setError('token_expired');
          else setError('load_failed');
        }
      }
    }

    syncGearHistory().catch((err) => {
      console.error('[Gear] Background sync failed:', err);
      if (!cancelled) setError('load_failed');
    });

    return () => {
      cancelled = true;
    };
  }, [user?.accessToken, isLoadingAll, resetHistorySync, syncHistory]);

  // Build final gear stats list (filter out retired)
  const gearStats: GearStats[] = React.useMemo(() => {
    const list: GearStats[] = [];
    for (const [gearId, stats] of activityStats) {
      const detail = gearDetails.get(gearId);
      if (detail?.retired) continue;
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
  const totalRunningActivities = allActivities.filter(
    (a) => a.sport_type === 'Run' || a.type === 'Run'
  ).length;
  const linkedRunningActivities = gearStats.reduce((sum, gear) => sum + gear.activityCount, 0);
  const unlinkedRunningActivities = Math.max(0, totalRunningActivities - linkedRunningActivities);

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
        <div className="mb-4 flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {t('gear.basedOnActivities', '基于 {{count}} 条跑步记录', { count: totalRunningActivities })}
          </div>
          {hasData && (
            <div className="font-mono text-[10px] text-zinc-400">
              {gearStats.length} 双跑鞋 · {linkedRunningActivities} 次已绑定
              {unlinkedRunningActivities > 0 ? ` · ${unlinkedRunningActivities} 次未绑定` : ''}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-mono text-xs text-red-500 dark:border-red-800 dark:bg-red-900/20">
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

        {!loading && !hasData && !isLoadingAll && (
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
              <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-1">
                  <Footprints size={14} />
                  <span className="font-mono text-xs uppercase">{t('gear.totalShoes', '跑鞋数量')}</span>
                </div>
                <div className="font-pixel text-xl font-bold">{gearStats.length}</div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-1">
                  <Route size={14} />
                  <span className="font-mono text-xs uppercase">{t('gear.totalRuns', '跑步次数')}</span>
                </div>
                <div className="font-pixel text-xl font-bold">
                  {gearStats.reduce((sum, g) => sum + g.activityCount, 0)}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-1">
                  <TrendingUp size={14} />
                  <span className="font-mono text-xs uppercase">{t('gear.totalDistance', '总距离')}</span>
                </div>
                <div className="font-pixel text-xl font-bold">
                  {formatDistance(gearStats.reduce((sum, g) => sum + g.activityDistance, 0))}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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
                  className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                        <Footprints size={20} className="text-zinc-500 dark:text-zinc-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="break-words font-mono text-sm font-bold leading-5 text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-100">
                          {gear.name}
                        </h3>
                        <p className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                          {t('gear.officialDistance', '官方里程')}: {formatDistance(gear.stravaDistance)}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <div className="font-mono text-[10px] uppercase text-zinc-400">
                        本地统计
                      </div>
                      <div className="font-pixel text-lg font-bold text-blue-600 dark:text-blue-400">
                        {formatDistance(gear.activityDistance)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
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
                        {t('gear.totalRuns', '跑步次数')}
                      </div>
                      <div className="font-mono text-sm font-bold">
                        {gear.activityCount} {t('stats.runs')}
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
