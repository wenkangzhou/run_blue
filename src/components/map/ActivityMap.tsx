'use client';

import React from 'react';
import { decodePolyline } from '@/lib/strava';
import { useMapTileLayer } from '@/hooks/useMapTileLayer';
import { TILE_LAYERS, TileLayerKey } from '@/lib/mapTileLayers';
import { Layers } from 'lucide-react';

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
  const tileLayerRef = React.useRef<any>(null);
  const polylineLayerRef = React.useRef<any>(null);
  const [mapReady, setMapReady] = React.useState(false);
  const [showLayerMenu, setShowLayerMenu] = React.useState(false);
  const { layer, setLayer, isReady } = useMapTileLayer();
  
  // Use refs for values that shouldn't trigger re-init
  const isDarkRef = React.useRef(isDark);
  const onReadyRef = React.useRef(onReady);
  const layerRef = React.useRef(layer);
  
  // Keep refs updated
  React.useEffect(() => { isDarkRef.current = isDark; });
  React.useEffect(() => { onReadyRef.current = onReady; });
  React.useEffect(() => { layerRef.current = layer; });

  // Initialize map when polyline changes
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
      tileLayerRef.current = null;
      polylineLayerRef.current = null;
    }
    
    setMapReady(false);
    
    const currentIsDark = isDarkRef.current;
    const currentLayer = layerRef.current;
    
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

        // Add tile layer
        tileLayerRef.current = addTileLayer(map, currentLayer, currentIsDark, L);

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

  // Switch tile layer when user selects a different one
  React.useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    const currentTile = tileLayerRef.current;
    if (currentTile) {
      map.removeLayer(currentTile);
      tileLayerRef.current = null;
    }

    const initTile = async () => {
      const L = (await import('leaflet')).default;
      tileLayerRef.current = addTileLayer(map, layer, isDark, L);
    };
    initTile();
  }, [layer, mapReady, isDark]);

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
      
      {/* Layer switcher */}
      {isReady && mapReady && (
        <div className="absolute top-[10px] left-[10px] z-[1000]">
          <button
            onClick={() => setShowLayerMenu(s => !s)}
            className="w-[30px] h-[30px] bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors focus:outline-none"
            title="切换地图图层"
          >
            <Layers size={14} className="text-zinc-600 dark:text-zinc-300" />
          </button>
          
          {showLayerMenu && (
            <>
              <div 
                className="fixed inset-0 z-[999]" 
                onClick={() => setShowLayerMenu(false)} 
              />
              <div className="absolute top-full left-0 mt-[2px] z-[1001] w-36 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 shadow-md py-1">
                {Object.values(TILE_LAYERS).map((config) => (
                  <button
                    key={config.key}
                    onClick={() => {
                      setLayer(config.key);
                      setShowLayerMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-left font-mono text-xs transition-colors ${
                      layer === config.key
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {config.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function addTileLayer(map: any, layerKey: TileLayerKey, isDark: boolean, L: any) {
  const config = TILE_LAYERS[layerKey];
  if (!config.url) return null;

  const options: Record<string, any> = {
    opacity: isDark ? 0.7 : 1,
  };
  if (config.subdomains) {
    options.subdomains = config.subdomains;
  }

  const tileLayer = L.tileLayer(config.url, options);
  tileLayer.addTo(map);
  return tileLayer;
}
