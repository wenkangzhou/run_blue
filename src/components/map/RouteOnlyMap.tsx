'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';
import { prepareLeafletContainer, releaseLeafletContainer } from '@/lib/leafletContainer';
import type { LatLngExpression, Map as LeafletMap } from 'leaflet';

interface RouteOnlyMapProps {
  polyline: string | null;
  height?: string;
}

export function RouteOnlyMap({ polyline, height = '100%' }: RouteOnlyMapProps) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  React.useEffect(() => {
    const container = mapRef.current;
    if (!container || !polyline || polyline.length < 10) return;

    let cancelled = false;
    let map: LeafletMap | null = null;

    const initMap = async () => {
      try {
        // Dynamically import leaflet only on client
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !container.isConnected) return;

        const points = decodePolyline(polyline);
        if (cancelled || points.length < 2 || !container.isConnected) return;

        prepareLeafletContainer(container);

        // Create map
        map = L.map(container, {
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false,
          dragging: false,
          doubleClickZoom: false,
        });

        // Add transparent tile layer
        L.tileLayer('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', {
          opacity: 0,
        }).addTo(map);

        // Add polyline with appropriate color for theme
        const lineColor = isDark ? '#a1a1aa' : '#1a1a1a'; // zinc-400 for dark, dark for light
        const latLngs: LatLngExpression[] = points.map(p => [p[0], p[1]]);
        const polylineLayer = L.polyline(latLngs, {
          color: lineColor,
          weight: 2.5,
          opacity: isDark ? 1 : 0.9,
        }).addTo(map);

        // Fit bounds
        map.fitBounds(polylineLayer.getBounds(), { padding: [8, 8], maxZoom: 17 });
      } catch (e) {
        if (!cancelled) {
          console.error('Error initializing map:', e);
        }
      }
    };

    initMap();

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        map = null;
      }
      releaseLeafletContainer(container);
    };
  }, [polyline, isDark]);

  // Check if we have valid polyline
  const hasValidPolyline = polyline && polyline.length >= 10;
  
  // Match card background exactly (default to light during SSR)
  const bgColor = isDark ? '#27272a' : '#f4f4f5'; // zinc-800 or zinc-100

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
