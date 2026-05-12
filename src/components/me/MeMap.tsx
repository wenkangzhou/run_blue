'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { StravaActivity } from '@/types';
import { getAvailableYears } from '@/lib/stats';
import { decodePolyline } from '@/lib/strava';
import { Map, ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { RadarScan } from './RadarScan';

// Dynamic import leaflet to avoid SSR issues
let L: any = null;
const leafletPromise = typeof window !== 'undefined'
  ? Promise.all([
      import('leaflet'),
      import('leaflet/dist/leaflet.css'),
    ]).then(([mod]) => {
      L = mod.default || mod;
      return L;
    })
  : Promise.resolve(null);

interface MeMapProps {
  activities: StravaActivity[];
}

export function MeMap({ activities }: MeMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const [isReady, setIsReady] = useState(false);

  const years = useMemo(() => getAvailableYears(activities), [activities]);
  const filteredActs = useMemo(() => {
    if (selectedYear === 'all') {
      return activities.filter((a) => a.map?.summary_polyline);
    }
    return activities.filter((a) => new Date(a.start_date).getFullYear() === selectedYear);
  }, [activities, selectedYear]);

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

      const bounds = leaflet.latLngBounds();
      let hasValid = false;

      filteredActs.forEach((act) => {
        const poly = act.map?.summary_polyline;
        if (!poly) return;
        try {
          const latlngs = decodePolyline(poly) || [];
          if (latlngs.length < 2) return;
          const line = leaflet.polyline(latlngs, {
            color: selectedYear === 'all' ? 'rgba(74, 222, 128, 0.45)' : 'rgba(74, 222, 128, 0.7)',
            weight: selectedYear === 'all' ? 2 : 3,
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

      if (hasValid && bounds.isValid && bounds.isValid() && selectedYear !== 'all') {
        leafletMapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
      }
    });
  }, [filteredActs, isReady, selectedYear]);

  const yearIndex = selectedYear === 'all' ? -1 : years.indexOf(selectedYear);

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

  return (
    <section className="px-4 py-8 sm:py-12">
      <div className="max-w-6xl mx-auto">
        {/* Terminal Window */}
        <div className="border border-zinc-700 bg-zinc-950/80">
          {/* Title Bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-zinc-500" />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                route_visualization — {filteredActs.length} traces
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={prevYear}
                className="p-1 hover:bg-zinc-800 text-zinc-500 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-zinc-300 font-bold min-w-[60px] text-center">
                {selectedYear === 'all' ? 'ALL YEARS' : selectedYear}
              </span>
              <button
                onClick={nextYear}
                className="p-1 hover:bg-zinc-800 text-zinc-500 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Map Area */}
          <div className="relative">
            <RadarScan />
            <div ref={mapRef} className="w-full h-[50vh] sm:h-[60vh] bg-zinc-900" />
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
                <div className="text-xs text-zinc-600">Initializing map engine...</div>
              </div>
            )}
          </div>

          {/* Year Chips */}
          <div className="px-3 py-2 border-t border-zinc-800 flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedYear('all')}
              className={`text-[10px] px-2 py-1 border transition-colors ${
                selectedYear === 'all'
                  ? 'border-green-400/50 text-green-400 bg-green-400/10'
                  : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
              }`}
            >
              ALL
            </button>
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`text-[10px] px-2 py-1 border transition-colors ${
                  selectedYear === y
                    ? 'border-green-400/50 text-green-400 bg-green-400/10'
                    : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
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
