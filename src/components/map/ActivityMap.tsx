'use client';

import React from 'react';
import { decodePolyline } from '@/lib/strava';

interface ActivityMapProps {
  polyline: string | null;
  startLatlng: [number, number] | null;
  endLatlng: [number, number] | null;
  height?: string;
  onReady?: () => void;
  isDark?: boolean;
}

export function ActivityMap({ 
  polyline, 
  startLatlng, 
  endLatlng, 
  height = '300px', 
  onReady,
  isDark = false 
}: ActivityMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const polylineLayerRef = React.useRef<any>(null);
  const [mapReady, setMapReady] = React.useState(false);
  
  // Use refs for values that shouldn't trigger re-init
  const isDarkRef = React.useRef(isDark);
  const onReadyRef = React.useRef(onReady);
  
  // Keep refs updated
  React.useEffect(() => { isDarkRef.current = isDark; });
  React.useEffect(() => { onReadyRef.current = onReady; });

  // Only re-init when polyline changes
  React.useEffect(() => {
    if (!mapRef.current || !polyline || polyline.length < 10) {
      if ((!polyline || polyline.length < 10) && onReadyRef.current) {
        onReadyRef.current();
      }
      return;
    }

    // Clean up previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      polylineLayerRef.current = null;
    }
    
    setMapReady(false);
    
    const currentIsDark = isDarkRef.current;
    
    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        const points = decodePolyline(polyline);
        if (points.length < 2 || !mapRef.current) return;

        const map = L.map(mapRef.current, {
          scrollWheelZoom: false,
          zoomControl: true,
          attributionControl: false,
        });

        mapInstanceRef.current = map;
        map.zoomControl.setPosition('bottomright');

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          opacity: currentIsDark ? 0.7 : 1,
        }).addTo(map);

        const latLngs = points.map(p => L.latLng(p[0], p[1]));
        
        const actualStart: [number, number] = [points[0][0], points[0][1]];
        const actualEnd: [number, number] = [points[points.length - 1][0], points[points.length - 1][1]];

        const lineColor = currentIsDark ? '#22d3ee' : '#2563eb';
        const polylineLayer = L.polyline(latLngs, {
          color: lineColor,
          weight: 5,
          opacity: currentIsDark ? 1 : 0.9,
          lineJoin: 'round',
        }).addTo(map);
        
        polylineLayerRef.current = polylineLayer;

        map.fitBounds(polylineLayer.getBounds(), { 
          padding: [30, 30],
          maxZoom: 16,
          animate: false,
        });

        // Start marker (green)
        const startIcon = L.divIcon({
          className: 'start-marker',
          html: `<div style="width:14px;height:14px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([actualStart[0], actualStart[1]], { icon: startIcon, zIndexOffset: 1000 }).addTo(map);

        // End marker (red)
        const dist = Math.sqrt(
          Math.pow(actualEnd[0] - actualStart[0], 2) + 
          Math.pow(actualEnd[1] - actualStart[1], 2)
        );
        
        if (dist > 0.0001) {
          const endIcon = L.divIcon({
            className: 'end-marker',
            html: `<div style="width:14px;height:14px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          L.marker([actualEnd[0], actualEnd[1]], { icon: endIcon, zIndexOffset: 1001 }).addTo(map);
        }

        setMapReady(true);
        if (onReadyRef.current) onReadyRef.current();

      } catch (e) {
        console.error('[Map] Error:', e);
        setMapReady(true);
        if (onReadyRef.current) onReadyRef.current();
      }
    };

    const timer = setTimeout(initMap, 50);

    return () => {
      clearTimeout(timer);
    };
  }, [polyline]); // ONLY depend on polyline

  const bgColor = isDark ? '#27272a' : '#f4f4f5';

  if (!polyline || polyline.length < 10) {
    return (
      <div className="flex items-center justify-center rounded-lg" style={{ height, backgroundColor: bgColor }}>
        <p className="font-mono text-sm text-zinc-500">No route data</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden" style={{ height, backgroundColor: bgColor }}>
      {!mapReady && <div className="absolute inset-0 z-20" style={{ backgroundColor: bgColor }} />}
      <div ref={mapRef} className="w-full h-full" style={{ opacity: mapReady ? 1 : 0, transition: 'opacity 0.2s' }} />
    </div>
  );
}
