'use client';

import React from 'react';
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { decodePolyline } from '@/lib/strava';
import { useTheme } from 'next-themes';

interface ActivityMapProps {
  polyline: string | null;
  startLatlng: [number, number] | null;
  endLatlng: [number, number] | null;
  height?: string;
}

export function ActivityMap({
  polyline,
  startLatlng,
  endLatlng,
  height = '300px',
}: ActivityMapProps) {
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
    if (startLatlng) return [startLatlng[0], startLatlng[1]];
    return [39.9042, 116.4074];
  }, [points, startLatlng]);

  const tileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  if (points.length === 0) {
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
    <div className="border-4 border-zinc-800 dark:border-zinc-200" style={{ height }}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={tileUrl}
        />
        <Polyline
          positions={points as LatLngExpression[]}
          color={theme === 'dark' ? '#60a5fa' : '#2563eb'}
          weight={4}
          opacity={0.8}
        />
        {startLatlng && (
          <Marker
            position={[startLatlng[0], startLatlng[1]]}
          />
        )}
        {endLatlng && (
          <Marker
            position={[endLatlng[0], endLatlng[1]]}
          />
        )}
      </MapContainer>
    </div>
  );
}
