'use client';

import React from 'react';
import { decodePolyline } from '@/lib/strava';

interface RouteOnlyMapProps {
  polyline: string | null;
  height?: string;
}

export function RouteOnlyMap({ polyline, height = '100%' }: RouteOnlyMapProps) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    if (!isClient || !mapRef.current || !polyline || polyline.length < 10) return;

    let map: any;
    let polylineLayer: any;

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

        // Add transparent tile layer
        L.tileLayer('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', {
          opacity: 0,
        }).addTo(map);

        // Add polyline
        const latLngs = points.map(p => [p[0], p[1]]);
        polylineLayer = L.polyline(latLngs as any, {
          color: '#1a1a1a',
          weight: 2.5,
          opacity: 0.9,
        }).addTo(map);

        // Fit bounds
        map.fitBounds(polylineLayer.getBounds(), { padding: [8, 8], maxZoom: 17 });
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
  }, [isClient, polyline]);

  // Check if we have valid polyline
  const hasValidPolyline = polyline && polyline.length >= 10;

  return (
    <div 
      ref={mapRef}
      style={{ height }}
      className="bg-zinc-100 dark:bg-zinc-800 w-full h-full"
    >
      {!hasValidPolyline && (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-600" />
        </div>
      )}
    </div>
  );
}
