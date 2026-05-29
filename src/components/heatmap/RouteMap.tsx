'use client';

import React, { useEffect, useRef } from 'react';
import { decodePolyline } from '@/lib/strava';
import { useMapTileLayer } from '@/hooks/useMapTileLayer';
import { TILE_LAYERS } from '@/lib/mapTileLayers';
import { prepareLeafletContainer, releaseLeafletContainer } from '@/lib/leafletContainer';
import type {
  CircleMarker,
  LatLngBounds,
  Layer,
  LayerGroup,
  LeafletMouseEvent,
  Map as LeafletMap,
  Polyline,
  TileLayer,
  TileLayerOptions,
} from 'leaflet';

type LeafletModule = typeof import('leaflet');

export interface RouteMapHandle {
  fitActivity: (activityId: number) => void;
  getBounds: () => LatLngBounds | null;
}

interface MapActivity {
  id: number;
  name: string;
  distance: number;
  start_date: string;
  type: string;
  summary_polyline: string | null;
  color: string;
}

export interface SegmentItem {
  id: number;
  name: string;
  distance: number;
  avg_grade: number;
  climb: number;
  effort_count: number;
  athlete_count: number;
  points: string; // encoded polyline
}

interface RouteMapProps {
  activities: MapActivity[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onShowPopup: (activity: MapActivity | null) => void;
  sidebarOpen: boolean;
  isDark?: boolean;
  segments?: SegmentItem[];
}

function addTileLayer(map: LeafletMap, layerKey: string, isDark: boolean, L: LeafletModule): TileLayer | null {
  const config = TILE_LAYERS[layerKey as keyof typeof TILE_LAYERS] || TILE_LAYERS.osm;
  if (!config.url) return null;
  const options: TileLayerOptions = {
    opacity: isDark ? 0.7 : 1,
    attribution: '',
    maxZoom: 18,
  };
  if (config.subdomains) options.subdomains = config.subdomains;
  return L.tileLayer(config.url, options).addTo(map);
}

interface Cluster {
  lat: number;
  lng: number;
  count: number;
  activityIds: number[];
}

function buildClusters(activities: MapActivity[], cellSizeDeg: number = 0.3): Cluster[] {
  const cells = new Map<string, { latSum: number; lngSum: number; count: number; ids: number[] }>();
  activities.forEach(a => {
    if (!a.summary_polyline) return;
    const pts = decodePolyline(a.summary_polyline);
    if (pts.length === 0) return;
    const [lat, lng] = pts[0];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = `${Math.floor(lat / cellSizeDeg)},${Math.floor(lng / cellSizeDeg)}`;
    const c = cells.get(key) || { latSum: 0, lngSum: 0, count: 0, ids: [] };
    c.latSum += lat;
    c.lngSum += lng;
    c.count += 1;
    c.ids.push(a.id);
    cells.set(key, c);
  });
  return Array.from(cells.values()).map(c => ({
    lat: c.latSum / c.count,
    lng: c.lngSum / c.count,
    count: c.count,
    activityIds: c.ids,
  }));
}

function computeSmartBounds(activities: MapActivity[], L: LeafletModule): LatLngBounds | null {
  if (activities.length === 0) return null;
  const tryBounds = (acts: MapActivity[]) => {
    const b = L.latLngBounds([]);
    let has = false;
    acts.forEach(a => {
      if (!a.summary_polyline) return;
      const pts = decodePolyline(a.summary_polyline);
      if (pts.length < 2) return;
      pts.forEach(p => {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
        b.extend(L.latLng(p[0], p[1]));
        has = true;
      });
    });
    return has && b && typeof b.isValid === 'function' && b.isValid() ? b : null;
  };
  // Prefer recent 20 for a tight initial view; no span cap
  const b20 = tryBounds(activities.slice(0, 20));
  if (b20) return b20;
  const b50 = tryBounds(activities.slice(0, 50));
  if (b50) return b50;
  return tryBounds(activities);
}

export const RouteMap = React.forwardRef(function RouteMap(
  { activities, selectedId, onSelect, onShowPopup, sidebarOpen, isDark = false, segments }: RouteMapProps,
  forwardedRef: React.Ref<RouteMapHandle>
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<Map<number, Polyline>>(new Map());
  const clusterLayerRef = useRef<LayerGroup | null>(null);
  const clusterClickLock = useRef(false);
  const startEndMarkersRef = useRef<Map<number, { start: CircleMarker; end: CircleMarker }>>(new Map());
  const startEndGroupRef = useRef<LayerGroup | null>(null);
  const segmentsLayerRef = useRef<LayerGroup | null>(null);
  const segmentsRef = useRef<SegmentItem[] | undefined>(segments);
  useEffect(() => { segmentsRef.current = segments; });
  const { layer } = useMapTileLayer();
  const isDarkRef = useRef(isDark);
  const layerRef = useRef(layer);
  const selectedRef = useRef(selectedId);
  const activitiesRef = useRef(activities);
  const sidebarOpenRef = useRef(sidebarOpen);

  useEffect(() => { isDarkRef.current = isDark; });
  useEffect(() => { layerRef.current = layer; });
  useEffect(() => { selectedRef.current = selectedId; });
  useEffect(() => { activitiesRef.current = activities; });
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; });

  // Initialize map
  useEffect(() => {
    let destroyed = false;
    let mapContainer: HTMLDivElement | null = null;
    const init = async () => {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');
        const el = containerRef.current;
        if (!el || destroyed) return;
        mapContainer = el;
        prepareLeafletContainer(el);

        const map = L.map(el, { scrollWheelZoom: true, zoomControl: true, attributionControl: false });
        map.zoomControl.setPosition('bottomright');
        mapInstanceRef.current = map;
        addTileLayer(map, layerRef.current, isDarkRef.current, L);

        const ro = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            if (mapInstanceRef.current && !destroyed) mapInstanceRef.current.invalidateSize();
          });
        });
        ro.observe(el);

        // Zoom listener: toggle clusters + start/end markers
        map.on('zoomend', () => {
          updateClusterVisibility(map);
          updateStartEndVisibility(map);
        });

        // Try geolocation first; fallback to activity bounds
        const doRender = () => {
          if (!destroyed) renderAll(map, L, sidebarOpenRef.current);
        };
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              doRender();
              if (!destroyed) {
                map.setView([pos.coords.latitude, pos.coords.longitude], 15);
              }
            },
            () => { doRender(); },
            { timeout: 5000, maximumAge: 600000, enableHighAccuracy: false }
          );
        } else {
          doRender();
        }
      } catch (err) {
        console.error('RouteMap init error:', err);
      }
    };
    init();
    return () => {
      destroyed = true;
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
      }
      layersRef.current.clear();
      clusterLayerRef.current = null;
      startEndMarkersRef.current.clear();
      releaseLeafletContainer(mapContainer);
    };
    // renderAll reads latest activities/sidebar state through refs; the map instance should initialize once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update tile layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    (async () => {
      const L = (await import('leaflet')).default;
      map.eachLayer((l: Layer) => { if (l instanceof L.TileLayer) map.removeLayer(l); });
      addTileLayer(map, layer, isDark, L);
    })();
  }, [layer, isDark]);

  // Render when activities change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    (async () => {
      const L = (await import('leaflet')).default;
      renderAll(map, L, sidebarOpenRef.current);
    })();
    // renderAll reads latest activities/sidebar state through refs, so activities is the actual trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  // Handle selection changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    updateSelectionStyles();
  }, [selectedId]);

  // Render when segments change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    (async () => {
      const L = (await import('leaflet')).default;
      renderSegments(map, L);
    })();
  }, [segments]);

  function getPadding(): [number, number] {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    if (!isDesktop) return [40, 40];
    return sidebarOpenRef.current ? [40, 220] : [40, 40];
  }

  function updateClusterVisibility(map: LeafletMap) {
    try {
      const zoom = map.getZoom();
      if (clusterLayerRef.current) {
        if (zoom >= 13) {
          map.removeLayer(clusterLayerRef.current);
        } else if (!map.hasLayer(clusterLayerRef.current)) {
          map.addLayer(clusterLayerRef.current);
        }
      }
    } catch (e) {
      console.warn('updateClusterVisibility failed:', e);
    }
  }

  function renderAll(map: LeafletMap, L: LeafletModule, sbOpen: boolean) {
    try {
      sidebarOpenRef.current = sbOpen;
      const currentActs = activitiesRef.current;

      // 1. Set view first so layers are projected against correct viewport
      const bounds = computeSmartBounds(currentActs, L);
      if (bounds) {
        const pad = getPadding();
        try {
          map.fitBounds(bounds, {
            padding: [pad[0], pad[1]],
            maxZoom: 16,
          });
          if (map.getZoom() < 12) map.setZoom(12);
        } catch (e) {
          console.warn('fitBounds failed, falling back to setView', e);
          const center = bounds.getCenter?.();
          if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
            map.setView(center, 14, { animate: false });
          }
        }
      }

      // 2. Then render layers against correct view
      renderClusters(map, L, currentActs);
      renderPolylines(map, L, currentActs);
      renderSegments(map, L);
    } catch (e) {
      console.error('renderAll failed:', e);
    }
  }

  function renderClusters(map: LeafletMap, L: LeafletModule, acts: MapActivity[]) {
    if (clusterLayerRef.current) {
      try { map.removeLayer(clusterLayerRef.current); } catch {}
      clusterLayerRef.current = null;
    }
    const clusters = buildClusters(acts);
    if (clusters.length === 0) return;
    const group = L.layerGroup().addTo(map);
    clusterLayerRef.current = group;

    clusters.forEach(c => {
      const size = Math.max(32, Math.min(52, 18 + c.count * 1.2));
      const half = size / 2;

      // Visible label marker (no events, just display)
      const icon = L.divIcon({
        className: 'heatmap-cluster-marker',
        html: `<div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:rgba(59,130,246,0.92);
          color:#fff;display:flex;align-items:center;justify-content:center;
          font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
          font-size:${Math.max(10, Math.min(15, 10 + c.count * 0.08))}px;
          font-weight:bold;border:2px solid #fff;
          box-shadow:0 2px 10px rgba(0,0,0,0.35);
          cursor:pointer;user-select:none;
          outline:none;-webkit-tap-highlight-color:transparent;
        ">${c.count}</div>`,
        iconSize: [size, size],
        iconAnchor: [half, half],
      });

      L.marker([c.lat, c.lng], {
        icon,
        zIndexOffset: 2000,
        interactive: false,
      }).addTo(group);

      // Invisible circleMarker as reliable hit area (SVG, native Leaflet events)
      const hitRadius = (size / 2) + 12;
      const hitLayer = L.circleMarker([c.lat, c.lng], {
        radius: hitRadius,
        fillColor: '#3b82f6',
        fillOpacity: 0.01,
        stroke: false,
        interactive: true,
      }).addTo(group);

      hitLayer.on('click', (e: LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        clusterClickLock.current = true;
        const clusterActs = acts.filter(a => c.activityIds.includes(a.id));
        const b = computeSmartBounds(clusterActs, L);
        if (b) {
          const span = b.getNorthWest().distanceTo(b.getSouthEast());
          if (span < 50000) {
            map.fitBounds(b, { padding: [60, 60], maxZoom: 16 });
          } else {
            map.setView(b.getCenter(), 14);
          }
        }
        setTimeout(() => { clusterClickLock.current = false; }, 150);
      });
    });

    updateClusterVisibility(map);
  }

  const HIGHLIGHT_COLOR = '#facc15';

  function updateStartEndVisibility(map: LeafletMap) {
    try {
      const zoom = map.getZoom();
      const show = zoom >= 13;
      const group = startEndGroupRef.current;
      if (!group) return;
      if (show) {
        if (!map.hasLayer(group)) group.addTo(map);
      } else {
        if (map.hasLayer(group)) map.removeLayer(group);
      }
    } catch (e) {
      console.warn('updateStartEndVisibility failed:', e);
    }
  }

  function renderSegments(map: LeafletMap, L: LeafletModule) {
    if (segmentsLayerRef.current) {
      map.removeLayer(segmentsLayerRef.current);
      segmentsLayerRef.current = null;
    }
    const segs = segmentsRef.current;
    if (!segs || segs.length === 0) return;
    const group = L.layerGroup().addTo(map);
    segmentsLayerRef.current = group;

    segs.forEach((seg) => {
      if (!seg.points) return;
      const pts = decodePolyline(seg.points);
      if (pts.length < 2) return;
      const latLngs = pts.map((p: [number, number]) => L.latLng(p[0], p[1]));
      L.polyline(latLngs, {
        color: '#f97316',
        weight: 4,
        opacity: 1,
        dashArray: '6, 4',
        lineJoin: 'round',
        className: 'heatmap-segment-line',
      }).addTo(group);

      // Label at midpoint
      const midIdx = Math.floor(pts.length / 2);
      const mid = pts[midIdx];
      const label = L.divIcon({
        className: 'heatmap-segment-label',
        html: `<div style="
          font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
          font-size:9px;font-weight:bold;color:#f97316;
          background:rgba(255,255,255,0.9);padding:1px 4px;
          border-radius:2px;white-space:nowrap;pointer-events:none;
          box-shadow:0 1px 3px rgba(0,0,0,0.2);
        ">${escapeHtml(seg.name)}</div>`,
        iconSize: [120, 14],
        iconAnchor: [60, 7],
      });
      L.marker(L.latLng(mid[0], mid[1]), { icon: label, interactive: false, zIndexOffset: 100 }).addTo(group);
    });
  }

  function renderPolylines(map: LeafletMap, L: LeafletModule, acts: MapActivity[]) {
    const currentSelected = selectedRef.current;
    const newLayers = new Map<number, Polyline>();
    const newStartEnd = new Map<number, { start: CircleMarker; end: CircleMarker }>();
    const currentIds = new Set(acts.map(a => a.id));

    // Remove stale polylines and their start/end markers
    layersRef.current.forEach((polyLayer, id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(polyLayer);
        const se = startEndMarkersRef.current.get(id);
        if (se) {
          map.removeLayer(se.start);
          map.removeLayer(se.end);
        }
      }
    });

    // Remove old start/end group if exists
    if (startEndGroupRef.current && map.hasLayer(startEndGroupRef.current)) {
      try { map.removeLayer(startEndGroupRef.current); } catch {}
    }
    const startEndGroup = L.layerGroup();
    acts.forEach((activity) => {
      try {
        if (!activity.summary_polyline) return;
        const points = decodePolyline(activity.summary_polyline);
        if (points.length < 2) return;
        const latLngs = points.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => L.latLng(p[0], p[1]));
        if (latLngs.length < 2) return;
        const isSelected = currentSelected === activity.id;
        const isDimmed = currentSelected !== null && !isSelected;

        let polyLayer = layersRef.current.get(activity.id);
        let seMarkers = startEndMarkersRef.current.get(activity.id);

        if (polyLayer) {
          if (polyLayer.getTooltip?.()) polyLayer.unbindTooltip();
          polyLayer.setStyle({
            color: isSelected ? HIGHLIGHT_COLOR : activity.color,
            weight: isSelected ? 5 : 2.5,
            opacity: isDimmed ? 0.25 : isSelected ? 1 : 0.55,
          });
          if (isSelected) polyLayer.bringToFront();
        } else {
          polyLayer = L.polyline(latLngs, {
            color: isSelected ? HIGHLIGHT_COLOR : activity.color,
            weight: isSelected ? 5 : 2.5,
            opacity: isDimmed ? 0.25 : isSelected ? 1 : 0.55,
            lineJoin: 'round',
            className: 'heatmap-polyline',
          }).addTo(map);

          polyLayer.on('click', (e: LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            if (clusterClickLock.current) return;
            const newId = activity.id === selectedRef.current ? null : activity.id;
            onSelect(newId);
            onShowPopup(newId ? activity : null);
          });

          // Create start/end markers only if coords are valid
          const startPt = points[0];
          const endPt = points[points.length - 1];
          if (Number.isFinite(startPt[0]) && Number.isFinite(startPt[1]) && Number.isFinite(endPt[0]) && Number.isFinite(endPt[1])) {
            const startMarker = L.circleMarker(L.latLng(startPt[0], startPt[1]), {
              radius: 3, fillColor: '#22c55e', fillOpacity: 0.9, color: '#fff', weight: 1.5, interactive: false,
            });
            const endMarker = L.circleMarker(L.latLng(endPt[0], endPt[1]), {
              radius: 3, fillColor: '#ef4444', fillOpacity: 0.9, color: '#fff', weight: 1.5, interactive: false,
            });
            seMarkers = { start: startMarker, end: endMarker };
          }
        }

        newLayers.set(activity.id, polyLayer);
        if (seMarkers) {
          newStartEnd.set(activity.id, seMarkers);
          startEndGroup.addLayer(seMarkers.start);
          startEndGroup.addLayer(seMarkers.end);
        }
      } catch (e) {
        console.warn('Failed to render polyline for activity', activity.id, e);
      }
    });
    startEndGroupRef.current = startEndGroup;

    layersRef.current = newLayers;
    startEndMarkersRef.current = newStartEnd;
    updateStartEndVisibility(map);
  }

  function updateSelectionStyles() {
    try {
      const currentSelected = selectedRef.current;
      layersRef.current.forEach((layer, id) => {
        try {
          const isSelected = currentSelected === id;
          const isDimmed = currentSelected !== null && !isSelected;
          layer.setStyle({
            color: isSelected ? HIGHLIGHT_COLOR : (activitiesRef.current.find(a => a.id === id)?.color || '#3b82f6'),
            weight: isSelected ? 5 : 2.5,
            opacity: isDimmed ? 0.25 : isSelected ? 1 : 0.55,
          });
          if (isSelected) layer.bringToFront();
        } catch (e) {
          console.warn('[RouteMap] updateSelectionStyles per-layer failed for', id, e);
        }
      });
    } catch (e) {
      console.warn('[RouteMap] updateSelectionStyles failed:', e);
    }
  }

  // Expose fitBounds for a single activity to parent
  React.useImperativeHandle(forwardedRef, () => ({
    fitActivity: (activityId: number) => {
      const map = mapInstanceRef.current;
      if (!map) return;
      const act = activitiesRef.current.find(a => a.id === activityId);
      if (!act || !act.summary_polyline) return;
      (async () => {
        const L = (await import('leaflet')).default;
        const pts = decodePolyline(act.summary_polyline);
        if (pts.length < 2) return;
        const validPts = pts.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (validPts.length < 2) return;
        const b = L.latLngBounds(validPts.map(p => L.latLng(p[0], p[1])));
        const pad = getPadding();
        try {
          map.fitBounds(b, {
            paddingTopLeft: [pad[0], pad[0]],
            paddingBottomRight: [pad[1], pad[0]],
            maxZoom: 16,
          });
        } catch (e) {
          console.warn('fitBounds failed for activity', activityId, e);
        }
      })();
    },
    getBounds: () => {
      const map = mapInstanceRef.current;
      if (!map) return null;
      return map.getBounds();
    },
  }));

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: '100%' }} />;
});

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
