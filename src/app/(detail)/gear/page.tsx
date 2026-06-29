'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useActivitiesStore } from '@/store/activities';
import { useAuth } from '@/hooks/useAuth';
import { getGuestActivities, isGuestUser } from '@/lib/guestMode';
import {
  mergeIntoGearCache,
  getGearCacheActivities,
  getGearCacheDetails,
  setGearCache,
  setGearCacheDetails,
  type CachedGearDetail,
  LightGearActivity,
} from '@/lib/gearCache';
import {
  buildGearStats,
  getShoeMileageState,
  mergeGearActivities,
  SHOE_MILEAGE_REFERENCE_METERS,
  sortGearStats,
  type GearSortMode,
  type GearStats,
} from '@/lib/gearStats';
import { useActivityHistorySync } from '@/hooks/useActivityHistorySync';
import {
  Archive,
  CheckCircle2,
  ChevronLeft,
  Footprints,
  Clock,
  ExternalLink,
  Route,
  Search,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { formatDistance, formatDuration } from '@/lib/strava';
import { formatPaceFromSeconds } from '@/lib/stats';
import { PageLoadingShell } from '@/components/PageLoadingShell';
import { useSessionPageState } from '@/hooks/useSessionPageState';

const GEAR_DETAILS_TTL = 1000 * 60 * 60 * 24;
const GEAR_SEARCH_STATE_KEY = 'run_blue_page:gear:search';
const GEAR_SORT_STATE_KEY = 'run_blue_page:gear:sort';
const GEAR_RETIRED_STATE_KEY = 'run_blue_page:gear:retired';
const GEAR_SORT_MODES: GearSortMode[] = ['distance', 'runs', 'pace', 'name'];

export default function GearPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isGuest = isGuestUser(user);
  const storeActivities = useActivitiesStore((s) => s.activities);
  const activities = React.useMemo(
    () => (isGuest ? getGuestActivities() : storeActivities),
    [isGuest, storeActivities]
  );
  const {
    isSyncing: isLoadingAll,
    syncHistory,
    reset: resetHistorySync,
  } = useActivityHistorySync(isGuest ? null : user?.accessToken);

  const [gearDetails, setGearDetails] = React.useState<Map<string, CachedGearDetail>>(new Map());
  const [gearDetailsFetchedAt, setGearDetailsFetchedAt] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [gearCacheActivities, setGearCacheActivities] = React.useState<LightGearActivity[]>([]);
  const [cacheHydrated, setCacheHydrated] = React.useState(false);
  const [searchQuery, setSearchQuery] = useSessionPageState<string>(
    GEAR_SEARCH_STATE_KEY,
    '',
    (value): value is string => typeof value === 'string'
  );
  const [sortMode, setSortMode] = useSessionPageState<GearSortMode>(
    GEAR_SORT_STATE_KEY,
    'distance',
    (value): value is GearSortMode => typeof value === 'string' && GEAR_SORT_MODES.includes(value as GearSortMode)
  );
  const [showRetired, setShowRetired] = useSessionPageState<boolean>(
    GEAR_RETIRED_STATE_KEY,
    false,
    (value): value is boolean => typeof value === 'boolean'
  );
  const backgroundSyncStartedRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getGearCacheActivities(), getGearCacheDetails()])
      .then(([cachedActivities, cachedDetails]) => {
        if (cancelled) return;
        setGearCacheActivities(cachedActivities);
        setGearDetails(new Map(cachedDetails.gearDetails.map((gear) => [gear.id, gear])));
        setGearDetailsFetchedAt(cachedDetails.fetchedAt);
        setCacheHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        setGearCacheActivities([]);
        setGearDetails(new Map());
        setGearDetailsFetchedAt(0);
        setCacheHydrated(true);
      });
    return () => { cancelled = true; };
  }, []);

  const allActivities = React.useMemo(() => {
    if (isGuest) return mergeGearActivities([], activities);
    return mergeGearActivities(gearCacheActivities, activities);
  }, [isGuest, activities, gearCacheActivities]);

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

  // Fetch gear details from Strava API
  React.useEffect(() => {
    if (isGuest) return;
    if (gearIds.length === 0) return;
    const detailsAreStale = Date.now() - gearDetailsFetchedAt > GEAR_DETAILS_TTL;
    const idsToFetch = detailsAreStale
      ? gearIds
      : gearIds.filter((id) => !gearDetails.has(id));
    if (idsToFetch.length === 0) return;

    let cancelled = false;
    async function fetchGears() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/gear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gearIds: idsToFetch }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { gears?: CachedGearDetail[] };
        if (!cancelled) {
          const fetchedAt = Date.now();
          setGearDetails((prev) => {
            const next = new Map(prev);
            for (const g of data.gears || []) {
              next.set(g.id, g);
            }
            return next;
          });
          setGearDetailsFetchedAt(fetchedAt);
          await setGearCacheDetails(data.gears || [], fetchedAt);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'load_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchGears();
    return () => { cancelled = true; };
  }, [isGuest, gearIds, gearDetails, gearDetailsFetchedAt]);

  // Keep the lightweight gear cache aligned without exposing sync mechanics in the UI.
  React.useEffect(() => {
    if (isGuest) return;
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
  }, [isGuest, user?.accessToken, isLoadingAll, resetHistorySync, syncHistory]);

  const allGearStats = React.useMemo(
    () => buildGearStats(allActivities, Array.from(gearDetails.values())),
    [allActivities, gearDetails]
  );
  const gearStats = React.useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    const filtered = allGearStats.filter((gear) => {
      if (!showRetired && gear.retired) return false;
      if (!normalizedQuery) return true;
      return [gear.name, gear.brandName, gear.modelName]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
    return sortGearStats(filtered, sortMode);
  }, [allGearStats, searchQuery, showRetired, sortMode]);

  const hasData = allGearStats.length > 0;
  const hasFilteredData = gearStats.length > 0;
  const activeGearCount = allGearStats.filter((gear) => !gear.retired).length;
  const retiredGearCount = allGearStats.length - activeGearCount;
  const totalRunningActivities = allActivities.filter(
    (a) => a.sport_type === 'Run' || a.type === 'Run'
  ).length;
  const linkedRunningActivities = allGearStats.reduce((sum, gear) => sum + gear.activityCount, 0);
  const unlinkedRunningActivities = Math.max(0, totalRunningActivities - linkedRunningActivities);
  const coverageRate = totalRunningActivities > 0
    ? Math.round((linkedRunningActivities / totalRunningActivities) * 100)
    : 0;

  if (!cacheHydrated && !isGuest && storeActivities.length === 0) {
    return <PageLoadingShell title={t('gear.title', '跑鞋统计')} maxWidth="4xl" variant="gear" />;
  }

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

      <main className="mx-auto max-w-5xl px-3 py-5 sm:px-4 md:py-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 font-mono text-[11px] font-bold uppercase text-blue-600 dark:text-blue-400">
              {t('gear.kicker')}
            </p>
            <h2 className="font-mono text-2xl font-black tracking-normal text-zinc-950 dark:text-zinc-50 md:text-3xl">
              {t('gear.pageTitle')}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
              {t('gear.pageDescription')}
            </p>
          </div>
          {hasData && (
            <div className="min-w-56 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] font-bold uppercase text-zinc-400">
                  {t('gear.coverage')}
                </span>
                <span className="font-mono text-xs font-black text-zinc-800 dark:text-zinc-100">
                  {coverageRate}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-600 transition-[width]"
                  style={{ width: `${coverageRate}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                {t('gear.coverageValue', {
                  rate: coverageRate,
                  linked: linkedRunningActivities,
                  total: totalRunningActivities,
                })}
              </p>
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
          <div>
            <div className="mb-5 grid grid-cols-2 border-y border-zinc-200 dark:border-zinc-800 md:grid-cols-4">
              <GearSummaryItem
                icon={<Footprints size={15} />}
                label={t('gear.activeShoes')}
                value={String(activeGearCount)}
              />
              <GearSummaryItem
                icon={<Archive size={15} />}
                label={t('gear.retiredShoes')}
                value={String(retiredGearCount)}
              />
              <GearSummaryItem
                icon={<Route size={15} />}
                label={t('gear.totalRuns')}
                value={String(linkedRunningActivities)}
              />
              <GearSummaryItem
                icon={<TrendingUp size={15} />}
                label={t('gear.totalDistance')}
                value={formatDistance(allGearStats.reduce((sum, gear) => sum + gear.activityDistance, 0))}
              />
            </div>

            <div className="mb-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="relative block">
                <span className="sr-only">{t('gear.searchLabel')}</span>
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('gear.searchPlaceholder')}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 font-mono text-xs outline-none transition-colors placeholder:text-zinc-400 focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-blue-500"
                />
              </label>

              <label className="relative block sm:w-40">
                <span className="sr-only">{t('gear.sortLabel')}</span>
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as GearSortMode)}
                  className="h-10 w-full appearance-none rounded-lg border border-zinc-200 bg-white px-3 pr-8 font-mono text-xs font-bold outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <option value="distance">{t('gear.sortDistance')}</option>
                  <option value="runs">{t('gear.sortRuns')}</option>
                  <option value="pace">{t('gear.sortPace')}</option>
                  <option value="name">{t('gear.sortName')}</option>
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] text-zinc-400">▼</span>
              </label>

              <div className="grid h-10 grid-cols-2 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setShowRetired(false)}
                  className={`min-w-20 rounded-md px-3 font-mono text-[11px] font-bold transition-colors ${
                    !showRetired
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {t('gear.activeOnly')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRetired(true)}
                  className={`min-w-20 rounded-md px-3 font-mono text-[11px] font-bold transition-colors ${
                    showRetired
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {t('gear.allShoes')}
                </button>
              </div>
            </div>

            {unlinkedRunningActivities > 0 && (
              <p className="mb-4 font-mono text-[10px] text-zinc-400">
                {t('gear.unlinkedRuns', { count: unlinkedRunningActivities })}
              </p>
            )}

            {!hasFilteredData ? (
              <div className="border-y border-zinc-200 py-14 text-center dark:border-zinc-800">
                <Search size={28} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
                <p className="font-mono text-sm font-bold">{t('gear.noFilteredShoes')}</p>
                <p className="mt-2 text-xs text-zinc-500">{t('gear.noFilteredShoesHint')}</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
              {gearStats.map((gear) => (
                <article
                  key={gear.gearId}
                  className="flex min-h-64 flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-blue-100 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/40">
                        <Footprints size={19} className="text-blue-600 dark:text-blue-300" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="break-words font-mono text-sm font-bold leading-5 text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-100">
                          {gear.name}
                        </h3>
                        {(gear.brandName || gear.modelName) && (
                          <p className="mt-0.5 truncate text-xs text-zinc-400">
                            {[gear.brandName, gear.modelName].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <GearStatusBadge gear={gear} />
                  </div>

                  <div className="mt-5">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase text-zinc-400">
                          {gear.stravaDistance > 0 ? t('gear.officialDistance') : t('gear.localDistance')}
                        </p>
                        <p className="mt-1 font-mono text-2xl font-black text-zinc-950 dark:text-zinc-50">
                          {formatDistance(gear.displayDistance)}
                        </p>
                      </div>
                      {gear.stravaDistance > 0 && Math.abs(gear.stravaDistance - gear.activityDistance) > 1000 && (
                        <p className="text-right font-mono text-[10px] text-zinc-400">
                          {t('gear.localDistance')}<br />
                          <span className="text-zinc-600 dark:text-zinc-300">
                            {formatDistance(gear.activityDistance)}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full ${
                          getShoeMileageState(gear.displayDistance) === 'replace'
                            ? 'bg-red-500'
                            : getShoeMileageState(gear.displayDistance) === 'watch'
                              ? 'bg-amber-500'
                              : 'bg-blue-600'
                        }`}
                        style={{
                          width: `${Math.min(100, (gear.displayDistance / SHOE_MILEAGE_REFERENCE_METERS) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] text-zinc-400">
                      <span>{t('gear.mileageReference')}</span>
                      <span>{Math.round(gear.displayDistance / 1000)} / 800 km</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <GearMetric
                      icon={<Zap size={12} className="text-amber-500" />}
                      label={t('activity.averagePace')}
                      value={gear.avgSpeed > 0 ? `${formatPaceFromSeconds(1000 / gear.avgSpeed)}/km` : '-'}
                    />
                    <GearMetric
                      icon={<Clock size={12} className="text-blue-500" />}
                      label={t('activity.time')}
                      value={formatDuration(gear.activityTime)}
                    />
                    <GearMetric
                      icon={<Route size={12} className="text-emerald-500" />}
                      label={t('gear.totalRuns')}
                      value={`${gear.activityCount} ${t('stats.runs')}`}
                    />
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                    <p className="max-w-64 text-[10px] leading-4 text-zinc-400">
                      {t('gear.mileageReferenceHint')}
                    </p>
                    <Link
                      href={`/activities?gear=${encodeURIComponent(gear.gearId)}`}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 px-3 font-mono text-[10px] font-bold text-zinc-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                    >
                      {t('gear.viewActivities')}
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                </article>
              ))}
              </div>
            )}
            </div>
        )}
      </main>
    </div>
  );
}

function GearSummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-b border-r border-zinc-200 px-3 py-4 last:border-r-0 dark:border-zinc-800 md:border-b-0">
      <div className="flex items-center gap-2 text-zinc-400">
        {icon}
        <span className="truncate font-mono text-[10px] font-bold uppercase">{label}</span>
      </div>
      <p className="mt-2 truncate font-mono text-lg font-black text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function GearMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate font-mono text-[9px] uppercase text-zinc-400">{label}</p>
      <div className="mt-1 flex min-w-0 items-center gap-1">
        <span className="shrink-0">{icon}</span>
        <span className="truncate font-mono text-xs font-bold text-zinc-800 dark:text-zinc-100">{value}</span>
      </div>
    </div>
  );
}

function GearStatusBadge({ gear }: { gear: GearStats }) {
  const { t } = useTranslation();
  if (gear.retired) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-[9px] font-bold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800">
        <Archive size={11} />
        {t('gear.retired')}
      </span>
    );
  }

  const state = getShoeMileageState(gear.displayDistance);
  const styles = state === 'replace'
    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300'
    : state === 'watch'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300';

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 font-mono text-[9px] font-bold ${styles}`}>
      <CheckCircle2 size={11} />
      {t(`gear.mileage${state === 'fresh' ? 'Fresh' : state === 'watch' ? 'Watch' : 'Replace'}`)}
    </span>
  );
}
