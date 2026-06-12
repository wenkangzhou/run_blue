import { decodePolyline } from './strava';

export interface MiniRouteItem {
  polyline: string;
}

export interface MultiRouteCanvasOptions {
  items: MiniRouteItem[];
  lineColor?: string;
  mode?: 'transparent' | 'poster';
  title?: string;
  subtitle?: string;
  stats?: Array<{ label: string; value: string }> | null;
}

function getCanvasConfig(count: number) {
  if (count <= 9) {
    return { width: 1080, cols: 3, gap: 8, paddingX: 28, paddingY: 6 };
  }
  if (count <= 16) {
    return { width: 1200, cols: 4, gap: 6, paddingX: 24, paddingY: 6 };
  }
  if (count <= 25) {
    return { width: 1350, cols: 5, gap: 5, paddingX: 20, paddingY: 5 };
  }
  if (count <= 42) {
    return { width: 1600, cols: 7, gap: 4, paddingX: 16, paddingY: 4 };
  }
  if (count <= 70) {
    return { width: 1800, cols: 8, gap: 4, paddingX: 16, paddingY: 4 };
  }
  return { width: 2000, cols: 10, gap: 3, paddingX: 16, paddingY: 4 };
}

function drawRouteInCell(
  ctx: CanvasRenderingContext2D,
  item: MiniRouteItem,
  cellX: number,
  cellY: number,
  cellSize: number,
  lineColor: string,
  lineWidth?: number
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
  ctx.lineWidth = lineWidth ?? Math.max(3, cellSize * 0.022);
  ctx.strokeStyle = lineColor;
  ctx.beginPath();
  ctx.moveTo(projected[0].x, projected[0].y);
  for (let i = 1; i < projected.length; i++) {
    ctx.lineTo(projected[i].x, projected[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

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
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawPosterBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = '#fff7ed';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.055)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= width; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 72) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const gradient = ctx.createRadialGradient(width * 0.78, height * 0.18, 80, width * 0.78, height * 0.18, width * 0.75);
  gradient.addColorStop(0, 'rgba(249, 115, 22, 0.22)');
  gradient.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawPosterHeader(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  width: number
) {
  ctx.save();
  ctx.fillStyle = '#9a3412';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('RUN BLUE / PERIOD LOG', 72, 78);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 74px sans-serif';
  ctx.fillText((title || '周期海报').slice(0, 18), 72, 168);

  ctx.fillStyle = '#64748b';
  ctx.font = '30px monospace';
  ctx.fillText(subtitle.slice(0, 40), 72, 222);

  ctx.fillStyle = '#f97316';
  drawRoundRect(ctx, width - 72 - 130, 52, 130, 52, 18);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ROUTES', width - 72 - 65, 78);
  ctx.restore();
}

function drawPosterStats(
  ctx: CanvasRenderingContext2D,
  stats: Array<{ label: string; value: string }>,
  width: number,
  y: number
) {
  if (stats.length === 0) return;

  const gap = 20;
  const cardWidth = (width - 144 - gap * 2) / 3;
  const cardHeight = 142;

  ctx.save();
  stats.slice(0, 3).forEach((stat, index) => {
    const x = 72 + index * (cardWidth + gap);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.shadowColor = 'rgba(154, 52, 18, 0.16)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 14;
    drawRoundRect(ctx, x, y, cardWidth, cardHeight, 26);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.18)';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, x, y, cardWidth, cardHeight, 26);
    ctx.stroke();

    ctx.fillStyle = '#9a3412';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stat.label, x + cardWidth / 2, y + 44);

    ctx.fillStyle = '#0f172a';
    ctx.font = '900 42px monospace';
    ctx.fillText(stat.value, x + cardWidth / 2, y + 98);
  });
  ctx.restore();
}

function drawRouteGrid(
  ctx: CanvasRenderingContext2D,
  items: MiniRouteItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  lineColor: string
) {
  const count = items.length;
  const cols = count <= 4 ? 2 : count <= 9 ? 3 : count <= 16 ? 4 : count <= 30 ? 5 : count <= 48 ? 6 : 7;
  const rows = Math.ceil(count / cols);
  const gap = count > 30 ? 10 : 14;
  const cellSize = Math.min(
    (width - gap * (cols - 1)) / cols,
    (height - gap * (rows - 1)) / rows
  );
  const gridWidth = cols * cellSize + (cols - 1) * gap;
  const gridHeight = rows * cellSize + (rows - 1) * gap;
  const startX = x + (width - gridWidth) / 2;
  const startY = y + (height - gridHeight) / 2;

  items.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cellX = startX + col * (cellSize + gap);
    const cellY = startY + row * (cellSize + gap);
    drawRouteInCell(ctx, item, cellX, cellY, cellSize, lineColor, Math.max(5, cellSize * 0.028));
  });
}

export function drawMultiRouteToCanvas(
  options: MultiRouteCanvasOptions
): string | null {
  const {
    items,
    lineColor = '#f97316',
    mode = 'transparent',
    title = '周期海报',
    subtitle = '',
    stats = null,
  } = options;
  // Filter out items with empty or un-decodable polylines
  const validItems = items.filter((item) => {
    if (!item.polyline || item.polyline.trim().length === 0) return false;
    const points = decodePolyline(item.polyline);
    return points.length >= 2;
  });
  if (validItems.length === 0) return null;

  if (mode === 'poster') {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    drawPosterBackground(ctx, canvas.width, canvas.height);
    drawPosterHeader(ctx, title, subtitle, canvas.width);

    const panelX = 70;
    const panelY = 290;
    const panelWidth = canvas.width - 140;
    const panelHeight = 760;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
    ctx.shadowColor = 'rgba(154, 52, 18, 0.12)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 18;
    drawRoundRect(ctx, panelX, panelY, panelWidth, panelHeight, 34);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.18)';
    ctx.lineWidth = 3;
    drawRoundRect(ctx, panelX, panelY, panelWidth, panelHeight, 34);
    ctx.stroke();
    ctx.restore();

    drawRouteGrid(ctx, validItems, panelX + 34, panelY + 34, panelWidth - 68, panelHeight - 68, lineColor);
    drawPosterStats(ctx, stats ?? [], canvas.width, 1090);

    ctx.save();
    ctx.fillStyle = '#9a3412';
    ctx.font = '22px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${validItems.length} ROUTES · runblue.app`, canvas.width / 2, canvas.height - 34);
    ctx.restore();

    return canvas.toDataURL('image/png');
  }

  const config = getCanvasConfig(validItems.length);
  const cols = config.cols;
  const rows = Math.ceil(validItems.length / cols);
  const cellSize = (config.width - config.paddingX * 2 - config.gap * (cols - 1)) / cols;
  const canvasHeight = config.paddingY * 2 + rows * cellSize + (rows - 1) * config.gap;

  const canvas = document.createElement('canvas');
  canvas.width = config.width;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Transparent background - do not fill anything

  validItems.forEach((item, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = config.paddingX + col * (cellSize + config.gap);
    const y = config.paddingY + row * (cellSize + config.gap);
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
