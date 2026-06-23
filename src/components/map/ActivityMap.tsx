'use client';

import React from 'react';
import { decodePolyline } from '@/lib/strava';
import { useMapTileLayer } from '@/hooks/useMapTileLayer';
import { TILE_LAYERS, TileLayerKey } from '@/lib/mapTileLayers';
import { prepareLeafletContainer, releaseLeafletContainer } from '@/lib/leafletContainer';
import { addRouteEndpointMarkers } from '@/lib/routeMapVisuals';
import { Layers, Pause, Play, RotateCcw } from 'lucide-react';
import type { ActivityStream } from '@/types';
import type {
  LayerGroup,
  Map as LeafletMap,
  Marker,
  Polyline,
  TileLayer,
  TileLayerOptions,
} from 'leaflet';

type LeafletModule = typeof import('leaflet');

interface ActivityMapProps {
  polyline: string | null;
  startLatlng: [number, number] | null;
  endLatlng: [number, number] | null;
  streams?: Record<string, ActivityStream> | null;
  height?: string;
  onReady?: () => void;
  isDark?: boolean;
}

export function ActivityMap({ 
  polyline,
  streams = null,
  height = '300px', 
  onReady,
  isDark = false 
}: ActivityMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<LeafletMap | null>(null);
  const tileLayerRef = React.useRef<TileLayer | null>(null);
  const polylineLayerRef = React.useRef<Polyline | null>(null);
  const playbackLayerRef = React.useRef<LayerGroup | null>(null);
  const playbackProgressRef = React.useRef<Polyline | null>(null);
  const playbackMarkerRef = React.useRef<Marker | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const playbackIndexRef = React.useRef(0);
  const [mapReady, setMapReady] = React.useState(false);
  const [showLayerMenu, setShowLayerMenu] = React.useState(false);
  const [showPlaybackPanel, setShowPlaybackPanel] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playbackIndex, setPlaybackIndex] = React.useState(0);
  const [playbackRate, setPlaybackRate] = React.useState(1);
  const { layer, setLayer, isReady } = useMapTileLayer();
  const playbackPoints = React.useMemo(() => getPlaybackPoints(streams), [streams]);
  const hasPlayback = playbackPoints.length > 1;
  const lastPlaybackIndex = Math.max(playbackPoints.length - 1, 0);
  const currentPlaybackPoint = playbackPoints[Math.min(playbackIndex, lastPlaybackIndex)] ?? null;
  
  // Use refs for values that shouldn't trigger re-init
  const isDarkRef = React.useRef(isDark);
  const onReadyRef = React.useRef(onReady);
  const layerRef = React.useRef(layer);
  
  // Keep refs updated
  React.useEffect(() => { isDarkRef.current = isDark; });
  React.useEffect(() => { onReadyRef.current = onReady; });
  React.useEffect(() => { layerRef.current = layer; });
  React.useEffect(() => { playbackIndexRef.current = playbackIndex; }, [playbackIndex]);

  // Initialize map when polyline changes
  React.useEffect(() => {
    const container = mapRef.current;
    if (!container || !polyline || polyline.length < 10) {
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

    let cancelled = false;
    
    setMapReady(false);
    
    const currentIsDark = isDarkRef.current;
    const currentLayer = layerRef.current;
    
    const initMap = async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !container.isConnected) return;

        const points = decodePolyline(polyline);
        if (cancelled || points.length < 2 || !container.isConnected) return;

        prepareLeafletContainer(container);

        const map = L.map(container, {
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

        const lineColor = currentIsDark ? '#22d3ee' : '#1d4ed8';
        L.polyline(latLngs, {
          color: currentIsDark ? '#0f172a' : '#ffffff',
          weight: 9,
          opacity: currentIsDark ? 0.7 : 0.86,
          lineJoin: 'round',
          className: 'activity-route-halo',
        }).addTo(map);

        const polylineLayer = L.polyline(latLngs, {
          color: lineColor,
          weight: 5.2,
          opacity: currentIsDark ? 0.98 : 0.94,
          lineJoin: 'round',
          className: 'activity-route-line',
        }).addTo(map);
        
        polylineLayerRef.current = polylineLayer;

        map.fitBounds(polylineLayer.getBounds(), { 
          padding: [30, 30],
          maxZoom: 16,
          animate: false,
        });

        const decorationLayer = L.layerGroup().addTo(map);
        addRouteEndpointMarkers(L, decorationLayer, [actualStart, ...points.slice(1, -1), actualEnd], { size: 20 });

        setMapReady(true);
        if (onReadyRef.current) onReadyRef.current();

      } catch (e) {
        if (!cancelled) {
          console.error('[Map] Error:', e);
          setMapReady(true);
          if (onReadyRef.current) onReadyRef.current();
        }
      }
    };

    const timer = setTimeout(initMap, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      tileLayerRef.current = null;
      polylineLayerRef.current = null;
      playbackLayerRef.current = null;
      playbackProgressRef.current = null;
      playbackMarkerRef.current = null;
      releaseLeafletContainer(container);
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

    let cancelled = false;

    const initTile = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || mapInstanceRef.current !== map) return;
      tileLayerRef.current = addTileLayer(map, layer, isDark, L);
    };
    initTile();

    return () => {
      cancelled = true;
    };
  }, [layer, mapReady, isDark]);

  React.useEffect(() => {
    if (!hasPlayback) {
      setIsPlaying(false);
      setShowPlaybackPanel(false);
      setPlaybackIndex(0);
      return;
    }
    setPlaybackIndex((index) => Math.min(index, lastPlaybackIndex));
  }, [hasPlayback, lastPlaybackIndex]);

  React.useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !hasPlayback || !showPlaybackPanel) {
      if (playbackLayerRef.current && map) {
        map.removeLayer(playbackLayerRef.current);
      }
      playbackLayerRef.current = null;
      playbackProgressRef.current = null;
      playbackMarkerRef.current = null;
      return;
    }

    let cancelled = false;

    const initPlaybackLayer = async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || mapInstanceRef.current !== map) return;

      if (playbackLayerRef.current) {
        map.removeLayer(playbackLayerRef.current);
      }

      const layerGroup = L.layerGroup().addTo(map);
      const initialPoint = playbackPoints[Math.min(playbackIndexRef.current, lastPlaybackIndex)] ?? playbackPoints[0];
      const initialLatLng = L.latLng(initialPoint.lat, initialPoint.lng);

      playbackProgressRef.current = L.polyline([initialLatLng], {
        color: '#f97316',
        weight: 5.8,
        opacity: 0.96,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'activity-route-playback-progress',
      }).addTo(layerGroup);

      playbackMarkerRef.current = L.marker(initialLatLng, {
        interactive: false,
        icon: createPlaybackMarkerIcon(L),
        zIndexOffset: 500,
      }).addTo(layerGroup);

      playbackLayerRef.current = layerGroup;
    };

    initPlaybackLayer();

    return () => {
      cancelled = true;
      if (playbackLayerRef.current && mapInstanceRef.current === map) {
        map.removeLayer(playbackLayerRef.current);
      }
      playbackLayerRef.current = null;
      playbackProgressRef.current = null;
      playbackMarkerRef.current = null;
    };
  }, [hasPlayback, lastPlaybackIndex, mapReady, playbackPoints, showPlaybackPanel]);

  React.useEffect(() => {
    if (!showPlaybackPanel || !hasPlayback || !playbackProgressRef.current || !playbackMarkerRef.current) return;

    const safeIndex = Math.min(playbackIndex, lastPlaybackIndex);
    const currentPoint = playbackPoints[safeIndex];
    if (!currentPoint) return;

    const latLngs = playbackPoints.slice(0, safeIndex + 1).map((point) => [point.lat, point.lng] as [number, number]);
    playbackProgressRef.current.setLatLngs(latLngs);
    playbackMarkerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
  }, [hasPlayback, lastPlaybackIndex, playbackIndex, playbackPoints, showPlaybackPanel]);

  React.useEffect(() => {
    if (!isPlaying || !hasPlayback || lastPlaybackIndex <= 0) return;

    if (playbackIndexRef.current >= lastPlaybackIndex) {
      setPlaybackIndex(0);
      playbackIndexRef.current = 0;
    }

    const routeDurationMs = 42000 / playbackRate;
    const startIndex = playbackIndexRef.current;
    const startedAt = performance.now();
    const remainingIndexes = lastPlaybackIndex - startIndex;
    const remainingDurationMs = Math.max(1000, routeDurationMs * (remainingIndexes / lastPlaybackIndex));

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / remainingDurationMs);
      const nextIndex = Math.min(lastPlaybackIndex, startIndex + Math.round(remainingIndexes * progress));

      if (nextIndex !== playbackIndexRef.current) {
        playbackIndexRef.current = nextIndex;
        setPlaybackIndex(nextIndex);
      }

      if (progress >= 1) {
        setIsPlaying(false);
        animationFrameRef.current = null;
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [hasPlayback, isPlaying, lastPlaybackIndex, playbackRate]);

  const handleTogglePlayback = () => {
    if (!hasPlayback) return;
    setShowPlaybackPanel(true);
    setIsPlaying((playing) => !playing);
  };

  const handleOpenPlayback = () => {
    if (!hasPlayback) return;
    setShowPlaybackPanel(true);
    setIsPlaying(true);
  };

  const handleClosePlaybackPanel = () => {
    setIsPlaying(false);
    setShowPlaybackPanel(false);
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextIndex = Number.parseInt(event.target.value, 10);
    setIsPlaying(false);
    setPlaybackIndex(Number.isFinite(nextIndex) ? nextIndex : 0);
  };

  const handleResetPlayback = () => {
    setIsPlaying(false);
    setPlaybackIndex(0);
  };

  const bgColor = isDark ? '#27272a' : '#f4f4f5';

  if (!polyline || polyline.length < 10) {
    return (
      <div className="flex items-center justify-center rounded-lg" style={{ height, backgroundColor: bgColor }}>
        <p className="font-mono text-sm text-zinc-500">No route data</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full overflow-hidden rounded-lg" style={{ backgroundColor: bgColor }}>
      <div className="relative isolate w-full" style={{ height, backgroundColor: bgColor }}>
        {!mapReady && <div className="absolute inset-0 z-20" style={{ backgroundColor: bgColor }} />}
        <div ref={mapRef} className="relative z-0 h-full w-full" style={{ opacity: mapReady ? 1 : 0, transition: 'opacity 0.2s' }} />

        {hasPlayback && mapReady && !showPlaybackPanel && (
          <button
            type="button"
            onClick={handleOpenPlayback}
            className="absolute bottom-3 left-3 z-[5] inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-blue-600 text-white shadow-md transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            title="播放轨迹"
          >
            <Play size={13} />
          </button>
        )}

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

      {hasPlayback && mapReady && showPlaybackPanel && currentPlaybackPoint && (
        <div className="border-t border-zinc-200 bg-white/95 p-3 dark:border-zinc-700 dark:bg-zinc-900/95">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePlayback}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              title={isPlaying ? '暂停轨迹播放' : '播放轨迹'}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={lastPlaybackIndex}
              value={Math.min(playbackIndex, lastPlaybackIndex)}
              onChange={handleSeek}
              className="h-2 min-w-0 flex-1 cursor-pointer accent-blue-600"
              aria-label="轨迹播放进度"
            />
            <button
              type="button"
              onClick={handleClosePlaybackPanel}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              title="收起播放控件"
            >
              <span className="font-mono text-lg leading-none">×</span>
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              <PlaybackStat label="距离" value={formatPlaybackDistance(currentPlaybackPoint.distance)} />
              <PlaybackStat label="时间" value={formatPlaybackTime(currentPlaybackPoint.time)} />
              <PlaybackStat label="配速" value={formatPlaybackPace(currentPlaybackPoint.paceSecPerKm)} />
              <PlaybackStat label="心率" value={formatPlaybackHeartRate(currentPlaybackPoint.heartRate)} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                {[1, 2, 4].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setPlaybackRate(rate)}
                    className={`px-2.5 py-1 font-mono text-[10px] font-bold transition-colors ${
                      playbackRate === rate
                        ? 'bg-blue-600 text-white'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleResetPlayback}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                title="回到起点"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function addTileLayer(map: LeafletMap, layerKey: TileLayerKey, isDark: boolean, L: LeafletModule): TileLayer | null {
  const config = TILE_LAYERS[layerKey];
  if (!config.url) return null;

  const options: TileLayerOptions = {
    opacity: isDark ? 0.7 : 1,
  };
  if (config.subdomains) {
    options.subdomains = config.subdomains;
  }

  const tileLayer = L.tileLayer(config.url, options);
  tileLayer.addTo(map);
  return tileLayer;
}

interface PlaybackPoint {
  lat: number;
  lng: number;
  time: number | null;
  distance: number | null;
  paceSecPerKm: number | null;
  heartRate: number | null;
}

function getPlaybackPoints(streams: Record<string, ActivityStream> | null): PlaybackPoint[] {
  const latLngData = streams?.latlng?.data;
  if (!Array.isArray(latLngData) || latLngData.length < 2) return [];

  const timeData = getNumberStream(streams?.time);
  const distanceData = getNumberStream(streams?.distance);
  const velocityData = getNumberStream(streams?.velocity_smooth);
  const heartRateData = getNumberStream(streams?.heartrate);

  return latLngData
    .map((rawPoint, index) => {
      if (!isLatLngPoint(rawPoint)) return null;
      const velocity = getStreamValue(velocityData, index);
      return {
        lat: rawPoint[0],
        lng: rawPoint[1],
        time: getStreamValue(timeData, index),
        distance: getStreamValue(distanceData, index),
        paceSecPerKm: velocity && velocity > 0 ? 1000 / velocity : null,
        heartRate: getStreamValue(heartRateData, index),
      };
    })
    .filter((point): point is PlaybackPoint => Boolean(point));
}

function getNumberStream(stream: ActivityStream | undefined): number[] | null {
  if (!stream || !Array.isArray(stream.data)) return null;
  return stream.data.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function getStreamValue(values: number[] | null, index: number): number | null {
  const value = values?.[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isLatLngPoint(value: number | [number, number]): value is [number, number] {
  return Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]);
}

function formatPlaybackDistance(distance: number | null): string {
  if (typeof distance !== 'number') return '--';
  return `${(distance / 1000).toFixed(2)} km`;
}

function formatPlaybackTime(seconds: number | null): string {
  if (typeof seconds !== 'number') return '--';
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatPlaybackPace(paceSecPerKm: number | null): string {
  if (typeof paceSecPerKm !== 'number' || paceSecPerKm <= 0 || paceSecPerKm > 1800) return '--';
  let minutes = Math.floor(paceSecPerKm / 60);
  let seconds = Math.round(paceSecPerKm - minutes * 60);
  if (seconds === 60) {
    minutes += 1;
    seconds = 0;
  }
  return `${minutes}'${String(seconds).padStart(2, '0')}"`;
}

function formatPlaybackHeartRate(heartRate: number | null): string {
  if (typeof heartRate !== 'number' || heartRate <= 0) return '--';
  return `${Math.round(heartRate)} bpm`;
}

function createPlaybackMarkerIcon(L: LeafletModule) {
  return L.divIcon({
    className: 'activity-route-playback-marker',
    html: '<span></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function PlaybackStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase text-zinc-500">{label}</p>
      <p className="truncate font-mono text-xs font-black text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
