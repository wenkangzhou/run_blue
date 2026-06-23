'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { StravaActivity } from '@/types';
import { getAvailableYears } from '@/lib/stats';
import { decodePolyline } from '@/lib/strava';
import { ChevronLeft, ChevronRight, MapPinned, Route } from 'lucide-react';
import { getActivityDate } from '@/lib/dates';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';

type LeafletModule = typeof import('leaflet');

// Dynamic import leaflet to avoid SSR issues
const leafletPromise: Promise<LeafletModule | null> = typeof window !== 'undefined'
  ? Promise.all([
      import('leaflet'),
      import('leaflet/dist/leaflet.css'),
    ]).then(([mod]) => {
      return mod.default;
    })
  : Promise.resolve(null);

interface MeMapProps {
  activities: StravaActivity[];
}

export function MeMap({ activities }: MeMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [isReady, setIsReady] = useState(false);

  const years = useMemo(() => getAvailableYears(activities), [activities]);
  const mappedActivities = useMemo(
    () => activities.filter((activity) => activity.map?.summary_polyline),
    [activities]
  );
  const filteredActs = useMemo(() => {
    if (selectedYear === 'all') {
      return mappedActivities;
    }
    return mappedActivities.filter((a) => getActivityDate(a).getFullYear() === selectedYear);
  }, [mappedActivities, selectedYear]);

  useEffect(() => {
    if (selectedYear !== 'all' && !years.includes(selectedYear)) {
      setSelectedYear('all');
    }
  }, [selectedYear, years]);

  // Init map
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    leafletPromise.then((leaflet) => {
      if (!leaflet || !mapRef.current || leafletMapRef.current) return;
      const map = leaflet.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });
      map.setView([31.23, 121.47], 10);
      leaflet.control.zoom({ position: 'bottomright' }).addTo(map);

      leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;
      layerRef.current = leaflet.layerGroup().addTo(map);
      setIsReady(true);
    });

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  // Render polylines
  useEffect(() => {
    if (!isReady || !leafletMapRef.current || !layerRef.current) return;

    leafletPromise.then((leaflet) => {
      if (!leaflet || !leafletMapRef.current || !layerRef.current) return;
      const layer = layerRef.current;
      layer.clearLayers();

      const bounds = leaflet.latLngBounds([]);
      let hasValid = false;

      filteredActs.forEach((act) => {
        const poly = act.map?.summary_polyline;
        if (!poly) return;
        try {
          const latlngs = decodePolyline(poly) || [];
          if (latlngs.length < 2) return;
          const line = leaflet.polyline(latlngs, {
            color: selectedYear === 'all' ? 'rgba(34, 211, 238, 0.42)' : 'rgba(251, 191, 36, 0.78)',
            weight: selectedYear === 'all' ? 1.8 : 2.8,
            opacity: selectedYear === 'all' ? 0.82 : 0.92,
            lineCap: 'round',
            lineJoin: 'round',
          });
          layer.addLayer(line);
          latlngs.forEach((p: [number, number]) => bounds.extend(p));
          hasValid = true;
        } catch {
          // ignore decode errors
        }
      });

      if (hasValid && bounds.isValid && bounds.isValid()) {
        leafletMapRef.current.fitBounds(bounds, {
          padding: [28, 28],
          maxZoom: selectedYear === 'all' ? 12 : 16,
        });
      }
    });
  }, [filteredActs, isReady, selectedYear]);

  const prevYear = () => {
    if (years.length === 0) return;
    if (selectedYear === 'all') {
      setSelectedYear(years[years.length - 1]);
    } else {
      const idx = years.indexOf(selectedYear);
      if (idx > 0) setSelectedYear(years[idx - 1]);
      else setSelectedYear('all');
    }
  };

  const nextYear = () => {
    if (years.length === 0) return;
    if (selectedYear === 'all') {
      setSelectedYear(years[0]);
    } else {
      const idx = years.indexOf(selectedYear);
      if (idx < years.length - 1) setSelectedYear(years[idx + 1]);
    }
  };

  const activeYearCount = selectedYear === 'all'
    ? years.length
    : 1;

  return (
    <section className="px-3 py-4 sm:px-4 sm:py-7">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-4">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                <MapPinned size={14} />
                route atlas
              </div>
              <h2 className="text-lg font-black text-zinc-100">路线足迹</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                <span className="rounded-full border border-zinc-800 bg-black/25 px-2.5 py-1">
                  {selectedYear === 'all' ? '全部年份' : `${selectedYear} 年`}
                </span>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-200">
                  {filteredActs.length} 条轨迹
                </span>
                <span className="rounded-full border border-zinc-800 bg-black/25 px-2.5 py-1">
                  {activeYearCount} 个年份
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={prevYear}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100"
                aria-label="上一个年份"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-[78px] rounded-md border border-zinc-800 bg-black/30 px-3 py-1.5 text-center text-xs font-bold text-zinc-200">
                {selectedYear === 'all' ? '全部' : selectedYear}
              </span>
              <button
                onClick={nextYear}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100"
                aria-label="下一个年份"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="relative">
            <div ref={mapRef} className="h-[360px] w-full bg-zinc-900 sm:h-[520px]" />
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
                <div className="text-xs text-zinc-600">正在加载路线地图...</div>
              </div>
            )}
            {isReady && filteredActs.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 px-6 text-center backdrop-blur-sm">
                <div>
                  <Route size={28} className="mx-auto mb-3 text-zinc-600" />
                  <p className="text-sm font-bold text-zinc-300">这个年份暂无路线轨迹</p>
                  <p className="mt-1 text-xs text-zinc-600">可切换到全部年份查看已记录的路线</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-zinc-800 px-4 py-3">
            <button
              onClick={() => setSelectedYear('all')}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] transition-colors ${
                selectedYear === 'all'
                  ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              <Route size={11} />
              全部
            </button>
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`rounded-md border px-2.5 py-1.5 text-[10px] transition-colors ${
                  selectedYear === y
                    ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200'
                    : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
