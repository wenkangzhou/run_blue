'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';
import { prepareLeafletContainer, releaseLeafletContainer } from '@/lib/leafletContainer';
import { getSavedTileLayer, TILE_LAYERS } from '@/lib/mapTileLayers';
import { addRouteEndpointMarkers } from '@/lib/routeMapVisuals';
import type { LatLngExpression, Map as LeafletMap, TileLayerOptions } from 'leaflet';

interface RouteCardMapProps {
  polyline: string | null;
  height?: string;
}

export function RouteCardMap({ polyline, height = '100%' }: RouteCardMapProps) {
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

        const savedLayer = getSavedTileLayer();
        const config = TILE_LAYERS[savedLayer];
        if (config.url) {
          const options: TileLayerOptions = {};
          if (config.subdomains) {
            options.subdomains = config.subdomains;
          }
          L.tileLayer(config.url, options).addTo(map);
        }

        const lineColor = isDark ? '#fbbf24' : '#2563eb';
        const latLngs: LatLngExpression[] = points.map(p => [p[0], p[1]]);
        L.polyline(latLngs, {
          color: isDark ? '#18181b' : '#ffffff',
          weight: 7,
          opacity: isDark ? 0.7 : 0.82,
          lineJoin: 'round',
          className: 'route-card-line-halo',
        }).addTo(map);

        const polylineLayer = L.polyline(latLngs, {
          color: lineColor,
          weight: 3.6,
          opacity: 0.95,
          lineJoin: 'round',
          className: 'route-card-line',
        }).addTo(map);

        const decorationLayer = L.layerGroup().addTo(map);
        addRouteEndpointMarkers(L, decorationLayer, points, { size: 14 });

        map.fitBounds(polylineLayer.getBounds(), { padding: [12, 12], maxZoom: 17 });
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
