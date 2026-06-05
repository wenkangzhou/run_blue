'use client';

import React, { useEffect, useRef, useState } from 'react';
import { decodePolyline } from '@/lib/strava';
import { useMapTileLayer } from '@/hooks/useMapTileLayer';
import { TILE_LAYERS } from '@/lib/mapTileLayers';
import { prepareLeafletContainer, releaseLeafletContainer } from '@/lib/leafletContainer';
import {
  addRouteEndpointMarkers,
  getValidRoutePoints,
  getVisualRouteKey,
} from '@/lib/routeMapVisuals';
import type {
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

const CLUSTER_DETAIL_ZOOM = 14;
const ROUTE_OPACITY = 0.36;
const ROUTE_DETAIL_OPACITY = 0.74;
const ROUTE_DIMMED_OPACITY = 0.08;
const ROUTE_SELECTED_OPACITY = 0.98;
const ROUTE_WEIGHT = 2.8;
const ROUTE_DETAIL_WEIGHT = 5.2;
const ROUTE_HIT_WEIGHT = 18;
const ROUTE_SELECTED_WEIGHT = 6.8;
const HIGHLIGHT_COLOR = '#d97706';
const ROUTE_GROUP_COLOR = '#0f766e';
const ROUTE_SINGLE_COLOR = '#147f93';

interface DisplayRouteGroup {
  key: string;
  activities: MapActivity[];
  representative: MapActivity;
  points: Array<[number, number]>;
  color: string;
  count: number;
  activityIds: Set<number>;
}

interface RouteLayerBundle {
  halo: Polyline;
  line: Polyline;
  hit: Polyline;
  route: DisplayRouteGroup;
}

interface RouteChoiceState {
  x: number;
  y: number;
  activities: MapActivity[];
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
  anchorPoints: Array<[number, number]>;
}

type ClusterCell = { latSum: number; lngSum: number; count: number; anchorPoints: Array<[number, number]> };

function getClusterCellSizePx(zoom: number): number {
  if (zoom <= 9) return 64;
  if (zoom <= 11) return 72;
  return 84;
}

function getRouteAnchorPoint(points: Array<[number, number]>): [number, number] | null {
  let latSum = 0;
  let lngSum = 0;
  let count = 0;

  points.forEach(([lat, lng]) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    latSum += lat;
    lngSum += lng;
    count += 1;
  });

  return count > 0 ? [latSum / count, lngSum / count] : null;
}

function buildClusters(activities: MapActivity[], map: LeafletMap, L: LeafletModule): Cluster[] {
  const cells = new Map<string, ClusterCell>();
  const cellSizePx = getClusterCellSizePx(map.getZoom());
  activities.forEach(a => {
    if (!a.summary_polyline) return;
    const pts = decodePolyline(a.summary_polyline);
    if (pts.length === 0) return;
    const anchor = getRouteAnchorPoint(pts);
    if (!anchor) return;
    const [lat, lng] = anchor;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const point = map.latLngToLayerPoint(L.latLng(lat, lng));
    const key = `${Math.floor(point.x / cellSizePx)},${Math.floor(point.y / cellSizePx)}`;
    const c = cells.get(key) || { latSum: 0, lngSum: 0, count: 0, anchorPoints: [] };
    c.latSum += lat;
    c.lngSum += lng;
    c.count += 1;
    c.anchorPoints.push([lat, lng]);
    cells.set(key, c);
  });
  return Array.from(cells.values()).map(c => ({
    lat: c.latSum / c.count,
    lng: c.lngSum / c.count,
    count: c.count,
    anchorPoints: c.anchorPoints,
  }));
}

function computeSmartBounds(activities: MapActivity[], L: LeafletModule): LatLngBounds | null {
  if (activities.length === 0) return null;
  const anchors = activities
    .map((activity) => {
      if (!activity.summary_polyline) return null;
      const points = getValidRoutePoints(decodePolyline(activity.summary_polyline));
      const anchor = getRouteAnchorPoint(points);
      return anchor ? { activity, anchor, points } : null;
    })
    .filter((item): item is { activity: MapActivity; anchor: [number, number]; points: Array<[number, number]> } => Boolean(item));

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

  if (anchors.length > 0) {
    const cellSize = 0.12;
    const cells = new Map<string, { count: number; latSum: number; lngSum: number }>();
    anchors.forEach(({ anchor }) => {
      const key = `${Math.floor(anchor[0] / cellSize)},${Math.floor(anchor[1] / cellSize)}`;
      const cell = cells.get(key) ?? { count: 0, latSum: 0, lngSum: 0 };
      cell.count += 1;
      cell.latSum += anchor[0];
      cell.lngSum += anchor[1];
      cells.set(key, cell);
    });

    const densest = Array.from(cells.values()).sort((a, b) => b.count - a.count)[0];
    if (densest && densest.count >= Math.max(4, Math.ceil(anchors.length * 0.08))) {
      const center: [number, number] = [densest.latSum / densest.count, densest.lngSum / densest.count];
      const dominantActivities = anchors
        .filter(({ anchor }) => L.latLng(anchor[0], anchor[1]).distanceTo(L.latLng(center[0], center[1])) <= 26000)
        .sort((a, b) => b.activity.start_date.localeCompare(a.activity.start_date))
        .slice(0, 160)
        .map(({ activity }) => activity);
      const dominantBounds = tryBounds(dominantActivities);
      if (dominantBounds) return dominantBounds;
    }
  }

  const b80 = tryBounds(activities.slice(0, 80));
  if (b80) return b80;
  return tryBounds(activities);
}

function computeClusterAnchorBounds(cluster: Cluster, L: LeafletModule): LatLngBounds | null {
  if (cluster.anchorPoints.length === 0) return null;
  const bounds = L.latLngBounds([]);
  cluster.anchorPoints.forEach(([lat, lng]) => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      bounds.extend(L.latLng(lat, lng));
    }
  });
  return bounds.isValid() ? bounds : null;
}

function getBoundsSpanMeters(bounds: LatLngBounds): number {
  return bounds.getNorthWest().distanceTo(bounds.getSouthEast());
}

function getRouteDisplayColor(count: number) {
  if (count > 1) return ROUTE_GROUP_COLOR;
  return ROUTE_SINGLE_COLOR;
}

function getRouteDisplayWeight(count: number, zoom: number) {
  const baseWeight = zoom >= CLUSTER_DETAIL_ZOOM ? ROUTE_DETAIL_WEIGHT : ROUTE_WEIGHT;
  if (count <= 1) return baseWeight;
  return Math.min(7.4, baseWeight + Math.log2(count + 1) * 0.86);
}

function getRouteDisplayOpacity(count: number, zoom: number) {
  const baseOpacity = zoom >= CLUSTER_DETAIL_ZOOM ? ROUTE_DETAIL_OPACITY : ROUTE_OPACITY;
  if (count <= 1) return baseOpacity;
  return Math.min(0.82, baseOpacity + Math.log2(count + 1) * 0.034);
}

function getRouteHaloOpacity(isDimmed: boolean, zoom: number) {
  if (isDimmed) return 0.12;
  return zoom >= CLUSTER_DETAIL_ZOOM ? 0.86 : 0.42;
}

function buildDisplayRouteGroups(activities: MapActivity[]): DisplayRouteGroup[] {
  const groups = new Map<string, DisplayRouteGroup>();

  activities.forEach((activity) => {
    if (!activity.summary_polyline) return;
    const points = getValidRoutePoints(decodePolyline(activity.summary_polyline));
    if (points.length < 2) return;

    const key = getVisualRouteKey(points, {
      distanceMeters: activity.distance,
      reverseAware: true,
    });
    if (!key) return;

    const existing = groups.get(key);
    if (existing) {
      existing.activities.push(activity);
      existing.activityIds.add(activity.id);
      existing.count += 1;
      existing.color = getRouteDisplayColor(existing.count);
      return;
    }

    groups.set(key, {
      key,
      activities: [activity],
      representative: activity,
      points,
      color: getRouteDisplayColor(1),
      count: 1,
      activityIds: new Set([activity.id]),
    });
  });

  return Array.from(groups.values()).sort((a, b) => a.count - b.count);
}

function getRouteGroupLabel(route: DisplayRouteGroup) {
  return route.count > 1
    ? `${route.representative.name} · ${route.count} runs`
    : route.representative.name;
}

function formatChoiceDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatChoiceDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function pointSegmentDistance(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function uniqueActivities(activities: MapActivity[]) {
  const seen = new Set<number>();
  return activities.filter((activity) => {
    if (seen.has(activity.id)) return false;
    seen.add(activity.id);
    return true;
  });
}

export const RouteMap = React.forwardRef(function RouteMap(
  { activities, selectedId, onSelect, onShowPopup, sidebarOpen, isDark = false, segments }: RouteMapProps,
  forwardedRef: React.Ref<RouteMapHandle>
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const routeLayerGroupRef = useRef<LayerGroup | null>(null);
  const routeLayersRef = useRef<Map<string, RouteLayerBundle>>(new Map());
  const selectedRouteLayerRef = useRef<LayerGroup | null>(null);
  const clusterLayerRef = useRef<LayerGroup | null>(null);
  const clusterClickLock = useRef(false);
  const segmentsLayerRef = useRef<LayerGroup | null>(null);
  const segmentsRef = useRef<SegmentItem[] | undefined>(segments);
  useEffect(() => { segmentsRef.current = segments; });
  const { layer } = useMapTileLayer();
  const isDarkRef = useRef(isDark);
  const layerRef = useRef(layer);
  const selectedRef = useRef(selectedId);
  const activitiesRef = useRef(activities);
  const sidebarOpenRef = useRef(sidebarOpen);
  const [routeChoice, setRouteChoice] = useState<RouteChoiceState | null>(null);

  useEffect(() => { isDarkRef.current = isDark; });
  useEffect(() => { layerRef.current = layer; });
  useEffect(() => { selectedRef.current = selectedId; });
  useEffect(() => { activitiesRef.current = activities; });
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; });

  // Initialize map
  useEffect(() => {
    let destroyed = false;
    let mapContainer: HTMLDivElement | null = null;
    const routeLayers = routeLayersRef.current;
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
          if (map.getZoom() < CLUSTER_DETAIL_ZOOM) {
            renderClusters(map, L, activitiesRef.current);
          } else {
            updateClusterVisibility(map);
          }
          renderPolylines(map, L, activitiesRef.current);
        });
        map.on('click', () => {
          setRouteChoice(null);
          onSelect(null);
          onShowPopup(null);
        });

        // Prefer the athlete's route data for the heatmap viewport; browser geolocation can point elsewhere.
        map.setView([31.2304, 121.4737], 10, { animate: false });
        requestAnimationFrame(() => {
          if (!destroyed) renderAll(map, L, sidebarOpenRef.current);
        });
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
      routeLayers.clear();
      routeLayerGroupRef.current = null;
      selectedRouteLayerRef.current = null;
      clusterLayerRef.current = null;
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
    // updateSelectionStyles reads the latest map/activity refs and should only run on selectedId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function getFitPadding(): { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] } {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    if (!isDesktop) {
      return {
        paddingTopLeft: [24, 72],
        paddingBottomRight: [24, 84],
      };
    }
    return {
      paddingTopLeft: [40, 68],
      paddingBottomRight: [sidebarOpenRef.current ? 260 : 48, 68],
    };
  }

  function fitBoundsToView(
    map: LeafletMap,
    bounds: LatLngBounds,
    options: { maxZoom?: number; minZoom?: number; animate?: boolean } = {}
  ) {
    const { maxZoom = 16, minZoom, animate = false } = options;
    try {
      map.invalidateSize({ animate: false, pan: false });
    } catch {}
    map.fitBounds(bounds, {
      ...getFitPadding(),
      maxZoom,
      animate,
    });
    if (minZoom !== undefined && map.getZoom() < minZoom) {
      map.setZoom(minZoom, { animate });
    }
  }

  function updateClusterVisibility(map: LeafletMap) {
    try {
      const zoom = map.getZoom();
      if (clusterLayerRef.current) {
        if (zoom >= CLUSTER_DETAIL_ZOOM) {
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
        try {
          fitBoundsToView(map, bounds, { maxZoom: 16, minZoom: 12, animate: false });
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
    const clusters = buildClusters(acts, map, L);
    if (clusters.length === 0) return;
    const group = L.layerGroup().addTo(map);
    clusterLayerRef.current = group;

    clusters.forEach(c => {
      const size = Math.max(32, Math.min(52, 18 + c.count * 1.2));
      const half = size / 2;

      const zoomToCluster = (e: LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        clusterClickLock.current = true;
        const targetZoom = Math.min(16, Math.max(map.getZoom() + 2, CLUSTER_DETAIL_ZOOM));
        const anchorBounds = computeClusterAnchorBounds(c, L);
        const center = anchorBounds?.isValid()
          ? anchorBounds.getCenter()
          : L.latLng(c.lat, c.lng);

        if (Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
          const span = anchorBounds ? getBoundsSpanMeters(anchorBounds) : 0;
          if (anchorBounds && span > 1200 && span < 60000) {
            try {
              fitBoundsToView(map, anchorBounds, { maxZoom: targetZoom, minZoom: CLUSTER_DETAIL_ZOOM, animate: true });
            } catch {
              map.flyTo(center, targetZoom, { duration: 0.35 });
            }
          } else {
            map.flyTo(center, targetZoom, { duration: 0.35 });
          }
        }
        window.setTimeout(() => { clusterClickLock.current = false; }, 250);
      };

      // Visible label marker is interactive so tapping the number itself works on mobile.
      const icon = L.divIcon({
        className: 'heatmap-cluster-marker',
        html: `<div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:linear-gradient(135deg, rgba(83,141,180,0.96), rgba(110,166,199,0.94));
          color:#fff;display:flex;align-items:center;justify-content:center;
          font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
          font-size:${Math.max(10, Math.min(15, 10 + c.count * 0.08))}px;
          font-weight:bold;border:2px solid rgba(255,255,255,0.92);
          box-shadow:0 5px 14px rgba(46,75,96,0.22), inset 0 1px 0 rgba(255,255,255,0.26);
          cursor:pointer;user-select:none;
          outline:none;-webkit-tap-highlight-color:transparent;
        ">${c.count}</div>`,
        iconSize: [size, size],
        iconAnchor: [half, half],
      });

      const marker = L.marker([c.lat, c.lng], {
        icon,
        zIndexOffset: 2000,
        interactive: true,
        keyboard: false,
      }).addTo(group);
      marker.on('click', zoomToCluster);

      // Keep a larger transparent hit area around the marker for imprecise finger taps.
      const hitRadius = (size / 2) + 12;
      const hitLayer = L.circleMarker([c.lat, c.lng], {
        radius: hitRadius,
        fillColor: '#6aa5c8',
        fillOpacity: 0.01,
        stroke: false,
        interactive: true,
      }).addTo(group);
      hitLayer.on('click', zoomToCluster);
    });

    updateClusterVisibility(map);
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
        color: '#b56f40',
        weight: 3.2,
        opacity: 0.86,
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
          font-size:9px;font-weight:bold;color:#9a5d35;
          background:rgba(255,255,255,0.86);padding:1px 4px;
          border-radius:2px;white-space:nowrap;pointer-events:none;
          box-shadow:0 1px 4px rgba(54,45,34,0.16);
        ">${escapeHtml(seg.name)}</div>`,
        iconSize: [120, 14],
        iconAnchor: [60, 7],
      });
      L.marker(L.latLng(mid[0], mid[1]), { icon: label, interactive: false, zIndexOffset: 100 }).addTo(group);
    });
  }

  function getNearbyActivitiesAtPoint(map: LeafletMap, point: { x: number; y: number }, acts: MapActivity[]) {
    const thresholdPx = map.getZoom() >= CLUSTER_DETAIL_ZOOM ? 12 : 16;

    return acts
      .map((activity) => {
        if (!activity.summary_polyline) return null;
        const points = getValidRoutePoints(decodePolyline(activity.summary_polyline));
        if (points.length < 2) return null;
        const step = Math.max(1, Math.ceil(points.length / 180));
        let bestDistance = Infinity;
        let previous = map.latLngToLayerPoint(points[0]);

        for (let index = step; index < points.length; index += step) {
          const current = map.latLngToLayerPoint(points[index]);
          bestDistance = Math.min(bestDistance, pointSegmentDistance(point, previous, current));
          previous = current;
          if (bestDistance <= thresholdPx) break;
        }

        const last = map.latLngToLayerPoint(points[points.length - 1]);
        bestDistance = Math.min(bestDistance, pointSegmentDistance(point, previous, last));

        return bestDistance <= thresholdPx ? { activity, distance: bestDistance } : null;
      })
      .filter((item): item is { activity: MapActivity; distance: number } => Boolean(item))
      .sort((a, b) => a.distance - b.distance || b.activity.start_date.localeCompare(a.activity.start_date))
      .slice(0, 80)
      .map(({ activity }) => activity);
  }

  function renderPolylines(map: LeafletMap, L: LeafletModule, acts: MapActivity[]) {
    if (routeLayerGroupRef.current) {
      try { map.removeLayer(routeLayerGroupRef.current); } catch {}
      routeLayerGroupRef.current = null;
    }
    routeLayersRef.current.clear();

    const allRoutes = buildDisplayRouteGroups(acts);
    const repeatedRoutes = allRoutes.filter(route => route.count > 1);
    const shouldCondense = map.getZoom() < CLUSTER_DETAIL_ZOOM && repeatedRoutes.length >= 8;
    const routes = shouldCondense ? repeatedRoutes : allRoutes;

    if (routes.length === 0) {
      renderSelectedRoute(map, L);
      return;
    }

    const zoom = map.getZoom();
    const currentSelected = selectedRef.current;
    const groupLayer = L.layerGroup().addTo(map);
    routeLayerGroupRef.current = groupLayer;

    routes.forEach((route) => {
      try {
        const latLngs = route.points.map(p => L.latLng(p[0], p[1]));
        if (latLngs.length < 2) return;
        const containsSelected = currentSelected !== null && route.activityIds.has(currentSelected);
        const isDimmed = currentSelected !== null && !containsSelected;
        const weight = getRouteDisplayWeight(route.count, zoom);
        const opacity = isDimmed ? ROUTE_DIMMED_OPACITY : getRouteDisplayOpacity(route.count, zoom);

        const halo = L.polyline(latLngs, {
          color: '#ffffff',
          weight: weight + (zoom >= CLUSTER_DETAIL_ZOOM ? 4.2 : 3.2),
          opacity: getRouteHaloOpacity(isDimmed, zoom),
          lineJoin: 'round',
          interactive: false,
          className: 'heatmap-polyline-halo',
        }).addTo(groupLayer);

        const line = L.polyline(latLngs, {
          color: route.color,
          weight,
          opacity,
          lineJoin: 'round',
          interactive: false,
          className: 'heatmap-polyline',
        }).addTo(groupLayer);

        const hit = L.polyline(latLngs, {
          color: route.color,
          weight: ROUTE_HIT_WEIGHT,
          opacity: 0.001,
          lineJoin: 'round',
          className: 'heatmap-polyline-hit',
        }).addTo(groupLayer);

        hit.bindTooltip(getRouteGroupLabel(route), {
          sticky: true,
          direction: 'top',
          opacity: 0.92,
          className: 'route-line-tooltip',
        });

        const restoreRouteStyle = () => {
          const latestSelected = selectedRef.current;
          const latestContainsSelected = latestSelected !== null && route.activityIds.has(latestSelected);
          const latestDimmed = latestSelected !== null && !latestContainsSelected;
          const latestWeight = getRouteDisplayWeight(route.count, map.getZoom());
          halo.setStyle({
            weight: latestWeight + (map.getZoom() >= CLUSTER_DETAIL_ZOOM ? 4.2 : 3.2),
            opacity: getRouteHaloOpacity(latestDimmed, map.getZoom()),
          });
          line.setStyle({
            color: route.color,
            weight: latestWeight,
            opacity: latestDimmed ? ROUTE_DIMMED_OPACITY : getRouteDisplayOpacity(route.count, map.getZoom()),
          });
        };

        hit.on('mouseover', () => {
          halo.setStyle({
            weight: weight + 5.6,
            opacity: 0.94,
          });
          line.setStyle({
            color: route.count > 1 ? '#0b6b60' : '#0e7490',
            weight: weight + 1.6,
            opacity: 0.98,
          });
          halo.bringToFront();
          line.bringToFront();
          hit.bringToFront();
        });
        hit.on('mouseout', restoreRouteStyle);

        hit.on('click', (e: LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (clusterClickLock.current) return;
          const representative = route.representative;
          const nearbyActivities = uniqueActivities([
            ...route.activities,
            ...getNearbyActivitiesAtPoint(map, e.layerPoint ?? map.latLngToLayerPoint(e.latlng), activitiesRef.current),
          ]);
          if (nearbyActivities.length > 1) {
            setRouteChoice({
              x: e.containerPoint.x,
              y: e.containerPoint.y,
              activities: nearbyActivities,
            });
            onSelect(null);
            onShowPopup(null);
            return;
          }
          setRouteChoice(null);
          onSelect(representative.id);
          onShowPopup(representative);
        });

        routeLayersRef.current.set(route.key, { halo, line, hit, route });
        if (containsSelected) {
          halo.bringToFront();
          line.bringToFront();
          hit.bringToFront();
        }
      } catch (e) {
        console.warn('Failed to render display route', route.key, e);
      }
    });

    renderSelectedRoute(map, L);
  }

  function renderSelectedRoute(map: LeafletMap, L: LeafletModule) {
    if (selectedRouteLayerRef.current) {
      try { map.removeLayer(selectedRouteLayerRef.current); } catch {}
      selectedRouteLayerRef.current = null;
    }

    const currentSelected = selectedRef.current;
    if (currentSelected === null) return;

    const activity = activitiesRef.current.find(a => a.id === currentSelected);
    if (!activity?.summary_polyline) return;

    const points = getValidRoutePoints(decodePolyline(activity.summary_polyline));
    if (points.length < 2) return;

    const selectedGroup = L.layerGroup().addTo(map);
    selectedRouteLayerRef.current = selectedGroup;
    const latLngs = points.map(p => L.latLng(p[0], p[1]));

    L.polyline(latLngs, {
      color: '#ffffff',
      weight: ROUTE_SELECTED_WEIGHT + 3.2,
      opacity: 0.88,
      lineJoin: 'round',
      interactive: false,
      className: 'heatmap-polyline-selected-halo',
    }).addTo(selectedGroup);

    L.polyline(latLngs, {
      color: HIGHLIGHT_COLOR,
      weight: ROUTE_SELECTED_WEIGHT,
      opacity: ROUTE_SELECTED_OPACITY,
      lineJoin: 'round',
      className: 'heatmap-polyline-selected',
    }).addTo(selectedGroup);

    addRouteEndpointMarkers(L, selectedGroup, points, { size: 20 });
  }

  function updateSelectionStyles() {
    try {
      const currentSelected = selectedRef.current;
      const zoom = mapInstanceRef.current?.getZoom() ?? CLUSTER_DETAIL_ZOOM;
      routeLayersRef.current.forEach((bundle) => {
        try {
          const containsSelected = currentSelected !== null && bundle.route.activityIds.has(currentSelected);
          const isDimmed = currentSelected !== null && !containsSelected;
          const weight = getRouteDisplayWeight(bundle.route.count, zoom);
          bundle.halo.setStyle({
            weight: weight + (zoom >= CLUSTER_DETAIL_ZOOM ? 4.2 : 3.2),
            opacity: getRouteHaloOpacity(isDimmed, zoom),
          });
          bundle.line.setStyle({
            color: bundle.route.color,
            weight,
            opacity: isDimmed ? ROUTE_DIMMED_OPACITY : getRouteDisplayOpacity(bundle.route.count, zoom),
          });
          if (containsSelected) {
            bundle.halo.bringToFront();
            bundle.line.bringToFront();
            bundle.hit.bringToFront();
          }
        } catch (e) {
          console.warn('[RouteMap] updateSelectionStyles per-layer failed for', bundle.route.key, e);
        }
      });
      const map = mapInstanceRef.current;
      if (map) {
        (async () => {
          const L = (await import('leaflet')).default;
          renderSelectedRoute(map, L);
        })();
      }
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
        try {
          fitBoundsToView(map, b, { maxZoom: 16, animate: true });
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

  const choiceActivities = routeChoice
    ? [...routeChoice.activities].sort((a, b) => b.start_date.localeCompare(a.start_date))
    : [];

  return (
    <div className="heatmap-map relative h-full w-full" style={{ minHeight: '100%' }}>
      <div ref={containerRef} className="absolute inset-0" />
      {routeChoice && (
        <div
          className="absolute z-[1100] w-[260px] max-w-[calc(100vw-24px)] border border-zinc-200 bg-white/95 shadow-xl backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95"
          style={{
            left: `${routeChoice.x + 12}px`,
            top: `${routeChoice.y + 12}px`,
            transform: [
              routeChoice.x > 210 ? 'translateX(-100%)' : '',
              routeChoice.y > 520 ? 'translateY(-100%)' : '',
            ].filter(Boolean).join(' ') || undefined,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <div className="min-w-0">
              <p className="truncate font-mono text-[11px] font-bold text-zinc-900 dark:text-zinc-50">
                重合路线
              </p>
              <p className="font-mono text-[10px] text-zinc-500">
                共 {routeChoice.activities.length} 条附近记录，选择一次活动
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 px-1.5 py-1 font-mono text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              onClick={() => setRouteChoice(null)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {choiceActivities.map((activity) => (
              <button
                type="button"
                key={activity.id}
                className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/30"
                onClick={() => {
                  selectedRef.current = activity.id;
                  setRouteChoice(null);
                  onSelect(activity.id);
                  onShowPopup(activity);
                }}
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: activity.color || ROUTE_SINGLE_COLOR }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] font-bold text-zinc-900 dark:text-zinc-50">
                    {activity.name}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">
                    {formatChoiceDate(activity.start_date)} · {formatChoiceDistance(activity.distance)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
