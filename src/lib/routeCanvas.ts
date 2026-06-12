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
  mode?: 'transparent' | 'poster';
  title?: string;
  subtitle?: string;
  brand?: string;
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
  mode: 'transparent',
  title: '',
  subtitle: '',
  brand: 'RUN BLUE',
};

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawGridBackground(ctx: CanvasRenderingContext2D, size: number) {
  ctx.save();
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.07)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= size; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  const gradient = ctx.createRadialGradient(size * 0.7, size * 0.22, 80, size * 0.7, size * 0.22, size * 0.78);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.18)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

function drawPosterHeader(
  ctx: CanvasRenderingContext2D,
  opts: Required<Omit<RouteCanvasOptions, 'stats'>> & { stats: RouteCanvasOptions['stats'] }
) {
  const title = opts.title || 'Running Route';
  const subtitle = opts.subtitle || '';

  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 32px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.brand, opts.padding, 82);

  ctx.fillStyle = '#2563eb';
  drawRoundRect(ctx, opts.size - opts.padding - 148, 54, 148, 56, 18);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ROUTE', opts.size - opts.padding - 74, 82);

  ctx.fillStyle = '#020617';
  ctx.font = '900 74px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title.slice(0, 22), opts.padding, 184);

  if (subtitle) {
    ctx.fillStyle = '#64748b';
    ctx.font = '28px monospace';
    ctx.fillText(subtitle.slice(0, 42), opts.padding, 236);
  }
  ctx.restore();
}

function drawPosterStats(
  ctx: CanvasRenderingContext2D,
  items: Array<{ label: string; value: string }>,
  opts: Required<Omit<RouteCanvasOptions, 'stats'>> & { stats: RouteCanvasOptions['stats'] }
) {
  if (items.length === 0) return;

  const y = opts.size - opts.padding - 150;
  const gap = 22;
  const cardWidth = (opts.size - opts.padding * 2 - gap * 2) / 3;
  const cardHeight = 150;

  ctx.save();
  items.slice(0, 3).forEach((item, index) => {
    const x = opts.padding + index * (cardWidth + gap);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    drawRoundRect(ctx, x, y, cardWidth, cardHeight, 26);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, x, y, cardWidth, cardHeight, 26);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, x + cardWidth / 2, y + 48);

    ctx.fillStyle = '#0f172a';
    ctx.font = '900 44px monospace';
    ctx.fillText(item.value, x + cardWidth / 2, y + 104);
  });
  ctx.restore();
}

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

  const isPoster = opts.mode === 'poster';
  const hasStats = Array.isArray(opts.stats) && opts.stats.length > 0;

  if (isPoster) {
    drawGridBackground(ctx, opts.size);
    drawPosterHeader(ctx, opts);
  }

  const routeAreaTop = isPoster
    ? 280
    : hasStats
      ? 400
      : opts.padding;
  const routeAreaBottom = isPoster
    ? opts.size - opts.padding - (hasStats ? 190 : 40)
    : opts.size - opts.padding;

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
  const routeAreaHeight = Math.max(routeAreaBottom - routeAreaTop, 100);
  const scale = Math.min(
    availableWidth / expandedLngRange,
    routeAreaHeight / expandedLatRange
  );

  const routeWidth = expandedLngRange * scale;
  const routeHeight = expandedLatRange * scale;
  const offsetX = (opts.size - routeWidth) / 2;
  // Center the route vertically within the route area
  const offsetY = routeAreaTop + (routeAreaHeight - routeHeight) / 2;

  const project = (lat: number, lng: number) => ({
    x: offsetX + (lng - minLng) * scale,
    y: offsetY + (maxLat - lat) * scale,
  });

  const projected = points.map(([lat, lng]) => project(lat, lng));

  // Draw stats text first
  if (!isPoster && hasStats && opts.stats) {
    const startY = opts.padding + 40;
    drawTextBlock(ctx, opts.stats, opts.size / 2, startY);
  }

  if (isPoster) {
    ctx.save();
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.12)';
    ctx.lineWidth = 38;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i++) {
      ctx.lineTo(projected[i].x, projected[i].y);
    }
    ctx.stroke();
    ctx.restore();
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

  if (isPoster && hasStats && opts.stats) {
    drawPosterStats(ctx, opts.stats, opts);
  }

  if (isPoster) {
    ctx.save();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('runblue.app', opts.size / 2, opts.size - 30);
    ctx.restore();
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
