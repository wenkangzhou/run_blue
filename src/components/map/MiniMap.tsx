'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';
import { prepareLeafletContainer, releaseLeafletContainer } from '@/lib/leafletContainer';
import { getSavedTileLayer, TILE_LAYERS } from '@/lib/mapTileLayers';
import type { LatLngExpression, Map as LeafletMap, TileLayerOptions } from 'leaflet';

interface MiniMapProps {
  polyline: string | null;
  height?: string;
}

export function MiniMap({ polyline, height = '120px' }: MiniMapProps) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  React.useEffect(() => {
    const container = mapRef.current;
    if (!container || !polyline || polyline.length < 10) return;

    let cancelled = false;
    let map: LeafletMap | null = null;

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !container.isConnected) return;

        const points = decodePolyline(polyline);
        if (cancelled || points.length < 2 || !container.isConnected) return;

        prepareLeafletContainer(container);

        map = L.map(container, {
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
          const options: TileLayerOptions = {};
          if (config.subdomains) {
            options.subdomains = config.subdomains;
          }
          L.tileLayer(config.url, options).addTo(map);
        }

        const latLngs: LatLngExpression[] = points.map(p => [p[0], p[1]]);
        const lineColor = theme === 'dark' ? '#60a5fa' : '#2563eb';
        L.polyline(latLngs, {
          color: theme === 'dark' ? '#18181b' : '#ffffff',
          weight: 6,
          opacity: theme === 'dark' ? 0.66 : 0.84,
          lineJoin: 'round',
          className: 'mini-map-line-halo',
        }).addTo(map);

        const polylineLayer = L.polyline(latLngs, {
          color: lineColor,
          weight: 3.2,
          opacity: 0.94,
          lineJoin: 'round',
          className: 'mini-map-line',
        }).addTo(map);

        map.fitBounds(polylineLayer.getBounds(), { padding: [10, 10], maxZoom: 16 });
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
  }, [polyline, theme]);

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
