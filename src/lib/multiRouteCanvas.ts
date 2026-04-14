import { decodePolyline } from './strava';

export interface MiniRouteItem {
  polyline: string;
}

export interface MultiRouteCanvasOptions {
  items: MiniRouteItem[];
  lineColor?: string;
}

const CANVAS_WIDTH = 1080;
const PADDING = 40;
const GAP = 8;

function getColCount(count: number) {
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  if (count <= 20) return 5;
  return 6;
}

function drawRouteInCell(
  ctx: CanvasRenderingContext2D,
  item: MiniRouteItem,
  cellX: number,
  cellY: number,
  cellSize: number,
  lineColor: string
) {
  const points = decodePolyline(item.polyline);
  if (points.length < 2) return;

  // Compute bounding box
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  const latRange = maxLat - minLat || 0.0001;
  const lngRange = maxLng - minLng || 0.0001;

  const marginLat = latRange * 0.1;
  const marginLng = lngRange * 0.1;
  minLat -= marginLat;
  maxLat += marginLat;
  minLng -= marginLng;
  maxLng += marginLng;

  const expandedLatRange = maxLat - minLat;
  const expandedLngRange = maxLng - minLng;

  const available = cellSize - 24; // inner padding
  const scale = Math.min(
    available / expandedLngRange,
    available / expandedLatRange
  );

  const routeWidth = expandedLngRange * scale;
  const routeHeight = expandedLatRange * scale;
  const offsetX = cellX + (cellSize - routeWidth) / 2;
  const offsetY = cellY + (cellSize - routeHeight) / 2;

  const project = (lat: number, lng: number) => ({
    x: offsetX + (lng - minLng) * scale,
    y: offsetY + routeHeight - ((lat - minLat) / expandedLatRange) * routeHeight,
  });

  const projected = points.map(([lat, lng]) => project(lat, lng));

  // Draw route line
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, scale * 0.0001);
  ctx.strokeStyle = lineColor;
  ctx.beginPath();
  ctx.moveTo(projected[0].x, projected[0].y);
  for (let i = 1; i < projected.length; i++) {
    ctx.lineTo(projected[i].x, projected[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawMultiRouteToCanvas(
  options: MultiRouteCanvasOptions
): string | null {
  const { items, lineColor = '#f97316' } = options;
  if (items.length === 0) return null;

  const cols = getColCount(items.length);
  const rows = Math.ceil(items.length / cols);
  const cellSize = (CANVAS_WIDTH - PADDING * 2 - GAP * (cols - 1)) / cols;
  const canvasHeight = PADDING * 2 + rows * cellSize + (rows - 1) * GAP;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = Math.max(canvasHeight, CANVAS_WIDTH); // at least square
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Transparent background - do not fill anything

  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = PADDING + col * (cellSize + GAP);
    const y = PADDING + row * (cellSize + GAP);
    drawRouteInCell(ctx, item, x, y, cellSize, lineColor);
  });

  return canvas.toDataURL('image/png');
}

export function downloadPNG(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
