'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';

interface RouteOnlyMapProps {
  polyline: string | null;
  height?: string;
  lazy?: boolean; // 仅当进入视口才初始化（用于活动列表等卡片多的场景）
}

export function RouteOnlyMap({ polyline, height = '100%', lazy = false }: RouteOnlyMapProps) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(!lazy);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // IntersectionObserver: only init map when scrolled into viewport
  React.useEffect(() => {
    if (!lazy || !mapRef.current) return;
    const el = mapRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // preload before entering viewport
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy]);

  React.useEffect(() => {
    if (!isClient || !isVisible || !mapRef.current || !polyline || polyline.length < 10) return;

    let map: any;
    let polylineLayer: any;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        const points = decodePolyline(polyline);
        if (points.length < 2 || !mapRef.current) return;

        map = L.map(mapRef.current as HTMLElement, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
          dragging: false,
          doubleClickZoom: false,
        });

        // Real map tiles — clean, no labels
        const tileUrl = isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';

        L.tileLayer(tileUrl, {
          subdomains: 'abcd',
          maxZoom: 19,
        }).addTo(map);

        const lineColor = isDark ? '#fbbf24' : '#2563eb'; // amber-400 / blue-600
        const latLngs = points.map(p => [p[0], p[1]]);
        polylineLayer = L.polyline(latLngs as any, {
          color: lineColor,
          weight: 3,
          opacity: 0.9,
        }).addTo(map);

        map.fitBounds(polylineLayer.getBounds(), { padding: [12, 12], maxZoom: 17 });
      } catch (e) {
        console.error('Error initializing map:', e);
      }
    };

    initMap();

    return () => {
      if (map) {
        map.remove();
      }
    };
  }, [isClient, isVisible, polyline, isDark]);

  const hasValidPolyline = polyline && polyline.length >= 10;
  const bgColor = isDark ? '#18181b' : '#f4f4f5';

  if (!hasValidPolyline) {
    return (
      <div
        style={{ height, backgroundColor: bgColor }}
        className="w-full h-full flex items-center justify-center"
      >
        <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-600" />
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      style={{ height, backgroundColor: bgColor }}
      className="w-full h-full"
    />
  );
}
