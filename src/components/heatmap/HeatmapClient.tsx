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
import { ChevronLeft, ChevronRight, MapPin, X, Filter, BarChart3, Loader2, Download, Route, ArrowLeft } from 'lucide-react';

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
  const accessToken = user?.accessToken;
  const { isSyncing: loadingMore, syncHistory } = useActivityHistorySync(accessToken);

  const allYears = useMemo(() => {
    const years = new Set<number>();
    activities.forEach(a => years.add(getActivityDate(a).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [activities]);

  const mapActivities = useMemo<HeatmapActivity[]>(() => {
    return activities
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
  }, [activities, filters]);

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
    <div className="h-screen w-full relative bg-zinc-50 dark:bg-zinc-950 flex overflow-hidden">
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

        {/* Floating popup card on map (left side, below filter) */}
        {popupActivity && !sidebarOpen && (
          <div className="absolute top-14 left-3 z-[1000] w-56 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border border-zinc-200 dark:border-zinc-700 shadow-lg px-3 py-2">
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
              >
                <X size={13} />
              </button>
            </div>
            <Link
              href={`/activities/${popupActivity.id}`}
              className="inline-flex items-center gap-1 mt-1 font-mono text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              <MapPin size={10} />
              {language === 'zh' ? '查看详情' : 'View Details'}
            </Link>
          </div>
        )}

        {/* Back Button */}
        <button
          onClick={handleBack}
          className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 px-3 py-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border border-zinc-200 dark:border-zinc-700 font-mono text-xs font-bold shadow-sm hover:bg-white dark:hover:bg-zinc-900 transition-colors"
        >
          <ArrowLeft size={14} />
          {language === 'zh' ? '返回' : 'Back'}
        </button>

        {/* Filter Toggle */}
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className="absolute top-3 left-20 z-[1000] flex items-center gap-1.5 px-3 py-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border border-zinc-200 dark:border-zinc-700 font-mono text-xs font-bold shadow-sm hover:bg-white dark:hover:bg-zinc-900 transition-colors"
        >
          <Filter size={14} />
          {t('common.filter')}
        </button>

        {/* Segments Toggle */}
        <button
          onClick={() => {
            if (!showSegments && segments.length === 0) {
              loadSegments();
            }
            setShowSegments(!showSegments);
          }}
          className={`absolute top-3 left-36 z-[1000] flex items-center gap-1.5 px-3 py-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border font-mono text-xs font-bold shadow-sm transition-colors ${
            showSegments
              ? 'border-orange-400 text-orange-600 dark:text-orange-400'
              : 'border-zinc-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900'
          }`}
        >
          <Route size={14} />
          {language === 'zh' ? '路段' : 'Segments'}
        </button>

        {/* Filter Panel */}
        {filterOpen && (
          <div className="absolute top-12 left-3 z-[1000] w-52 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border border-zinc-200 dark:border-zinc-700 shadow-lg p-3">
            <div className="mb-1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] font-bold uppercase text-zinc-500">{language === 'zh' ? '年份' : 'Year'}</span>
                <button onClick={() => setFilters(prev => ({ ...prev, years: [] }))} className="font-mono text-[10px] text-blue-500 hover:underline">{language === 'zh' ? '全部' : 'All'}</button>
              </div>
              <div className="flex flex-wrap gap-1">
                {allYears.map(year => (
                  <button key={year} onClick={() => toggleYear(year)}
                    className={`px-2 py-0.5 font-mono text-[10px] border transition-colors ${
                      filters.years.length === 0 || filters.years.includes(year)
                        ? 'border-zinc-800 dark:border-zinc-200 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-400'
                    }`}>{year}</button>
                ))}
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <span className="font-mono text-[10px] font-bold uppercase text-zinc-500 block mb-1">{language === 'zh' ? '运动' : 'Sport'}</span>
              <span className="font-mono text-[10px] px-2 py-0.5 border border-zinc-800 dark:border-zinc-200 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900">{t(TYPE_LABELS['Run'])}</span>
            </div>
          </div>
        )}

        {/* Sidebar Toggle */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-3 right-3 z-[1000] flex items-center gap-1 px-2 py-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border border-zinc-200 dark:border-zinc-700 font-mono text-xs font-bold shadow-sm hover:bg-white dark:hover:bg-zinc-900 transition-colors"
          >
            <BarChart3 size={14} />
            <span className="hidden sm:inline">{language === 'zh' ? '列表' : 'List'}</span>
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {/* Sidebar */}
      {sidebarOpen && (
        <div className="absolute md:relative top-0 right-0 h-full w-56 md:w-56 border-l border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur md:backdrop-blur-none md:bg-white md:dark:bg-zinc-950 flex flex-col z-[100] shadow-2xl md:shadow-none">
          {/* Header */}
          <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="font-mono text-xs font-bold">{language === 'zh' ? '跑步地图' : 'Running Map'}</h2>
            <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Stats */}
          <div className="px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[9px] text-zinc-500 uppercase">{language === 'zh' ? '轨迹' : 'Tracks'}</span>
              <span className="font-mono text-sm font-bold">{totalRuns}</span>
            </div>
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
                title={language === 'zh' ? '加载更多' : 'Load More'}
              >
                {loadingMore ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {grouped.length === 0 ? (
              <div className="p-3 text-center">
                <p className="font-mono text-xs text-zinc-400">{language === 'zh' ? '暂无数据' : 'No data'}</p>
              </div>
            ) : (
              <>
                {showSegments && segments.length > 0 && (
                  <div className="border-b border-zinc-100 dark:border-zinc-900">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-orange-50 dark:bg-orange-900/10">
                      <div className="flex items-center gap-1.5">
                        <Route size={12} className="text-orange-500" />
                        <span className="font-mono text-[11px] font-bold">{language === 'zh' ? '附近路段' : 'Nearby Segments'}</span>
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
                          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                        >
                          <span className="w-1 h-1 rounded-full flex-shrink-0 bg-orange-400" />
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-[10px] truncate">{seg.name}</p>
                            <p className="font-mono text-[9px] text-zinc-400">
                              {(seg.distance / 1000).toFixed(1)} km · {seg.avg_grade?.toFixed(1) ?? 0}% · {seg.effort_count} efforts
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {grouped.map(({ year, items }) => (
                  <div key={year} className="border-b border-zinc-100 dark:border-zinc-900 last:border-b-0">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900/50">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getYearColor(year) }} />
                        <span className="font-mono text-[11px] font-bold">{year}</span>
                      </div>
                      <span className="font-mono text-[9px] text-zinc-400">{items.length}</span>
                    </div>
                    <div>
                      {items.map(activity => (
                        <button
                          key={activity.id}
                          onClick={() => handleListClick(activity)}
                          className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors ${
                            selectedId === activity.id ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                          }`}
                        >
                          <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: activity.color }} />
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-[10px] truncate">{activity.name}</p>
                            <p className="font-mono text-[9px] text-zinc-400">
                              {getActivityDate(activity).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </button>
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
