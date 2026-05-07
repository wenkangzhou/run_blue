'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';
import { getSavedTileLayer, TILE_LAYERS } from '@/lib/mapTileLayers';

interface MiniMapProps {
  polyline: string | null;
  height?: string;
}

export function MiniMap({ polyline, height = '120px' }: MiniMapProps) {
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

        // Follow global tile layer setting
        const savedLayer = getSavedTileLayer();
        const config = TILE_LAYERS[savedLayer];
        if (config.url) {
          const options: Record<string, any> = {};
          if (config.subdomains) {
            options.subdomains = config.subdomains;
          }
          L.tileLayer(config.url, options).addTo(map);
        }

        const latLngs = points.map(p => [p[0], p[1]]);
        polylineLayer = L.polyline(latLngs as any, {
          color: theme === 'dark' ? '#60a5fa' : '#2563eb',
          weight: 3,
          opacity: 0.9,
        }).addTo(map);

        map.fitBounds(polylineLayer.getBounds(), { padding: [10, 10], maxZoom: 16 });
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
  }, [isClient, polyline, theme]);

  const hasValidPolyline = polyline && polyline.length >= 10;

  return (
    <div 
      ref={mapRef}
      style={{ height }}
      className="bg-zinc-100 dark:bg-zinc-800 w-full overflow-hidden"
    >
      {!hasValidPolyline && (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-zinc-400 dark:border-zinc-600" />
        </div>
      )}
    </div>
  );
}
