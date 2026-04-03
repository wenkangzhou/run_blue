'use client';

import React from 'react';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { decodePolyline } from '@/lib/strava';
import { useTheme } from 'next-themes';

interface MiniMapProps {
  polyline: string | null;
  height?: string;
}

export function MiniMap({ polyline, height = '120px' }: MiniMapProps) {
  const { theme } = useTheme();
  const points = React.useMemo(() => {
    if (!polyline) return [];
    return decodePolyline(polyline);
  }, [polyline]);

  const center: LatLngExpression = React.useMemo(() => {
    if (points.length > 0) {
      const midIndex = Math.floor(points.length / 2);
      return [points[midIndex][0], points[midIndex][1]];
    }
    return [39.9042, 116.4074];
  }, [points]);

  const tileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-zinc-100 dark:bg-zinc-800"
        style={{ height }}
      >
        <div className="w-8 h-8 border-2 border-zinc-400 dark:border-zinc-600" />
      </div>
    );
  }

  return (
    <div style={{ height }} className="overflow-hidden">
      <MapContainer
        center={center}
        zoom={12}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={tileUrl} />
        <Polyline
          positions={points as LatLngExpression[]}
          color={theme === 'dark' ? '#60a5fa' : '#2563eb'}
          weight={3}
          opacity={0.9}
        />
      </MapContainer>
    </div>
  );
}
