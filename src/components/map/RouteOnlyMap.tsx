'use client';

import React from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import { LatLngExpression, LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { decodePolyline } from '@/lib/strava';

interface RouteOnlyMapProps {
  polyline: string | null;
  height?: string;
}

// Component to fit bounds to the route
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  
  React.useEffect(() => {
    if (points.length > 0) {
      try {
        const bounds = new LatLngBounds(
          points.map(p => [p[0], p[1]] as LatLngExpression)
        );
        map.fitBounds(bounds, { padding: [8, 8], maxZoom: 17, animate: false });
      } catch (e) {
        console.error('Error fitting bounds:', e);
      }
    }
  }, [map, points]);
  
  return null;
}

export function RouteOnlyMap({ polyline, height = '100%' }: RouteOnlyMapProps) {
  const points = React.useMemo(() => {
    if (!polyline || polyline.length < 10) return [];
    try {
      const decoded = decodePolyline(polyline);
      // Need at least 2 points to draw a line
      return decoded.length >= 2 ? decoded : [];
    } catch (e) {
      console.error('Error decoding polyline:', e);
      return [];
    }
  }, [polyline]);

  // Calculate center
  const center: LatLngExpression = React.useMemo(() => {
    if (points.length > 0) {
      const midIndex = Math.floor(points.length / 2);
      return [points[midIndex][0], points[midIndex][1]];
    }
    return [39.9042, 116.4074];
  }, [points]);

  // If no valid points, show placeholder
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center bg-zinc-100 dark:bg-zinc-800"
        style={{ height }}
      >
        <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-600" />
      </div>
    );
  }

  return (
    <div style={{ height }} className="map-container overflow-hidden bg-zinc-100 dark:bg-zinc-800">
      <MapContainer
        center={center}
        zoom={13}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        style={{ height: '100%', width: '100%', background: 'transparent' }}
        className="route-map"
      >
        {/* Transparent tile layer */}
        <TileLayer 
          url="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          opacity={0}
        />
        <Polyline
          positions={points as LatLngExpression[]}
          pathOptions={{
            color: '#1a1a1a',
            weight: 2.5,
            opacity: 0.9,
          }}
        />
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
