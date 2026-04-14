import { decodePolyline } from './strava';

export interface RouteCanvasOptions {
  size?: number;
  padding?: number;
  lineWidth?: number;
  lineColor?: string;
  glowColor?: string;
  glowBlur?: number;
  showMarkers?: boolean;
  startColor?: string;
  endColor?: string;
  markerSize?: number;
  markerBorderWidth?: number;
  markerBorderColor?: string;
  stats?: Array<{ label: string; value: string }> | null;
}

const DEFAULT_OPTIONS: Required<Omit<RouteCanvasOptions, 'stats'>> & { stats: RouteCanvasOptions['stats'] } = {
  size: 1080,
  padding: 80,
  lineWidth: 10,
  lineColor: '#3b82f6',
  glowColor: '#60a5fa',
  glowBlur: 20,
  showMarkers: true,
  startColor: '#22c55e',
  endColor: '#ef4444',
  markerSize: 24,
  markerBorderWidth: 5,
  markerBorderColor: '#ffffff',
  stats: null,
};

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  items: Array<{ label: string; value: string }>,
  centerX: number,
  startY: number
) {
  const lineGap = 100; // vertical gap between each stat block
  const labelSize = 24;
  const valueSize = 56;

  items.forEach((item, index) => {
    const y = startY + index * lineGap;

    // Label
    ctx.save();
    ctx.font = `${labelSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillText(item.label, centerX, y);
    ctx.restore();

    // Value
    ctx.save();
    ctx.font = `bold ${valueSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.fillText(item.value, centerX, y + labelSize + 16);
    ctx.restore();
  });
}

/**
 * Draw a running route onto a canvas and return a PNG data URL with transparent background.
 */
export function drawRouteToCanvas(
  polyline: string | null,
  options: RouteCanvasOptions = {}
): string | null {
  if (!polyline || polyline.length < 10) return null;

  const points = decodePolyline(polyline);
  if (points.length < 2) return null;

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const canvas = document.createElement('canvas');
  canvas.width = opts.size;
  canvas.height = opts.size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const hasStats = Array.isArray(opts.stats) && opts.stats.length > 0;
  const statsAreaHeight = hasStats ? 380 : 0;
  const routeAreaTop = hasStats ? statsAreaHeight + 20 : opts.padding;

  // Compute bounding box
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  // Expand bounding box slightly to give padding inside the canvas padding
  const latRange = maxLat - minLat || 0.0001;
  const lngRange = maxLng - minLng || 0.0001;

  const marginLat = latRange * 0.05;
  const marginLng = lngRange * 0.05;
  minLat -= marginLat;
  maxLat += marginLat;
  minLng -= marginLng;
  maxLng += marginLng;

  const expandedLatRange = maxLat - minLat;
  const expandedLngRange = maxLng - minLng;

  // Determine scale to fit inside the route area only, preserving aspect ratio
  const availableWidth = opts.size - opts.padding * 2;
  const routeAreaHeight = opts.size - opts.padding - routeAreaTop;
  const scale = Math.min(
    availableWidth / expandedLngRange,
    Math.max(routeAreaHeight, 100) / expandedLatRange
  );

  const routeWidth = expandedLngRange * scale;
  const routeHeight = expandedLatRange * scale;
  const offsetX = (opts.size - routeWidth) / 2;
  // Center the route vertically within the route area
  const offsetY = opts.padding + (routeAreaHeight - routeHeight) / 2;

  const project = (lat: number, lng: number) => ({
    x: offsetX + (lng - minLng) * scale,
    y: opts.size - (offsetY + (lat - minLat) * scale),
  });

  const projected = points.map(([lat, lng]) => project(lat, lng));

  // Draw stats text first
  if (hasStats && opts.stats) {
    const startY = opts.padding + 40;
    drawTextBlock(ctx, opts.stats, opts.size / 2, startY);
  }

  // Draw glow
  if (opts.glowBlur > 0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = opts.lineWidth + opts.glowBlur / 2;
    ctx.strokeStyle = opts.glowColor;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i++) {
      ctx.lineTo(projected[i].x, projected[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Draw main route line
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = opts.lineWidth;
  ctx.strokeStyle = opts.lineColor;
  ctx.beginPath();
  ctx.moveTo(projected[0].x, projected[0].y);
  for (let i = 1; i < projected.length; i++) {
    ctx.lineTo(projected[i].x, projected[i].y);
  }
  ctx.stroke();
  ctx.restore();

  // Draw start/end markers
  if (opts.showMarkers) {
    const drawMarker = (point: { x: number; y: number }, color: string) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(point.x, point.y, opts.markerSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = opts.markerBorderWidth;
      ctx.strokeStyle = opts.markerBorderColor;
      ctx.stroke();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      ctx.stroke();
      ctx.restore();
    };

    drawMarker(projected[0], opts.startColor);
    drawMarker(projected[projected.length - 1], opts.endColor);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Trigger a download of the generated PNG.
 */
export function downloadPNG(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
