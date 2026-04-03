'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { decodePolyline } from '@/lib/strava';

interface ActivityMapProps {
  polyline: string | null;
  startLatlng: [number, number] | null;
  endLatlng: [number, number] | null;
  height?: string;
  onReady?: () => void;
}

export function ActivityMap({ polyline, startLatlng, endLatlng, height = '300px', onReady }: ActivityMapProps) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const [isClient, setIsClient] = React.useState(false);
  const { theme } = useTheme();
  const onReadyCalled = React.useRef(false);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  React.useEffect(() => {
    if (!isClient || !mapRef.current || !polyline || polyline.length < 10) {
      // No polyline, immediately ready
      if (!polyline || polyline.length < 10) {
        if (!onReadyCalled.current && onReady) {
          onReadyCalled.current = true;
          onReady();
        }
      }
      return;
    }

    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        const points = decodePolyline(polyline);
        if (points.length < 2 || !mapRef.current) {
          if (!onReadyCalled.current && onReady) {
            onReadyCalled.current = true;
            onReady();
          }
          return;
        }

        // Create map without initial center/zoom - will use fitBounds
        const map = L.map(mapRef.current as HTMLElement, {
          scrollWheelZoom: false,
          zoomControl: true,
          attributionControl: false,
        });

        mapInstanceRef.current = map;

        // Position zoom control to bottom right
        map.zoomControl.setPosition('bottomright');

        // Use OpenStreetMap
        const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

        const tileLayer = L.tileLayer(tileUrl, {
          opacity: theme === 'dark' ? 0.6 : 1,
        }).addTo(map);

        const latLngs = points.map(p => [p[0], p[1]]);
        const polylineLayer = L.polyline(latLngs as any, {
          color: theme === 'dark' ? '#60a5fa' : '#2563eb',
          weight: 5,
          opacity: 0.9,
          lineJoin: 'round',
        }).addTo(map);

        // Calculate bounds and set view in one go - no animation
        const bounds = polylineLayer.getBounds();
        map.fitBounds(bounds, { 
          padding: [30, 30],
          maxZoom: 16,
          animate: false,
          duration: 0,
        });

        // Add simple circle markers for start/end
        if (startLatlng) {
          L.circleMarker([startLatlng[0], startLatlng[1]], {
            radius: 8,
            fillColor: '#22c55e',
            color: '#fff',
            weight: 3,
            fillOpacity: 1,
          }).addTo(map);
        }
        if (endLatlng) {
          L.circleMarker([endLatlng[0], endLatlng[1]], {
            radius: 8,
            fillColor: '#ef4444',
            color: '#fff',
            weight: 3,
            fillOpacity: 1,
          }).addTo(map);
        }

        // Wait for tiles to load before calling ready
        let tilesLoaded = 0;
        const minTiles = 2;
        
        const checkReady = () => {
          if (!onReadyCalled.current && onReady) {
            onReadyCalled.current = true;
            onReady();
          }
        };

        const onTileLoad = () => {
          tilesLoaded++;
          if (tilesLoaded >= minTiles) {
            checkReady();
          }
        };

        tileLayer.on('tileload', onTileLoad);
        
        // Fallback: call ready after 800ms regardless
        setTimeout(() => {
          checkReady();
        }, 800);

      } catch (e) {
        console.error('Error initializing map:', e);
        if (!onReadyCalled.current && onReady) {
          onReadyCalled.current = true;
          onReady();
        }
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isClient, polyline, startLatlng, endLatlng, theme, onReady]);

  const hasValidPolyline = polyline && polyline.length >= 10;

  if (!hasValidPolyline) {
    return (
      <div
        className="flex items-center justify-center bg-zinc-100 dark:bg-zinc-800"
        style={{ height }}
      >
        <p className="font-mono text-sm text-zinc-500">No route data</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800" style={{ height }}>
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
