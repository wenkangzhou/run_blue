'use client';

import React, { useMemo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActivitiesStore } from '@/store/activities';
import { useSettingsStore } from '@/store/settings';
import { RouteMap } from './RouteMap';
import type { RouteMapHandle, SegmentItem } from './RouteMap';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useActivityHistorySync } from '@/hooks/useActivityHistorySync';
import { getActivityDate, getActivityTimestamp } from '@/lib/dates';
import { getGuestActivities, isGuestUser } from '@/lib/guestMode';
import { Activity, ArrowUpRight, ChevronLeft, MapPin, X, Filter, Loader2, Download, Route, ArrowLeft, Layers, List } from 'lucide-react';

interface FilterState {
  years: number[];
  types: string[];
}

interface HeatmapActivity {
  id: number;
  name: string;
  distance: number;
  start_date: string;
  start_date_local: string;
  type: string;
  summary_polyline: string | null;
  color: string;
}

type PopupActivity = Pick<HeatmapActivity, 'id' | 'name' | 'distance' | 'start_date'> & {
  start_date_local?: string;
};

const TYPE_LABELS: Record<string, string> = {
  Run: 'activity.run', Ride: 'activity.bike', Walk: 'activity.walk',
  Hike: 'activity.hike', Swim: 'activity.swim',
};
function getYearColor(year: number): string {
  const palette = ['#6aa5c8', '#7bb29a', '#d49a6a', '#a896c9', '#c98095', '#74aebc', '#b6a15a', '#8fa7bd', '#99b373', '#bd86a7'];
  return palette[Math.abs(year) % palette.length];
}
function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function HeatmapClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const { activities, hasMore } = useActivitiesStore();
  const { language } = useSettingsStore();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [popupActivity, setPopupActivity] = useState<PopupActivity | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({ years: [], types: ['Run'] });
  const [segments, setSegments] = useState<SegmentItem[]>([]);
  const [showSegments, setShowSegments] = useState(false);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const mapRef = useRef<RouteMapHandle | null>(null);
  const { user } = useAuth();
  const isGuest = isGuestUser(user);
  const sourceActivities = useMemo(
    () => (isGuest ? getGuestActivities() : activities),
    [isGuest, activities]
  );
  const sourceHasMore = isGuest ? false : hasMore;
  const accessToken = isGuest ? null : user?.accessToken;
  const { isSyncing: loadingMore, syncHistory } = useActivityHistorySync(accessToken);

  const allYears = useMemo(() => {
    const years = new Set<number>();
    sourceActivities.forEach(a => years.add(getActivityDate(a).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [sourceActivities]);

  const mapActivities = useMemo<HeatmapActivity[]>(() => {
    return sourceActivities
      .filter(a => {
        if (!a.map?.summary_polyline) return false;
        const year = getActivityDate(a).getFullYear();
        if (filters.years.length > 0 && !filters.years.includes(year)) return false;
        if (filters.types.length > 0 && !filters.types.includes(a.type)) return false;
        return true;
      })
      .map(a => ({
        id: a.id, name: a.name, distance: a.distance,
        start_date: a.start_date, start_date_local: a.start_date_local, type: a.type,
        summary_polyline: a.map?.summary_polyline ?? null,
        color: getYearColor(getActivityDate(a).getFullYear()),
      }));
  }, [sourceActivities, filters]);

  const grouped = useMemo(() => {
    const groups: Record<number, typeof mapActivities> = {};
    mapActivities.forEach(a => {
      const y = getActivityDate(a).getFullYear();
      if (!groups[y]) groups[y] = [];
      groups[y].push(a);
    });
    return Object.entries(groups)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([year, items]) => ({
        year: Number(year),
        items: items.sort((a, b) => getActivityTimestamp(b) - getActivityTimestamp(a)),
        totalDistance: items.reduce((s, i) => s + i.distance, 0),
      }));
  }, [mapActivities]);

  const totalRuns = mapActivities.length;
  const totalDistance = useMemo(
    () => mapActivities.reduce((sum, activity) => sum + activity.distance, 0),
    [mapActivities]
  );
  const hasFiltered = filters.years.length > 0 || filters.types.length !== 1 || filters.types[0] !== 'Run';

  const handleSelect = useCallback((id: number | null) => {
    setSelectedId(id);
  }, []);

  const handleShowPopup = useCallback((activity: PopupActivity | null) => {
    setPopupActivity(activity);
  }, []);

  const handleListClick = useCallback((activity: HeatmapActivity) => {
    setSelectedId(activity.id);
    setPopupActivity(activity); // show popup directly — one-step interaction
    // Fit map to this route
    if (mapRef.current?.fitActivity) {
      mapRef.current.fitActivity(activity.id);
    }
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const historyIndex = typeof window.history.state?.idx === 'number'
        ? window.history.state.idx
        : 0;

      if (historyIndex > 0) {
        router.back();
        window.setTimeout(() => {
          if (window.location.pathname === currentPath) {
            router.push('/activities');
          }
        }, 450);
        return;
      }
    }

    router.push('/activities');
  }, [router]);

  const toggleYear = useCallback((year: number) => {
    setFilters(prev => ({
      ...prev,
      years: prev.years.includes(year) ? prev.years.filter(y => y !== year) : [...prev.years, year],
    }));
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !accessToken) return;
    try {
      await syncHistory({ maxPages: 1, syncRecent: false });
    } catch (err) {
      console.error('Load more failed:', err);
    }
  }, [accessToken, loadingMore, syncHistory]);

  const loadSegments = useCallback(async () => {
    if (loadingSegments) return;
    setLoadingSegments(true);
    try {
      // Get current map bounds from the map ref if available, otherwise use default Shanghai bounds
      let bounds = '31.10,121.30,31.35,121.60'; // default Shanghai
      if (mapRef.current?.getBounds) {
        const b = mapRef.current.getBounds();
        if (b) {
          bounds = `${b.getSouthWest().lat.toFixed(4)},${b.getSouthWest().lng.toFixed(4)},${b.getNorthEast().lat.toFixed(4)},${b.getNorthEast().lng.toFixed(4)}`;
        }
      }
      const res = await fetch(`/api/segments/explore?bounds=${bounds}`);
      if (!res.ok) throw new Error('Failed to load segments');
      const data = (await res.json()) as { segments?: SegmentItem[] };
      setSegments(data.segments || []);
    } catch (err) {
      console.error('Load segments failed:', err);
    } finally {
      setLoadingSegments(false);
    }
  }, [loadingSegments]);

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-[#edf3f5] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      {/* Map Area */}
      <div className="flex-1 relative">
        <RouteMap
          ref={mapRef}
          activities={mapActivities}
          selectedId={selectedId}
          onSelect={handleSelect}
          onShowPopup={handleShowPopup}
          sidebarOpen={sidebarOpen}
          segments={showSegments ? segments : []}
        />

        {/* Top toolbar */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-[1000] flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex max-w-[calc(100%-64px)] gap-1 overflow-x-auto rounded-2xl border border-white/80 bg-white/88 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/88">
            <button
              onClick={handleBack}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 font-mono text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <ArrowLeft size={14} />
              {t('common.back')}
            </button>
            <button
              onClick={() => {
                setFilterOpen(!filterOpen);
                setSidebarOpen(false);
                setPopupActivity(null);
              }}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 font-mono text-xs font-bold transition-colors ${
                filterOpen || hasFiltered
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900'
              }`}
            >
              <Filter size={14} />
              {t('heatmap.filters')}
              {hasFiltered && (
                <span className="ml-0.5 rounded-full bg-white/20 px-1.5 text-[9px]">
                  {filters.years.length || t('heatmap.allYears')}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                if (!showSegments && segments.length === 0) {
                  loadSegments();
                }
                setShowSegments(!showSegments);
              }}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 font-mono text-xs font-bold transition-colors ${
                showSegments
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900'
              }`}
              title={showSegments ? t('heatmap.hideSegments') : t('heatmap.showSegments')}
            >
              {loadingSegments ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
              {t('heatmap.segments')}
            </button>
          </div>

          {!sidebarOpen && (
            <button
              onClick={() => {
                setSidebarOpen(true);
                setFilterOpen(false);
                setPopupActivity(null);
              }}
              className="pointer-events-auto inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-white/80 bg-white/90 px-3 font-mono text-xs font-bold text-zinc-800 shadow-[0_10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-colors hover:bg-white dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:text-zinc-100 dark:hover:bg-zinc-900"
              aria-label={t('heatmap.list')}
            >
              <List size={15} />
              <span className="hidden sm:inline">{t('heatmap.list')}</span>
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {/* Floating popup card on map */}
        {popupActivity && !sidebarOpen && (
          <div className="absolute left-3 top-16 z-[1000] w-64 rounded-2xl border border-white/80 bg-white/92 px-3 py-3 shadow-[0_16px_40px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/92">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold truncate">{popupActivity.name}</p>
                <p className="font-mono text-[10px] text-zinc-500">
                  {formatDistance(popupActivity.distance)} · {getActivityDate(popupActivity).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}
                </p>
              </div>
              <button
                onClick={() => { setPopupActivity(null); setSelectedId(null); }}
                className="flex-shrink-0 p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
                aria-label={t('common.close')}
              >
                <X size={13} />
              </button>
            </div>
            <Link
              href={`/activities/${popupActivity.id}`}
              className="mt-2 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 font-mono text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950"
            >
              <MapPin size={10} />
              {t('heatmap.viewDetails')}
            </Link>
          </div>
        )}

        {/* Filter Panel */}
        {filterOpen && (
          <div className="absolute left-3 top-16 z-[1000] w-[min(20rem,calc(100vw-24px))] rounded-2xl border border-white/80 bg-white/94 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/94">
            <div className="mb-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{t('heatmap.years')}</span>
                <button onClick={() => setFilters(prev => ({ ...prev, years: [] }))} className="rounded-full px-2 py-1 font-mono text-[10px] font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40">{t('heatmap.allYears')}</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {allYears.map(year => (
                  <button key={year} onClick={() => toggleYear(year)}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold transition-colors ${
                      filters.years.length === 0 || filters.years.includes(year)
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900'
                    }`}>{year}</button>
                ))}
              </div>
            </div>
            <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{t('heatmap.sport')}</span>
              <span className="inline-flex rounded-full border border-zinc-900 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] font-bold text-white dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-950">{t(TYPE_LABELS['Run'])}</span>
            </div>
            <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 font-mono text-[10px] leading-4 text-zinc-500 dark:bg-zinc-900/70 dark:text-zinc-400">
              {t('heatmap.denseModeHint')}
            </p>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-3 left-3 z-[900] hidden max-w-[calc(100%-24px)] rounded-2xl border border-white/75 bg-white/82 px-3 py-2 shadow-[0_10px_30px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/82 sm:block">
          <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
            <span className="inline-flex items-center gap-1 font-bold text-zinc-900 dark:text-zinc-100">
              <Activity size={12} />
              {t('heatmap.visibleTracks', { count: totalRuns })}
            </span>
            <span>{t('heatmap.visibleDistance', { distance: formatDistance(totalDistance) })}</span>
            {hasFiltered && (
              <span className="text-blue-600 dark:text-blue-300">
                {t('heatmap.filteredMatches', { matched: totalRuns, total: sourceActivities.length })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <div className="absolute right-3 top-3 z-[1001] flex h-[calc(100%-24px)] w-[min(22rem,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/80 bg-white/94 shadow-[0_22px_60px_rgba(15,23,42,0.20)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/94 md:right-0 md:top-0 md:h-full md:w-80 md:rounded-none md:border-y-0 md:border-r-0 md:shadow-none">
          {/* Header */}
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">{t('nav.heatmap')}</p>
                <h2 className="mt-1 truncate font-mono text-sm font-black text-zinc-950 dark:text-zinc-50">{t('heatmap.title')}</h2>
                <p className="mt-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{t('heatmap.subtitle')}</p>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100" aria-label={t('common.close')}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">{t('heatmap.tracks')}</p>
              <p className="mt-1 font-mono text-base font-black">{totalRuns}</p>
            </div>
            <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">{t('activity.distance')}</p>
              <p className="mt-1 truncate font-mono text-base font-black">{formatDistance(totalDistance)}</p>
            </div>
            {sourceHasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
                title={t('heatmap.loadMore')}
              >
                {loadingMore ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {grouped.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="font-mono text-sm font-bold text-zinc-700 dark:text-zinc-200">{t('heatmap.noData')}</p>
                <p className="mt-2 font-mono text-xs leading-5 text-zinc-500">{t('heatmap.noDataHint')}</p>
              </div>
            ) : (
              <>
                {showSegments && segments.length > 0 && (
                  <div className="border-b border-zinc-100 dark:border-zinc-900">
                    <div className="flex items-center justify-between bg-amber-50 px-4 py-2 dark:bg-amber-950/20">
                      <div className="flex items-center gap-1.5">
                        <Route size={12} className="text-orange-500" />
                        <span className="font-mono text-[11px] font-bold">{t('heatmap.nearbySegments')}</span>
                      </div>
                      <span className="font-mono text-[9px] text-zinc-400">{segments.length}</span>
                    </div>
                    <div>
                      {segments.map(seg => (
                        <a
                          key={seg.id}
                          href={`https://www.strava.com/segments/${seg.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        >
                          <span className="w-1 h-1 rounded-full flex-shrink-0 bg-orange-400" />
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-[10px] truncate">{seg.name}</p>
                            <p className="font-mono text-[9px] text-zinc-400">
                              {(seg.distance / 1000).toFixed(1)} km · {seg.avg_grade?.toFixed(1) ?? 0}% · {seg.effort_count} {t('heatmap.efforts')}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {grouped.map(({ year, items }) => (
                  <div key={year} className="border-b border-zinc-100 dark:border-zinc-900 last:border-b-0">
                    <div className="sticky top-0 z-10 flex items-center justify-between bg-zinc-50/95 px-4 py-2 backdrop-blur dark:bg-zinc-900/90">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getYearColor(year) }} />
                        <span className="font-mono text-[11px] font-bold">{year}</span>
                      </div>
                      <span className="font-mono text-[9px] text-zinc-400">
                        {items.length} · {formatDistance(items.reduce((sum, item) => sum + item.distance, 0))}
                      </span>
                    </div>
                    <div>
                      {items.map(activity => (
                        <div
                          key={activity.id}
                          className={`group flex items-center transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                            selectedId === activity.id ? 'bg-blue-50 dark:bg-blue-950/25' : ''
                          }`}
                        >
                          <button
                            onClick={() => handleListClick(activity)}
                            className="flex min-w-0 flex-1 items-center gap-2 px-4 py-2.5 text-left"
                          >
                            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: activity.color }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-mono text-[11px] font-bold text-zinc-800 dark:text-zinc-100">{activity.name}</span>
                              <span className="mt-0.5 block font-mono text-[9px] text-zinc-400">
                                {getActivityDate(activity).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
                                <span className="mx-1">·</span>
                                {formatDistance(activity.distance)}
                              </span>
                            </span>
                          </button>
                          <Link
                            href={`/activities/${activity.id}`}
                            className={`mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-blue-600 transition-all hover:bg-white dark:text-blue-300 dark:hover:bg-zinc-950 ${
                              selectedId === activity.id ? 'opacity-100' : 'opacity-60 md:opacity-0 md:group-hover:opacity-100'
                            }`}
                            aria-label={`${activity.name} ${t('heatmap.viewDetails')}`}
                            title={t('heatmap.viewDetails')}
                          >
                            <ArrowUpRight size={14} />
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
