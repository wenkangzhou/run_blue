import { decodePolyline } from './strava';

export interface MiniRouteItem {
  polyline: string;
}

export interface MultiRouteCanvasOptions {
  items: MiniRouteItem[];
  lineColor?: string;
}

function getCanvasConfig(count: number) {
  if (count <= 9) {
    return { width: 1080, cols: 3, gap: 8, padding: 36 };
  }
  if (count <= 16) {
    return { width: 1200, cols: 4, gap: 6, padding: 32 };
  }
  if (count <= 25) {
    return { width: 1350, cols: 5, gap: 5, padding: 28 };
  }
  if (count <= 42) {
    return { width: 1600, cols: 7, gap: 4, padding: 24 };
  }
  if (count <= 70) {
    return { width: 1800, cols: 8, gap: 4, padding: 20 };
  }
  return { width: 2000, cols: 10, gap: 3, padding: 20 };
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

  const available = cellSize - 12; // inner padding, tighter for larger canvases
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
  ctx.lineWidth = Math.max(3, cellSize * 0.022);
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
  // Filter out items with empty or un-decodable polylines
  const validItems = items.filter((item) => {
    if (!item.polyline || item.polyline.trim().length === 0) return false;
    const points = decodePolyline(item.polyline);
    return points.length >= 2;
  });
  if (validItems.length === 0) return null;

  const config = getCanvasConfig(validItems.length);
  const cols = config.cols;
  const rows = Math.ceil(items.length / cols);
  const cellSize = (config.width - config.padding * 2 - config.gap * (cols - 1)) / cols;
  const canvasHeight = config.padding * 2 + rows * cellSize + (rows - 1) * config.gap;

  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = Math.max(canvasHeight, config.width * 0.6); // at least 0.6x width for compact layouts
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Transparent background - do not fill anything

  validItems.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = config.padding + col * (cellSize + config.gap);
    const y = config.padding + row * (cellSize + config.gap);
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
