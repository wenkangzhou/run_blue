'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useActivitiesStore } from '@/store/activities';
import { StravaActivity } from '@/types';
import { ChevronLeft, Footprints, Clock, Route, TrendingUp, Zap } from 'lucide-react';
import { formatDistance, formatDuration } from '@/lib/strava';
import { formatPaceFromSeconds } from '@/lib/stats';

interface GearStats {
  gearId: string;
  name: string;
  stravaDistance: number; // official total distance from Strava
  activityDistance: number; // sum from our activities
  activityTime: number;
  activityCount: number;
  avgPace: number;
}

interface StravaGear {
  id: string;
  name: string;
  distance: number;
  brand_name?: string;
  model_name?: string;
  retired: boolean;
}

function calculateGearStats(activities: StravaActivity[]): Map<string, Omit<GearStats, 'name' | 'stravaDistance'>> {
  const stats = new Map<string, { distance: number; time: number; count: number; speedSum: number; speedCount: number }>();

  for (const a of activities) {
    const gearId = a.gear_id;
    if (!gearId) continue;
    // Only count running activities for shoe stats
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

  const result = new Map<string, Omit<GearStats, 'name' | 'stravaDistance'>>();
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
  const activities = useActivitiesStore((s) => s.activities);
  const [gearDetails, setGearDetails] = React.useState<Map<string, StravaGear>>(new Map());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Extract unique gear IDs from running activities
  const gearIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const a of activities) {
      if (a.gear_id && (a.sport_type === 'Run' || a.type === 'Run')) {
        ids.add(a.gear_id);
      }
    }
    return Array.from(ids);
  }, [activities]);

  // Calculate stats from activities
  const activityStats = React.useMemo(() => calculateGearStats(activities), [activities]);

  // Fetch gear details from Strava API
  React.useEffect(() => {
    if (gearIds.length === 0) return;

    // Skip fetch if we already have all gear details cached
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
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGears();
    return () => { cancelled = true; };
  }, [gearIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build final gear stats list
  const gearStats: GearStats[] = React.useMemo(() => {
    const list: GearStats[] = [];
    for (const [gearId, stats] of activityStats) {
      const detail = gearDetails.get(gearId);
      list.push({
        gearId,
        name: detail?.name || gearId,
        stravaDistance: detail?.distance || 0,
        activityDistance: stats.activityDistance,
        activityTime: stats.activityTime,
        activityCount: stats.activityCount,
        avgPace: stats.avgPace,
      });
    }
    // Sort by activity distance descending
    list.sort((a, b) => b.activityDistance - a.activityDistance);
    return list;
  }, [activityStats, gearDetails]);

  const hasData = gearStats.length > 0;

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
        {loading && gearStats.length === 0 && (
          <div className="text-center py-12 font-mono text-sm text-zinc-500">
            {t('common.loading')}
          </div>
        )}

        {error && !hasData && (
          <div className="text-center py-12 font-mono text-sm text-red-500">
            {error === 'token_expired'
              ? t('auth.sessionExpired')
              : error === 'rate_limited'
              ? t('errors.rateLimitedDesc')
              : t('errors.generic')}
          </div>
        )}

        {!loading && !hasData && (
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
