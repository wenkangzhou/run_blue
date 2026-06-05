type LeafletModule = typeof import('leaflet');
type LatLngPoint = [number, number];

interface RouteEndpointOptions {
  color: string;
  label: string;
  size?: number;
}

interface VisualRouteKeyOptions {
  distanceMeters: number;
  reverseAware?: boolean;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(a: LatLngPoint, b: LatLngPoint) {
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function roundedCoord(value: number, precision = 1000) {
  return Math.round(value * precision) / precision;
}

function pointKey(point: LatLngPoint, precision = 1000) {
  return `${roundedCoord(point[0], precision)},${roundedCoord(point[1], precision)}`;
}

function getRouteCenter(points: LatLngPoint[]): LatLngPoint {
  const sum = points.reduce(
    (acc, point) => {
      acc[0] += point[0];
      acc[1] += point[1];
      return acc;
    },
    [0, 0] as LatLngPoint
  );
  return [sum[0] / points.length, sum[1] / points.length];
}

export function getValidRoutePoints(points: LatLngPoint[]) {
  return points.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

export function getVisualRouteKey(points: LatLngPoint[], options: VisualRouteKeyOptions) {
  const validPoints = getValidRoutePoints(points);
  if (validPoints.length < 2) return '';

  const start = validPoints[0];
  const end = validPoints[validPoints.length - 1];
  const center = getRouteCenter(validPoints);
  const distanceBucket = Math.round(options.distanceMeters / 1000);
  const isLoop = haversineKm(start, end) < 0.22;
  const centerKey = pointKey(center, 500);

  if (isLoop || options.reverseAware === false) {
    return `loop:${centerKey}:${distanceBucket}`;
  }

  const forward = `${pointKey(start, 500)}>${pointKey(end, 500)}`;
  const reverse = `${pointKey(end, 500)}>${pointKey(start, 500)}`;
  const directionKey = options.reverseAware ? forward : [forward, reverse].sort().join('|');
  return `path:${centerKey}:${distanceBucket}:${directionKey}`;
}

export function createRouteEndpointIcon(
  L: LeafletModule,
  { color, label, size = 18 }: RouteEndpointOptions
) {
  return L.divIcon({
    className: 'route-endpoint-marker',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:999px;
      background:${color};border:2px solid rgba(255,255,255,0.96);
      color:#fff;display:flex;align-items:center;justify-content:center;
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
      font-size:${Math.max(8, Math.round(size * 0.48))}px;font-weight:800;
      line-height:1;box-shadow:0 2px 7px rgba(15,23,42,0.32);
    ">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function addRouteEndpointMarkers(
  L: LeafletModule,
  group: import('leaflet').LayerGroup,
  rawPoints: LatLngPoint[],
  options: { size?: number } = {}
) {
  const points = getValidRoutePoints(rawPoints);
  if (points.length < 2) return;

  const start = points[0];
  const end = points[points.length - 1];
  const endpointSize = options.size ?? 18;

  L.marker(start, {
    icon: createRouteEndpointIcon(L, { color: '#16a34a', label: 'S', size: endpointSize }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 780,
  }).addTo(group);

  if (haversineKm(start, end) < 0.05) return;

  L.marker(end, {
    icon: createRouteEndpointIcon(L, { color: '#f97316', label: 'F', size: endpointSize }),
    interactive: false,
    keyboard: false,
    zIndexOffset: 790,
  }).addTo(group);
}
