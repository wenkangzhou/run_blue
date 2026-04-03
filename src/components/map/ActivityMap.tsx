'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';

interface ActivityMapProps {
  polyline: string | null;
  startLatlng: [number, number] | null;
  endLatlng: [number, number] | null;
  height?: string;
}

export function ActivityMap({ polyline, startLatlng, endLatlng, height = '300px' }: ActivityMapProps) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = React.useState(false);
  const { theme } = useTheme();

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    if (!isClient || !mapRef.current || !polyline || polyline.length < 10) return;

    let map: any;
    let polylineLayer: any;
    let startMarker: any;
    let endMarker: any;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        const points = decodePolyline(polyline);
        if (points.length < 2 || !mapRef.current) return;

        // Calculate center
        const midIndex = Math.floor(points.length / 2);
        const center: [number, number] = [points[midIndex][0], points[midIndex][1]];

        map = L.map(mapRef.current as HTMLElement, {
          scrollWheelZoom: false,
        }).setView(center, 13);

        const tileUrl = theme === 'dark'
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

        L.tileLayer(tileUrl, {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }).addTo(map);

        const latLngs = points.map(p => [p[0], p[1]]);
        polylineLayer = L.polyline(latLngs as any, {
          color: theme === 'dark' ? '#60a5fa' : '#2563eb',
          weight: 4,
          opacity: 0.8,
        }).addTo(map);

        // Add start and end markers
        if (startLatlng) {
          startMarker = L.marker([startLatlng[0], startLatlng[1]]).addTo(map);
        }
        if (endLatlng) {
          endMarker = L.marker([endLatlng[0], endLatlng[1]]).addTo(map);
        }
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
  }, [isClient, polyline, startLatlng, endLatlng, theme]);

  const hasValidPolyline = polyline && polyline.length >= 10;

  if (!hasValidPolyline) {
    return (
      <div
        className="flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 border-4 border-zinc-800 dark:border-zinc-200"
        style={{ height }}
      >
        <p className="font-mono text-sm text-zinc-500">No route data available</p>
      </div>
    );
  }

  return (
    <div className="border-4 border-zinc-800 dark:border-zinc-200 overflow-hidden" style={{ height }}>
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
