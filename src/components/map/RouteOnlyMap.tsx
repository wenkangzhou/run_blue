'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';

interface RouteOnlyMapProps {
  polyline: string | null;
  height?: string;
}

export function RouteOnlyMap({ polyline, height = '100%' }: RouteOnlyMapProps) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = React.useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    if (!isClient || !mapRef.current || !polyline || polyline.length < 10) return;

    let map: any;
    let polylineLayer: any;
    let tileLayer: any;

    const initMap = async () => {
      try {
        // Dynamically import leaflet only on client
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        const points = decodePolyline(polyline);
        if (points.length < 2 || !mapRef.current) return;

        // Create map
        map = L.map(mapRef.current as HTMLElement, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
          dragging: false,
          doubleClickZoom: false,
        });

        // Add real map tiles — clean, no labels
        const tileUrl = isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';

        tileLayer = L.tileLayer(tileUrl, {
          subdomains: 'abcd',
          maxZoom: 19,
        }).addTo(map);

        // Add polyline with appropriate color for theme
        const lineColor = isDark ? '#fbbf24' : '#2563eb'; // amber-400 for dark, blue-600 for light
        const latLngs = points.map(p => [p[0], p[1]]);
        polylineLayer = L.polyline(latLngs as any, {
          color: lineColor,
          weight: 3,
          opacity: 0.9,
        }).addTo(map);

        // Fit bounds
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
  }, [isClient, polyline, isDark]);

  // Check if we have valid polyline
  const hasValidPolyline = polyline && polyline.length >= 10;

  // Match card background exactly during SSR / loading
  const bgColor = isDark ? '#18181b' : '#f4f4f5'; // zinc-900 or zinc-100

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
