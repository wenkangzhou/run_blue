import type { WrappedData } from './wrapped';

export interface WrappedCanvasData extends WrappedData {}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return "--'--\"";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

function monthLabel(m: number): string {
  return `${m}月`;
}

function timeOfDayLabel(key: string): string {
  const map: Record<string, string> = {
    morning: '晨跑',
    afternoon: '午跑',
    evening: '夜跑',
    night: '深夜跑',
  };
  return map[key] || key;
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  for (let i = text.length - 1; i > 0; i--) {
    const sub = text.slice(0, i) + '…';
    if (ctx.measureText(sub).width <= maxWidth) return sub;
  }
  return '…';
}

// Pixel-style shadow rect: draw a hard offset shadow then the main rect with border
function pixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    fill?: string;
    stroke?: string;
    shadow?: string;
    lineWidth?: number;
    shadowOffset?: number;
  } = {}
) {
  const offset = opts.shadowOffset ?? 6;
  if (opts.shadow) {
    ctx.fillStyle = opts.shadow;
    ctx.fillRect(x + offset, y + offset, w, h);
  }
  if (opts.fill) {
    ctx.fillStyle = opts.fill;
    ctx.fillRect(x, y, w, h);
  }
  if (opts.stroke) {
    ctx.strokeStyle = opts.stroke;
    ctx.lineWidth = opts.lineWidth ?? 4;
    ctx.strokeRect(x, y, w, h);
  }
}

// Draw a tiny 8-bit star icon
function drawPixelStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.fillStyle = color;
  const u = size / 5;
  const rects: Array<[number, number, number, number]> = [
    [2, 0, 1, 1],
    [1, 1, 3, 1],
    [0, 2, 5, 1],
    [1, 3, 3, 1],
    [2, 4, 1, 1],
  ];
  for (const [rx, ry, rw, rh] of rects) {
    ctx.fillRect(cx + rx * u - (5 * u) / 2, cy + ry * u - (5 * u) / 2, rw * u, rh * u);
  }
}

// Draw a tiny pixel badge/ribbon shape (a rectangle with a small hanging tail)
function drawPixelBadge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, border: string) {
  pixelRect(ctx, x, y, w, h, { fill: color, stroke: border, shadow: 'rgba(0,0,0,0.15)', shadowOffset: 4 });
  const tailW = 16;
  const tailH = 10;
  ctx.fillStyle = color;
  ctx.fillRect(x + (w - tailW) / 2, y + h, tailW, tailH);
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + (w - tailW) / 2, y + h);
  ctx.lineTo(x + (w - tailW) / 2, y + h + tailH);
  ctx.lineTo(x + w / 2, y + h + tailH - 4);
  ctx.lineTo(x + (w + tailW) / 2, y + h + tailH);
  ctx.lineTo(x + (w + tailW) / 2, y + h);
  ctx.stroke();
}

export function drawWrappedToCanvas(
  data: WrappedCanvasData,
  locale: string = 'zh'
): string | null {
  const isEn = locale.startsWith('en');
  const width = 1080;
  const bgColor = '#f4f4f5';
  const textColor = '#18181b';
  const subColor = '#52525b';
  const accentColor = '#2563eb';
  const cardBg = '#ffffff';
  const cardBorder = '#18181b';
  const personaBg = '#dbeafe';
  const personaBorder = '#1d4ed8';
  const tagBg = '#f3f4f6';
  const tagBorder = '#71717a';
  const shadowColor = '#71717a';

  const paddingX = 56;
  const fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = 2400;
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, 2400);

  let currentY = 24;

  // Header
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 56px ${fontStack}`;
  const periodText = data.quarter ? `${data.year} Q${data.quarter}` : `${data.year}`;
  ctx.fillText(periodText, width / 2, currentY + 36);

  ctx.font = `400 20px ${fontStack}`;
  ctx.fillStyle = subColor;
  ctx.fillText(isEn ? 'Running Wrapped' : '年度跑步回顾', width / 2, currentY + 74);

  currentY += 110;

  // Persona card (pixel style)
  const personaHeight = 136;
  pixelRect(ctx, paddingX, currentY, width - paddingX * 2, personaHeight, {
    fill: personaBg,
    stroke: personaBorder,
    shadow: shadowColor,
    shadowOffset: 6,
    lineWidth: 4,
  });

  ctx.fillStyle = accentColor;
  ctx.font = `bold 44px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.persona.title, width / 2, currentY + personaHeight / 2 - 10);

  ctx.fillStyle = '#1e3a8a';
  ctx.font = `400 20px ${fontStack}`;
  ctx.fillText(data.persona.desc, width / 2, currentY + personaHeight / 2 + 26);

  // Time of day sticker on top-right of persona card
  const todEntries = Object.entries(data.timeOfDay).sort((a, b) => b[1] - a[1]);
  const topTod = todEntries[0];
  if (topTod && topTod[1] > 0) {
    const todText = isEn
      ? `${timeOfDayLabel(topTod[0])}`
      : `${timeOfDayLabel(topTod[0])}达人`;
    ctx.font = `bold 16px ${fontStack}`;
    const textW = ctx.measureText(todText).width;
    const stW = textW + 20;
    const stH = 32;
    const stX = width - paddingX - stW - 10;
    const stY = currentY + 10;
    pixelRect(ctx, stX, stY, stW, stH, {
      fill: '#ffffff',
      stroke: personaBorder,
      shadow: shadowColor,
      shadowOffset: 3,
      lineWidth: 3,
    });
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(todText, stX + stW / 2, stY + stH / 2);
  }

  currentY += personaHeight + 24;

  // Fun facts banner between persona and hero
  const factText = data.funFacts.slice(0, 2).join('  ·  ');
  if (factText) {
    const bannerPaddingX = 20;
    ctx.font = `400 18px ${fontStack}`;
    const textW = ctx.measureText(factText).width;
    const bannerW = textW + bannerPaddingX * 2 + 32;
    const bannerH = 44;
    const bannerX = (width - bannerW) / 2;

    pixelRect(ctx, bannerX, currentY, bannerW, bannerH, {
      fill: '#fef3c7',
      stroke: '#d97706',
      shadow: '#d97706',
      shadowOffset: 4,
      lineWidth: 3,
    });

    drawPixelStar(ctx, bannerX + 22, currentY + bannerH / 2, 18, '#d97706');

    ctx.fillStyle = textColor;
    ctx.font = `400 18px ${fontStack}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(factText, bannerX + 40, currentY + bannerH / 2);
    currentY += bannerH + 24;
  }

  // Hero stats: 3 cards (pixel style)
  const heroCardHeight = 140;
  const heroItems = [
    { label: isEn ? 'Distance' : '总跑量', value: `${data.totalDistanceKm}`, unit: 'km', sub: `${data.totalRuns} ${isEn ? 'runs' : '次'}` },
    { label: isEn ? 'Time' : '总时长', value: formatDuration(data.totalDurationSec), unit: '', sub: '' },
    { label: isEn ? 'Longest' : '最长单次', value: `${data.longestRunKm}`, unit: 'km', sub: data.longestRunDate },
  ];
  const heroGap = 16;
  const heroCardWidth = (width - paddingX * 2 - heroGap * 2) / 3;

  heroItems.forEach((item, i) => {
    const x = paddingX + i * (heroCardWidth + heroGap);
    const y = currentY;

    pixelRect(ctx, x, y, heroCardWidth, heroCardHeight, {
      fill: cardBg,
      stroke: cardBorder,
      shadow: shadowColor,
      shadowOffset: 6,
      lineWidth: 4,
    });

    ctx.fillStyle = subColor;
    ctx.font = `400 18px ${fontStack}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(item.label, x + 20, y + 16);

    const valueY = y + heroCardHeight / 2 + 6;
    ctx.fillStyle = textColor;
    ctx.font = `bold 40px ${fontStack}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(item.value, x + 20, valueY);

    if (item.unit) {
      const valueWidth = ctx.measureText(item.value).width;
      ctx.fillStyle = subColor;
      ctx.font = `400 22px ${fontStack}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(item.unit, x + 20 + valueWidth + 6, valueY);
    }

    if (item.sub) {
      ctx.fillStyle = subColor;
      ctx.font = `400 14px ${fontStack}`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(item.sub, x + 20, y + heroCardHeight - 14);
    }
  });

  // Longest run sticker on bottom-right of the "Longest" hero card (i=2)
  if (data.longestRouteName) {
    const longestCardX = paddingX + 2 * (heroCardWidth + heroGap);
    const longestCardY = currentY;
    const routeLabel = isEn ? 'Longest' : '最长跑';
    const fullText = data.longestRouteName;
    ctx.font = `400 14px ${fontStack}`;
    const textW = ctx.measureText(fullText).width;
    const stickerW = Math.max(textW + 20, 80);
    const stickerH = 28;
    const stickerX = longestCardX + heroCardWidth - stickerW - 8;
    const stickerY = longestCardY + heroCardHeight - stickerH - 6;
    pixelRect(ctx, stickerX, stickerY, stickerW, stickerH, {
      fill: '#e0e7ff',
      stroke: '#4338ca',
      shadow: '#4338ca',
      shadowOffset: 3,
      lineWidth: 3,
    });
    ctx.fillStyle = '#312e81';
    ctx.font = `400 14px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fullText, stickerX + stickerW / 2, stickerY + stickerH / 2);
  }

  currentY += heroCardHeight + 32;

  // Loose tags grid (no outer white card)
  const tagGap = 16;
  const tagW = (width - paddingX * 2 - tagGap) / 2;
  const tagH = 76;
  const tags = [
    { label: isEn ? 'Avg Pace' : '平均配速', value: formatPace(data.avgPaceSecPerKm) },
    { label: isEn ? 'Best Pace' : '最快配速', value: formatPace(data.bestPaceSecPerKm) },
    { label: isEn ? 'Streak' : '连续打卡', value: `${data.longestStreakDays}${isEn ? 'd' : '天'}` },
  ];
  if (data.favoriteRoute) {
    const pct = data.totalRuns > 0 ? Math.round((data.favoriteRoute.count / data.totalRuns) * 100) : 0;
    tags.push({ label: isEn ? 'Home Route' : '老地方', value: `${data.favoriteRoute.count}${isEn ? 'x' : '次'} (${pct}%)` });
  }

  const tagRows = Math.ceil(tags.length / 2);

  tags.forEach((tag, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = paddingX + col * (tagW + tagGap);
    const y = currentY + row * (tagH + tagGap);

    pixelRect(ctx, x, y, tagW, tagH, {
      fill: tagBg,
      stroke: tagBorder,
      shadow: '#a1a1aa',
      shadowOffset: 4,
      lineWidth: 3,
    });

    ctx.fillStyle = subColor;
    ctx.font = `400 15px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag.label, x + tagW / 2, y + 24);

    ctx.fillStyle = textColor;
    ctx.font = `bold 26px ${fontStack}`;
    ctx.fillText(tag.value, x + tagW / 2, y + 52);
  });

  currentY += tagRows * (tagH + tagGap) + 28;

  // Monthly bar chart (pixel bars)
  const chartHeight = 220;
  const chartTop = currentY;
  const barAreaWidth = width - paddingX * 2;
  const barMaxHeight = chartHeight - 48;
  const maxMonthDist = Math.max(...data.monthlyDistances.map((d) => d.distanceKm), 1);
  const barWidth = (barAreaWidth - (data.monthlyDistances.length - 1) * 10) / data.monthlyDistances.length;

  data.monthlyDistances.forEach((d, i) => {
    const barH = (d.distanceKm / maxMonthDist) * barMaxHeight;
    const x = paddingX + i * (barWidth + 10);
    const y = chartTop + barMaxHeight - barH;

    const isBest = d.distanceKm === maxMonthDist;
    pixelRect(ctx, x, y, barWidth, barH, {
      fill: isBest ? accentColor : '#d4d4d8',
      stroke: '#18181b',
      shadow: isBest ? '#1d4ed8' : '#71717a',
      shadowOffset: 4,
      lineWidth: 3,
    });

    ctx.fillStyle = subColor;
    ctx.font = `400 16px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(monthLabel(d.month), x + barWidth / 2, chartTop + barMaxHeight + 8);
  });

  currentY = chartTop + chartHeight + 20;

  // Footer slogan
  currentY += 10;
  ctx.fillStyle = textColor;
  ctx.font = `bold 28px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const slogan = isEn ? 'Still Running.' : `${data.year}，我还在跑`;
  ctx.fillText(slogan, width / 2, currentY + 16);
  currentY += 46;

  // Crop to actual content
  const actualHeight = currentY;
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = actualHeight;
  const finalCtx = finalCanvas.getContext('2d');
  if (!finalCtx) return null;
  finalCtx.drawImage(tempCanvas, 0, 0, width, actualHeight, 0, 0, width, actualHeight);

  return finalCanvas.toDataURL('image/png');
}
