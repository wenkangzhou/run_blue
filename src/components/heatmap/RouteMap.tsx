'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronDown, X } from 'lucide-react';
import { decodePolyline } from '@/lib/strava';
import { useMapTileLayer } from '@/hooks/useMapTileLayer';
import { TILE_LAYERS } from '@/lib/mapTileLayers';
import { prepareLeafletContainer, releaseLeafletContainer } from '@/lib/leafletContainer';
import {
  addRouteEndpointMarkers,
  getValidRoutePoints,
  getVisualRouteKey,
} from '@/lib/routeMapVisuals';
import {
  getHeatmapClusterCellSizePx,
  getHeatmapDisplayPolicy,
  HEATMAP_DETAIL_ZOOM,
  HEATMAP_PATTERN_ZOOM,
  type HeatmapMapMode,
} from '@/lib/heatmapDisplay';
import { useTranslation } from 'react-i18next';
import type {
  LatLngBounds,
  Layer,
  LayerGroup,
  LeafletMouseEvent,
  Map as LeafletMap,
  Polyline,
  TileLayer,
  TileLayerOptions,
  Tooltip,
} from 'leaflet';

type LeafletModule = typeof import('leaflet');

export interface RouteMapHandle {
  fitActivity: (activityId: number) => void;
  fitOverview: () => void;
  getBounds: () => LatLngBounds | null;
}

export interface MapActivity {
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
  onViewStateChange?: (state: RouteMapViewState) => void;
}

export type RouteMapMode = HeatmapMapMode;

export interface RouteMapViewState {
  mode: RouteMapMode;
  zoom: number;
  clusterCount: number;
  renderedRoutes: number;
  availableRoutes: number;
  hiddenRoutes: number;
}

const ROUTE_DETAIL_OPACITY = 0.42;
const ROUTE_DIMMED_OPACITY = 0.1;
const ROUTE_SELECTED_OPACITY = 0.98;
const ROUTE_WEIGHT = 3;
const ROUTE_DETAIL_WEIGHT = 3.6;
const ROUTE_HIT_WEIGHT = 24;
const ROUTE_SELECTED_WEIGHT = 5.8;
const HIGHLIGHT_COLOR = '#f97316';
const ROUTE_BASE_COLOR = '#1d4ed8';

interface DisplayRouteGroup {
  key: string;
  activities: MapActivity[];
  representative: MapActivity;
  points: Array<[number, number]>;
  bounds: {
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  };
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

interface RouteGeometry {
  polyline: string;
  points: Array<[number, number]>;
  anchor: [number, number] | null;
  bounds: DisplayRouteGroup['bounds'];
}

const routeGeometryCache = new Map<number, RouteGeometry>();

function addTileLayer(map: LeafletMap, layerKey: string, isDark: boolean, L: LeafletModule): TileLayer | null {
  const effectiveLayerKey = layerKey === 'osm' ? 'cartodb' : layerKey;
  const config = TILE_LAYERS[effectiveLayerKey as keyof typeof TILE_LAYERS] || TILE_LAYERS.cartodb;
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

function getRouteAnchorPoint(points: Array<[number, number]>): [number, number] | null {
  const valid = points
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    .filter((_, index) => index % Math.max(1, Math.ceil(points.length / 120)) === 0);
  if (valid.length === 0) return null;
  const latitudes = valid.map(([lat]) => lat).sort((a, b) => a - b);
  const longitudes = valid.map(([, lng]) => lng).sort((a, b) => a - b);
  const middle = Math.floor(valid.length / 2);
  return [latitudes[middle], longitudes[middle]];
}

function getRouteGeometry(activity: MapActivity): RouteGeometry | null {
  if (!activity.summary_polyline) return null;
  const cached = routeGeometryCache.get(activity.id);
  if (cached?.polyline === activity.summary_polyline) return cached;
  const points = getValidRoutePoints(decodePolyline(activity.summary_polyline));
  if (points.length < 2) return null;
  const geometry: RouteGeometry = {
    polyline: activity.summary_polyline,
    points,
    anchor: getRouteAnchorPoint(points),
    bounds: getPointBounds(points),
  };
  routeGeometryCache.set(activity.id, geometry);
  return geometry;
}

function buildClusters(activities: MapActivity[], map: LeafletMap, L: LeafletModule): Cluster[] {
  const cells = new Map<string, ClusterCell>();
  const cellSizePx = getHeatmapClusterCellSizePx(map.getZoom());
  activities.forEach(a => {
    const geometry = getRouteGeometry(a);
    const anchor = geometry?.anchor;
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
      const geometry = getRouteGeometry(activity);
      return geometry?.anchor
        ? { activity, anchor: geometry.anchor, points: geometry.points }
        : null;
    })
    .filter((item): item is { activity: MapActivity; anchor: [number, number]; points: Array<[number, number]> } => Boolean(item));

  const tryBounds = (acts: MapActivity[]) => {
    const b = L.latLngBounds([]);
    let has = false;
    acts.forEach(a => {
      const geometry = getRouteGeometry(a);
      if (!geometry) return;
      geometry.points.forEach(p => {
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

function getRouteDisplayColor() {
  return ROUTE_BASE_COLOR;
}

function getRouteDisplayWeight(count: number, zoom: number) {
  const baseWeight = zoom >= HEATMAP_DETAIL_ZOOM ? ROUTE_DETAIL_WEIGHT : ROUTE_WEIGHT;
  if (count <= 1) return baseWeight;
  return Math.min(6.4, baseWeight + Math.log2(count + 1) * 0.58);
}

function getRouteDisplayOpacity(count: number, zoom: number) {
  if (count <= 1) return zoom >= HEATMAP_DETAIL_ZOOM ? 0.36 : 0.24;
  const baseOpacity = zoom >= HEATMAP_DETAIL_ZOOM ? ROUTE_DETAIL_OPACITY : 0.5;
  return Math.min(0.76, baseOpacity + Math.log2(count + 1) * 0.03);
}

function getRouteHaloOpacity(isDimmed: boolean, zoom: number) {
  if (isDimmed) return 0.08;
  return zoom >= HEATMAP_DETAIL_ZOOM ? 0.72 : 0.8;
}

function getPointBounds(points: Array<[number, number]>) {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  points.forEach(([lat, lng]) => {
    minLat = Math.min(minLat, lat);
    minLng = Math.min(minLng, lng);
    maxLat = Math.max(maxLat, lat);
    maxLng = Math.max(maxLng, lng);
  });
  return { minLat, minLng, maxLat, maxLng };
}

function routeIntersectsView(route: DisplayRouteGroup, bounds: LatLngBounds) {
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();
  return route.bounds.maxLat >= south
    && route.bounds.minLat <= north
    && route.bounds.maxLng >= west
    && route.bounds.minLng <= east;
}

function compareDisplayRoutes(left: DisplayRouteGroup, right: DisplayRouteGroup) {
  if (left.count !== right.count) return right.count - left.count;
  return right.representative.start_date.localeCompare(left.representative.start_date);
}

function buildDisplayRouteGroups(activities: MapActivity[]): DisplayRouteGroup[] {
  const groups = new Map<string, DisplayRouteGroup>();

  activities.forEach((activity) => {
    const geometry = getRouteGeometry(activity);
    if (!geometry) return;
    const points = geometry.points;

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
      existing.color = getRouteDisplayColor();
      return;
    }

    groups.set(key, {
      key,
      activities: [activity],
      representative: activity,
      points,
      bounds: geometry.bounds,
      color: getRouteDisplayColor(),
      count: 1,
      activityIds: new Set([activity.id]),
    });
  });

  return Array.from(groups.values()).sort(compareDisplayRoutes);
}

function getRouteGroupLabel(route: DisplayRouteGroup, runsLabel: string) {
  return route.count > 1
    ? `${route.representative.name} · ${route.count} ${runsLabel}`
    : route.representative.name;
}

function formatChoiceDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatChoiceDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
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
  {
    activities,
    selectedId,
    onSelect,
    onShowPopup,
    sidebarOpen,
    isDark = false,
    segments,
    onViewStateChange,
  }: RouteMapProps,
  forwardedRef: React.Ref<RouteMapHandle>
) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const routeLayerGroupRef = useRef<LayerGroup | null>(null);
  const routeLayersRef = useRef<Map<string, RouteLayerBundle>>(new Map());
  const displayRoutesCacheRef = useRef<{
    activities: MapActivity[];
    routes: DisplayRouteGroup[];
  } | null>(null);
  const hoverTooltipRef = useRef<Tooltip | null>(null);
  const hoveredRouteKeyRef = useRef<string | null>(null);
  const selectedRouteLayerRef = useRef<LayerGroup | null>(null);
  const clusterLayerRef = useRef<LayerGroup | null>(null);
  const clusterClickLock = useRef(false);
  const lastRouteTouchOpenAtRef = useRef(0);
  const lastRouteSelectionOpenAtRef = useRef(0);
  const viewportRenderFrameRef = useRef<number | null>(null);
  const segmentsLayerRef = useRef<LayerGroup | null>(null);
  const segmentsRef = useRef<SegmentItem[] | undefined>(segments);
  useEffect(() => { segmentsRef.current = segments; });
  const { layer } = useMapTileLayer();
  const isDarkRef = useRef(isDark);
  const layerRef = useRef(layer);
  const selectedRef = useRef(selectedId);
  const activitiesRef = useRef(activities);
  const sidebarOpenRef = useRef(sidebarOpen);
  const onViewStateChangeRef = useRef(onViewStateChange);
  const [routeChoice, setRouteChoice] = useState<RouteChoiceState | null>(null);
  const [choiceLimit, setChoiceLimit] = useState(12);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const isCompactViewportRef = useRef(false);

  function closeRouteTooltip(map: LeafletMap) {
    if (hoverTooltipRef.current) {
      try {
        map.closeTooltip(hoverTooltipRef.current);
      } catch {}
    }
    hoverTooltipRef.current = null;
    hoveredRouteKeyRef.current = null;
  }

  useEffect(() => { isDarkRef.current = isDark; });
  useEffect(() => { layerRef.current = layer; });
  useEffect(() => { selectedRef.current = selectedId; });
  useEffect(() => { activitiesRef.current = activities; });
  useEffect(() => { sidebarOpenRef.current = sidebarOpen; });
  useEffect(() => { onViewStateChangeRef.current = onViewStateChange; });

  useEffect(() => {
    const updateViewport = () => {
      const compact = window.innerWidth < 768;
      isCompactViewportRef.current = compact;
      setIsCompactViewport(compact);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    setChoiceLimit(12);
  }, [routeChoice]);

  // Initialize map
  useEffect(() => {
    let destroyed = false;
    let mapContainer: HTMLDivElement | null = null;
    let routeTapHandler: ((event: Event) => void) | null = null;
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

        routeTapHandler = (event: Event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest('.leaflet-control')) return;
          if (map.getZoom() < HEATMAP_PATTERN_ZOOM) return;
          const touchEvent = event as TouchEvent;
          const pointerEvent = event as PointerEvent;
          const touch = 'changedTouches' in touchEvent ? touchEvent.changedTouches[0] : null;
          const clientX = touch?.clientX ?? pointerEvent.clientX;
          const clientY = touch?.clientY ?? pointerEvent.clientY;
          if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
          const rect = map.getContainer().getBoundingClientRect();
          const containerPoint = L.point(clientX - rect.left, clientY - rect.top);
          const latLng = map.containerPointToLatLng(containerPoint);
          const layerPoint = map.latLngToLayerPoint(latLng);
          if (openActivitiesNearPoint(map, containerPoint, layerPoint)) {
            event.preventDefault();
            event.stopPropagation();
          }
        };
        el.addEventListener('click', routeTapHandler, true);
        el.addEventListener('pointerup', routeTapHandler, true);
        el.addEventListener('touchend', routeTapHandler, { capture: true, passive: false });

        const ro = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            if (mapInstanceRef.current && !destroyed) mapInstanceRef.current.invalidateSize();
          });
        });
        ro.observe(el);

        const scheduleViewportRender = () => {
          closeRouteTooltip(map);
          setRouteChoice(null);
          if (viewportRenderFrameRef.current !== null) {
            cancelAnimationFrame(viewportRenderFrameRef.current);
          }
          viewportRenderFrameRef.current = requestAnimationFrame(() => {
            viewportRenderFrameRef.current = null;
            renderViewportLayers(map, L, activitiesRef.current);
          });
        };
        map.on('zoomend moveend', scheduleViewportRender);
        map.on('click', (e: LeafletMouseEvent) => {
          if (Date.now() - lastRouteSelectionOpenAtRef.current < 250) return;
          closeRouteTooltip(map);
          if (map.getZoom() >= HEATMAP_PATTERN_ZOOM) {
            const containerPoint = e.containerPoint ?? map.latLngToContainerPoint(e.latlng);
            const layerPoint = e.layerPoint ?? map.latLngToLayerPoint(e.latlng);
            if (openActivitiesNearPoint(map, containerPoint, layerPoint)) return;
          }
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
      if (mapContainer && routeTapHandler) {
        mapContainer.removeEventListener('click', routeTapHandler, true);
        mapContainer.removeEventListener('pointerup', routeTapHandler, true);
        mapContainer.removeEventListener('touchend', routeTapHandler, true);
      }
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
      }
      if (viewportRenderFrameRef.current !== null) {
        cancelAnimationFrame(viewportRenderFrameRef.current);
        viewportRenderFrameRef.current = null;
      }
      routeLayers.clear();
      displayRoutesCacheRef.current = null;
      hoverTooltipRef.current = null;
      hoveredRouteKeyRef.current = null;
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
    (async () => {
      const L = (await import('leaflet')).default;
      renderViewportLayers(map, L, activitiesRef.current);
    })();
    // Selection can coincide with a fitBounds move, so rebuild the bounded route set after the ref updates.
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

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    (async () => {
      const L = (await import('leaflet')).default;
      renderViewportLayers(map, L, activitiesRef.current);
    })();
    // Tooltip labels depend on language; layer data is read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  function publishViewState(state: RouteMapViewState) {
    onViewStateChangeRef.current?.(state);
  }

  function getDisplayRoutes(acts: MapActivity[]) {
    if (displayRoutesCacheRef.current?.activities === acts) {
      return displayRoutesCacheRef.current.routes;
    }
    const routes = buildDisplayRouteGroups(acts);
    displayRoutesCacheRef.current = { activities: acts, routes };
    return routes;
  }

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
    const enforceMinZoom = () => {
      if (minZoom !== undefined && map.getZoom() < minZoom) {
        map.setZoom(minZoom, { animate: false });
      }
    };
    const fitAnimation = animate && minZoom === undefined;
    map.fitBounds(bounds, {
      ...getFitPadding(),
      maxZoom,
      animate: fitAnimation,
    });
    if (!fitAnimation) {
      enforceMinZoom();
    }
  }

  function updateClusterVisibility(map: LeafletMap) {
    try {
      const zoom = map.getZoom();
      if (clusterLayerRef.current) {
      if (zoom >= HEATMAP_PATTERN_ZOOM) {
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
      renderViewportLayers(map, L, currentActs);
      renderSegments(map, L);
    } catch (e) {
      console.error('renderAll failed:', e);
    }
  }

  function clearRouteLayers(map: LeafletMap) {
    closeRouteTooltip(map);
    if (routeLayerGroupRef.current) {
      try { map.removeLayer(routeLayerGroupRef.current); } catch {}
      routeLayerGroupRef.current = null;
    }
    routeLayersRef.current.clear();
    if (selectedRouteLayerRef.current) {
      try { map.removeLayer(selectedRouteLayerRef.current); } catch {}
      selectedRouteLayerRef.current = null;
    }
  }

  function clearClusterLayers(map: LeafletMap) {
    if (clusterLayerRef.current) {
      try { map.removeLayer(clusterLayerRef.current); } catch {}
      clusterLayerRef.current = null;
    }
  }

  function renderViewportLayers(map: LeafletMap, L: LeafletModule, acts: MapActivity[]) {
    const zoom = map.getZoom();
    if (getHeatmapDisplayPolicy(zoom).mode === 'overview') {
      clearRouteLayers(map);
      setRouteChoice(null);
      const clusterCount = renderClusters(map, L, acts);
      publishViewState({
        mode: 'overview',
        zoom,
        clusterCount,
        renderedRoutes: 0,
        availableRoutes: 0,
        hiddenRoutes: 0,
      });
      return;
    }

    clearClusterLayers(map);
    renderPolylines(map, L, acts);
  }

  function renderClusters(map: LeafletMap, L: LeafletModule, acts: MapActivity[]) {
    clearClusterLayers(map);
    const clusters = buildClusters(acts, map, L);
    if (clusters.length === 0) return 0;
    const group = L.layerGroup().addTo(map);
    clusterLayerRef.current = group;

    clusters.forEach(c => {
      const isMinor = c.count <= 2;
      const size = isMinor
        ? 18
        : Math.max(30, Math.min(50, 24 + Math.log2(c.count + 1) * 3.8));
      const half = size / 2;

      const zoomToCluster = (e: LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        clusterClickLock.current = true;
        const targetZoom = Math.min(16, Math.max(map.getZoom() + 2, HEATMAP_PATTERN_ZOOM));
        const anchorBounds = computeClusterAnchorBounds(c, L);
        const center = anchorBounds?.isValid()
          ? anchorBounds.getCenter()
          : L.latLng(c.lat, c.lng);

        if (Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
          const span = anchorBounds ? getBoundsSpanMeters(anchorBounds) : 0;
          if (anchorBounds && span > 1200 && span < 60000) {
            try {
              fitBoundsToView(map, anchorBounds, { maxZoom: targetZoom, minZoom: HEATMAP_PATTERN_ZOOM, animate: true });
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
        html: `<div class="heatmap-cluster-bubble${isMinor ? ' heatmap-cluster-bubble-minor' : ''}" style="width:${size}px;height:${size}px;font-size:${Math.max(10, Math.min(15, 10 + c.count * 0.08))}px" aria-label="${c.count}">${isMinor ? '' : c.count}</div>`,
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
        fillColor: '#2563eb',
        fillOpacity: 0.01,
        stroke: false,
        interactive: true,
      }).addTo(group);
      hitLayer.on('click', zoomToCluster);
    });

    updateClusterVisibility(map);
    return clusters.length;
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
        color: '#b7791f',
        weight: 2.8,
        opacity: 0.72,
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
          font-size:9px;font-weight:bold;color:#8a5a12;
          background:rgba(255,255,255,0.88);padding:2px 5px;
          border-radius:999px;white-space:nowrap;pointer-events:none;
          box-shadow:0 1px 6px rgba(54,45,34,0.12);
        ">${escapeHtml(seg.name)}</div>`,
        iconSize: [120, 14],
        iconAnchor: [60, 7],
      });
      L.marker(L.latLng(mid[0], mid[1]), { icon: label, interactive: false, zIndexOffset: 100 }).addTo(group);
    });
  }

  function openActivitiesNearPoint(
    map: LeafletMap,
    containerPoint: { x: number; y: number },
    layerPoint: { x: number; y: number },
    preferredActivities: MapActivity[] = []
  ) {
    if (clusterClickLock.current) return false;
    const nearbyActivities = uniqueActivities([
      ...preferredActivities,
      ...getNearbyActivitiesAtPoint(map, layerPoint, activitiesRef.current),
    ]);
    if (nearbyActivities.length === 0) return false;

    lastRouteSelectionOpenAtRef.current = Date.now();
    closeRouteTooltip(map);
    if (nearbyActivities.length > 1) {
      setRouteChoice({
        x: containerPoint.x,
        y: containerPoint.y,
        activities: nearbyActivities,
      });
      onSelect(null);
      onShowPopup(null);
      return true;
    }

    const activity = nearbyActivities[0];
    setRouteChoice(null);
    onSelect(activity.id);
    onShowPopup(activity);
    return true;
  }

  function getNearbyActivitiesAtPoint(map: LeafletMap, point: { x: number; y: number }, acts: MapActivity[]) {
    const zoom = map.getZoom();
    const thresholdPx = isCompactViewportRef.current
      ? (zoom >= HEATMAP_DETAIL_ZOOM ? 30 : 36)
      : (zoom >= HEATMAP_PATTERN_ZOOM ? 18 : 24);

    return acts
      .map((activity) => {
        const geometry = getRouteGeometry(activity);
        if (!geometry) return null;
        const points = geometry.points;
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
    closeRouteTooltip(map);
    if (routeLayerGroupRef.current) {
      try { map.removeLayer(routeLayerGroupRef.current); } catch {}
      routeLayerGroupRef.current = null;
    }
    routeLayersRef.current.clear();

    const zoom = map.getZoom();
    const policy = getHeatmapDisplayPolicy(zoom);
    const mode = policy.mode;
    const allRoutes = getDisplayRoutes(acts);
    const paddedBounds = map.getBounds().pad(0.18);
    const routesInView = allRoutes.filter((route) => routeIntersectsView(route, paddedBounds));
    const repeatedRoutes = routesInView.filter((route) => route.count > 1);
    const availableRoutes = policy.repeatedOnly && repeatedRoutes.length > 0
      ? repeatedRoutes
      : routesInView;
    const routeLimit = policy.routeLimit;
    const currentSelected = selectedRef.current;
    const selectedRoute = currentSelected === null
      ? undefined
      : allRoutes.find((route) => route.activityIds.has(currentSelected));
    const routes = availableRoutes.slice(0, routeLimit);
    if (selectedRoute && !routes.some((route) => route.key === selectedRoute.key)) {
      routes.pop();
      routes.unshift(selectedRoute);
    }

    publishViewState({
      mode,
      zoom,
      clusterCount: 0,
      renderedRoutes: routes.length,
      availableRoutes: availableRoutes.length,
      hiddenRoutes: Math.max(0, availableRoutes.length - routes.length),
    });

    if (routes.length === 0) {
      renderSelectedRoute(map, L);
      return;
    }

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
          weight: weight + (zoom >= HEATMAP_DETAIL_ZOOM ? 2.6 : 2.2),
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

        const restoreRouteStyle = () => {
          const latestSelected = selectedRef.current;
          const latestContainsSelected = latestSelected !== null && route.activityIds.has(latestSelected);
          const latestDimmed = latestSelected !== null && !latestContainsSelected;
          const latestWeight = getRouteDisplayWeight(route.count, map.getZoom());
          halo.setStyle({
            weight: latestWeight + (map.getZoom() >= HEATMAP_DETAIL_ZOOM ? 2.6 : 2.2),
            opacity: getRouteHaloOpacity(latestDimmed, map.getZoom()),
          });
          line.setStyle({
            color: route.color,
            weight: latestWeight,
            opacity: latestDimmed ? ROUTE_DIMMED_OPACITY : getRouteDisplayOpacity(route.count, map.getZoom()),
          });
        };

        const openRouteSelection = (
          containerPoint: { x: number; y: number },
          layerPoint: { x: number; y: number }
        ) => {
          openActivitiesNearPoint(map, containerPoint, layerPoint, route.activities);
        };

        const openRouteSelectionFromEvent = (event: unknown, source: 'click' | 'touch') => {
          const e = event as LeafletMouseEvent;
          if (!e.latlng) return;
          const now = Date.now();
          if (source === 'click' && now - lastRouteTouchOpenAtRef.current < 650) return;
          if (source === 'touch' && now - lastRouteTouchOpenAtRef.current < 120) return;
          if (source === 'touch') lastRouteTouchOpenAtRef.current = now;
          if (e.originalEvent) {
            L.DomEvent.stop(e.originalEvent);
          }
          const containerPoint = e.containerPoint ?? map.latLngToContainerPoint(e.latlng);
          const layerPoint = e.layerPoint ?? map.latLngToLayerPoint(e.latlng);
          openRouteSelection(containerPoint, layerPoint);
        };

        const openRouteSelectionFromDomEvent = (event: Event) => {
          const pointerEvent = event as PointerEvent;
          if ('pointerType' in pointerEvent && pointerEvent.pointerType === 'mouse') return;
          const now = Date.now();
          if (now - lastRouteTouchOpenAtRef.current < 120) return;
          event.preventDefault();
          event.stopPropagation();
          lastRouteTouchOpenAtRef.current = now;
          const touchEvent = event as TouchEvent;
          const touch = 'changedTouches' in touchEvent ? touchEvent.changedTouches[0] : null;
          const clientX = touch?.clientX ?? pointerEvent.clientX ?? 0;
          const clientY = touch?.clientY ?? pointerEvent.clientY ?? 0;
          const rect = map.getContainer().getBoundingClientRect();
          const containerPoint = L.point(clientX - rect.left, clientY - rect.top);
          const latLng = map.containerPointToLatLng(containerPoint);
          const layerPoint = map.latLngToLayerPoint(latLng);
          openRouteSelection(containerPoint, layerPoint);
        };

        hit.on('mouseover', (e: LeafletMouseEvent) => {
          if (isCompactViewportRef.current) return;
          closeRouteTooltip(map);
          const tooltip = L.tooltip({
            direction: 'top',
            opacity: 0.92,
            className: 'route-line-tooltip',
            offset: L.point(0, -8),
          })
            .setLatLng(e.latlng)
            .setContent(getRouteGroupLabel(route, t('heatmap.runsShort')))
            .addTo(map);
          hoverTooltipRef.current = tooltip;
          hoveredRouteKeyRef.current = route.key;
          halo.setStyle({
            weight: weight + 5.6,
            opacity: 0.94,
          });
          line.setStyle({
            color: '#1d4ed8',
            weight: weight + 1.6,
            opacity: 0.98,
          });
          halo.bringToFront();
          line.bringToFront();
          hit.bringToFront();
        });
        hit.on('mousemove', (e: LeafletMouseEvent) => {
          if (isCompactViewportRef.current) return;
          if (hoveredRouteKeyRef.current === route.key) {
            hoverTooltipRef.current?.setLatLng(e.latlng);
          }
        });
        hit.on('mouseout', () => {
          restoreRouteStyle();
          if (hoveredRouteKeyRef.current === route.key) {
            closeRouteTooltip(map);
          }
        });

        hit.on('click', (e: LeafletMouseEvent) => {
          openRouteSelectionFromEvent(e, 'click');
        });
        hit.on('touchend', (e) => {
          openRouteSelectionFromEvent(e, 'touch');
        });

        const hitElement = hit.getElement();
        hitElement?.addEventListener('click', openRouteSelectionFromDomEvent, { passive: false });
        hitElement?.addEventListener('pointerup', openRouteSelectionFromDomEvent, { passive: false });
        hitElement?.addEventListener('touchend', openRouteSelectionFromDomEvent, { passive: false });

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

    if (map.getZoom() < HEATMAP_PATTERN_ZOOM) return;

    const currentSelected = selectedRef.current;
    if (currentSelected === null) return;

    const activity = activitiesRef.current.find(a => a.id === currentSelected);
    if (!activity) return;
    const geometry = getRouteGeometry(activity);
    if (!geometry) return;
    const points = geometry.points;

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
      interactive: false,
      className: 'heatmap-polyline-selected',
    }).addTo(selectedGroup);

    addRouteEndpointMarkers(L, selectedGroup, points, { size: 20 });
  }

  // Expose fitBounds for a single activity to parent
  React.useImperativeHandle(forwardedRef, () => ({
    fitActivity: (activityId: number) => {
      const map = mapInstanceRef.current;
      if (!map) return;
      const act = activitiesRef.current.find(a => a.id === activityId);
      if (!act) return;
      (async () => {
        const L = (await import('leaflet')).default;
        const geometry = getRouteGeometry(act);
        if (!geometry) return;
        const b = L.latLngBounds(geometry.points.map(p => L.latLng(p[0], p[1])));
        try {
          fitBoundsToView(map, b, { maxZoom: 16, minZoom: HEATMAP_PATTERN_ZOOM, animate: true });
        } catch (e) {
          console.warn('fitBounds failed for activity', activityId, e);
        }
      })();
    },
    fitOverview: () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      (async () => {
        const L = (await import('leaflet')).default;
        const bounds = computeSmartBounds(activitiesRef.current, L);
        if (!bounds) return;
        fitBoundsToView(map, bounds, { maxZoom: 13, animate: true });
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
  const visibleChoiceActivities = choiceActivities.slice(0, choiceLimit);

  return (
    <div className="heatmap-map relative h-full w-full" style={{ minHeight: '100%' }}>
      <div ref={containerRef} className="absolute inset-0" />
      {routeChoice && (
        <div
          role="dialog"
          aria-label={t('heatmap.overlappingRoutes')}
          className="absolute bottom-3 left-3 right-3 z-[1100] overflow-hidden rounded-lg border border-white/90 bg-white/96 shadow-[0_20px_54px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-zinc-800/90 dark:bg-zinc-950/96 md:bottom-auto md:right-auto md:w-[22rem]"
          style={isCompactViewport ? undefined : {
            left: `${routeChoice.x + 12}px`,
            top: `${routeChoice.y + 12}px`,
            transform: [
              routeChoice.x > 360 ? 'translateX(-100%)' : '',
              routeChoice.y > 500 ? 'translateY(-100%)' : '',
            ].filter(Boolean).join(' ') || undefined,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-3 py-3 dark:border-zinc-800">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-mono text-xs font-black text-zinc-900 dark:text-zinc-50">
                  {t('heatmap.overlappingRoutes')}
                </p>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  {routeChoice.activities.length}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                {t('heatmap.overlapHint', { count: routeChoice.activities.length })}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              onClick={() => setRouteChoice(null)}
              aria-label={t('heatmap.close')}
            >
              <X size={15} />
            </button>
          </div>
          <div className="max-h-[min(21rem,55dvh)] overflow-y-auto py-1">
            {visibleChoiceActivities.map((activity) => (
              <div
                key={activity.id}
                className="group flex items-center border-b border-zinc-100 transition-colors last:border-b-0 hover:bg-blue-50 dark:border-zinc-900 dark:hover:bg-blue-950/30"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5 text-left"
                  onClick={() => {
                    selectedRef.current = activity.id;
                    setRouteChoice(null);
                    onSelect(activity.id);
                    onShowPopup(activity);
                  }}
                >
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: activity.color || ROUTE_BASE_COLOR }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[11px] font-bold text-zinc-900 dark:text-zinc-50">
                      {activity.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">
                      {formatChoiceDate(activity.start_date, i18n.language)} · {formatChoiceDistance(activity.distance)}
                    </span>
                  </span>
                </button>
                <Link
                  href={`/activities/${activity.id}`}
                  className="mr-2 inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 font-mono text-[10px] font-bold text-blue-700 shadow-[0_4px_12px_rgba(37,99,235,0.10)] transition-colors hover:border-blue-200 hover:bg-white dark:border-blue-950/70 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-zinc-900"
                  aria-label={`${activity.name} ${t('heatmap.viewDetails')}`}
                  title={t('heatmap.viewDetails')}
                >
                  <span>{t('heatmap.viewDetailsShort')}</span>
                  <ArrowUpRight size={12} />
                </Link>
              </div>
            ))}
            {choiceActivities.length > visibleChoiceActivities.length && (
              <button
                type="button"
                onClick={() => setChoiceLimit((current) => current + 20)}
                className="flex w-full items-center justify-center gap-1.5 px-3 py-3 font-mono text-[10px] font-bold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
              >
                <ChevronDown size={13} />
                {t('heatmap.showMoreChoices', {
                  count: choiceActivities.length - visibleChoiceActivities.length,
                })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
