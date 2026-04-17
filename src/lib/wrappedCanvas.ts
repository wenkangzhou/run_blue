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

export function drawWrappedToCanvas(
  data: WrappedCanvasData,
  locale: string = 'zh'
): string | null {
  const isEn = locale.startsWith('en');
  const width = 1080;
  const bgColor = '#fafafa';
  const textColor = '#18181b';
  const subColor = '#71717a';
  const accentColor = '#3b82f6';
  const cardBg = '#ffffff';
  const cardBorder = '#e4e4e7';
  const personaBg = '#eff6ff';
  const personaBorder = '#bfdbfe';

  const paddingX = 56;
  const cardGap = 20;
  const cardPadding = 28;
  const headerHeight = 200;
  const personaHeight = 180;
  const footerHeight = 120;
  const chartHeight = 280;
  const bigCardHeight = 150;
  const smallCardHeight = 120;
  const badgeHeight = 64;
  const extremesHeight = 110;

  const statsRows = [
    [{ key: 'distance', label: isEn ? 'Total Distance' : '总跑量', value: `${data.totalDistanceKm}`, unit: 'km', sub: `${data.totalRuns} ${isEn ? 'runs' : '次跑步'}` }],
    [
      { key: 'duration', label: isEn ? 'Total Time' : '总时长', value: formatDuration(data.totalDurationSec), unit: '', sub: '' },
      { key: 'longest', label: isEn ? 'Longest Run' : '最长单次', value: `${data.longestRunKm}`, unit: 'km', sub: data.longestRunDate },
    ],
    [
      { key: 'pace', label: isEn ? 'Avg Pace' : '平均配速', value: formatPace(data.avgPaceSecPerKm), unit: '', sub: `${isEn ? 'Best' : '最快'} ${formatPace(data.bestPaceSecPerKm)}` },
      { key: 'elevation', label: isEn ? 'Elevation' : '总爬升', value: `${data.totalElevationGainM}`, unit: 'm', sub: '' },
    ],
    [
      { key: 'streak', label: isEn ? 'Longest Streak' : '最长连续', value: `${data.longestStreakDays}`, unit: isEn ? 'days' : '天', sub: '' },
      { key: 'favoriteMonth', label: isEn ? 'Top Month' : '最爱月份', value: monthLabel(data.favoriteMonth.month), unit: '', sub: `${Math.round(data.favoriteMonth.distanceKm)}km` },
    ],
  ];

  const contentHeight = statsRows.reduce((sum, row) => {
    const h = row.length === 1 ? bigCardHeight : smallCardHeight;
    return sum + h + cardGap;
  }, 0);

  const height =
    headerHeight +
    personaHeight +
    contentHeight +
    badgeHeight +
    40 + // fun facts padding
    40 + // time of day
    chartHeight +
    extremesHeight +
    footerHeight +
    paddingX * 2 +
    cardGap * 4;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const fontStack = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  // Header
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 72px ${fontStack}`;
  const periodText = data.quarter ? `${data.year} Q${data.quarter}` : `${data.year}`;
  ctx.fillText(periodText, width / 2, headerHeight / 2 - 16);

  ctx.font = `400 28px ${fontStack}`;
  ctx.fillStyle = subColor;
  ctx.fillText(isEn ? 'Running Wrapped' : '年度跑步回顾', width / 2, headerHeight / 2 + 40);

  let currentY = headerHeight + paddingX / 2;

  // Persona card
  ctx.fillStyle = personaBg;
  ctx.fillRect(paddingX, currentY, width - paddingX * 2, personaHeight);
  ctx.strokeStyle = personaBorder;
  ctx.lineWidth = 4;
  ctx.strokeRect(paddingX, currentY, width - paddingX * 2, personaHeight);

  ctx.fillStyle = accentColor;
  ctx.font = `bold 56px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.persona.title, width / 2, currentY + personaHeight / 2 - 16);

  ctx.fillStyle = '#1d4ed8';
  ctx.font = `400 24px ${fontStack}`;
  ctx.fillText(data.persona.desc, width / 2, currentY + personaHeight / 2 + 36);

  currentY += personaHeight + cardGap;

  // Stats cards
  statsRows.forEach((row) => {
    const cardHeight = row.length === 1 ? bigCardHeight : smallCardHeight;
    const cardWidth = (width - paddingX * 2 - cardGap * (row.length - 1)) / row.length;

    row.forEach((card, idx) => {
      const x = paddingX + idx * (cardWidth + cardGap);
      const y = currentY;

      ctx.fillStyle = cardBg;
      ctx.fillRect(x, y, cardWidth, cardHeight);
      ctx.strokeStyle = cardBorder;
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      // Label
      ctx.fillStyle = subColor;
      ctx.font = `400 22px ${fontStack}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(card.label, x + cardPadding, y + cardPadding);

      // Value + Unit
      ctx.fillStyle = textColor;
      const valueFontSize = cardHeight === bigCardHeight ? 64 : 44;
      ctx.font = `bold ${valueFontSize}px ${fontStack}`;
      ctx.textBaseline = 'alphabetic';
      const valueY = y + cardHeight - cardPadding - (card.sub ? 32 : 8);
      ctx.fillText(card.value, x + cardPadding, valueY);

      if (card.unit) {
        const valueWidth = ctx.measureText(card.value).width;
        ctx.fillStyle = subColor;
        const unitFontSize = cardHeight === bigCardHeight ? 28 : 22;
        ctx.font = `400 ${unitFontSize}px ${fontStack}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(card.unit, x + cardPadding + valueWidth + 8, valueY);
      }

      // Sub
      if (card.sub) {
        ctx.fillStyle = subColor;
        ctx.font = `400 18px ${fontStack}`;
        ctx.textBaseline = 'bottom';
        ctx.fillText(card.sub, x + cardPadding, y + cardHeight - cardPadding);
      }
    });

    currentY += cardHeight + cardGap;
  });

  // Fun facts badges
  currentY += 10;
  const badgeGap = 16;
  const badgeCount = data.funFacts.length || 1;
  const badgeTotalWidth = width - paddingX * 2;
  const singleBadgeWidth = (badgeTotalWidth - (badgeCount - 1) * badgeGap) / badgeCount;

  data.funFacts.forEach((fact, i) => {
    const x = paddingX + i * (singleBadgeWidth + badgeGap);
    const y = currentY;

    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(x, y, singleBadgeWidth, badgeHeight);
    ctx.strokeStyle = cardBorder;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, singleBadgeWidth, badgeHeight);

    ctx.fillStyle = textColor;
    ctx.font = `400 20px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fact, x + singleBadgeWidth / 2, y + badgeHeight / 2);
  });

  currentY += badgeHeight + 24;

  // Time of day
  const todEntries = Object.entries(data.timeOfDay).sort((a, b) => b[1] - a[1]);
  const topTod = todEntries[0];
  if (topTod && topTod[1] > 0) {
    ctx.fillStyle = accentColor;
    ctx.font = `bold 24px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const todText = isEn
      ? `You mostly run in the ${timeOfDayLabel(topTod[0])}`
      : `你最常在 ${timeOfDayLabel(topTod[0])}`;
    ctx.fillText(todText, width / 2, currentY);
    currentY += 50;
  }

  // Monthly bar chart
  const chartTop = currentY;
  const barAreaWidth = width - paddingX * 2;
  const barMaxHeight = chartHeight - 70;
  const maxMonthDist = Math.max(...data.monthlyDistances.map((d) => d.distanceKm), 1);
  const barWidth = (barAreaWidth - (data.monthlyDistances.length - 1) * 14) / data.monthlyDistances.length;

  data.monthlyDistances.forEach((d, i) => {
    const barH = (d.distanceKm / maxMonthDist) * barMaxHeight;
    const x = paddingX + i * (barWidth + 14);
    const y = chartTop + barMaxHeight - barH;

    ctx.fillStyle = d.distanceKm === maxMonthDist ? accentColor : '#d4d4d8';
    ctx.fillRect(x, y, barWidth, barH);

    ctx.fillStyle = subColor;
    ctx.font = `400 20px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(monthLabel(d.month), x + barWidth / 2, chartTop + barMaxHeight + 10);
  });

  currentY = chartTop + chartHeight + 24;

  // Extremes
  const extremeItems = [
    data.extremes.highestElevation
      ? { label: isEn ? 'Highest Alt' : '海拔最高', value: `${data.extremes.highestElevation.value}m`, sub: data.extremes.highestElevation.date }
      : null,
    data.extremes.highestHeartRate
      ? { label: isEn ? 'Peak HR' : '心率最顶', value: `${data.extremes.highestHeartRate.value}bpm`, sub: data.extremes.highestHeartRate.date }
      : null,
    data.extremes.earliestStart
      ? { label: isEn ? 'Earliest' : '最早起跑', value: data.extremes.earliestStart.value, sub: data.extremes.earliestStart.date }
      : null,
  ].filter(Boolean) as { label: string; value: string; sub: string }[];

  if (extremeItems.length > 0) {
    const extremeCardWidth = (width - paddingX * 2 - (extremeItems.length - 1) * cardGap) / extremeItems.length;
    extremeItems.forEach((item, i) => {
      const x = paddingX + i * (extremeCardWidth + cardGap);
      const y = currentY;

      ctx.fillStyle = cardBg;
      ctx.fillRect(x, y, extremeCardWidth, extremesHeight);
      ctx.strokeStyle = cardBorder;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, extremeCardWidth, extremesHeight);

      ctx.fillStyle = subColor;
      ctx.font = `400 20px ${fontStack}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(item.label, x + cardPadding, y + cardPadding);

      ctx.fillStyle = textColor;
      ctx.font = `bold 28px ${fontStack}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(item.value, x + cardPadding, y + extremesHeight - cardPadding - 20);

      ctx.fillStyle = subColor;
      ctx.font = `400 16px ${fontStack}`;
      ctx.textBaseline = 'bottom';
      ctx.fillText(item.sub, x + cardPadding, y + extremesHeight - cardPadding);
    });
    currentY += extremesHeight + cardGap;
  }

  // Footer slogan
  ctx.fillStyle = textColor;
  ctx.font = `bold 36px ${fontStack}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const slogan = isEn ? 'Still Running.' : `${data.year}，我还在跑`;
  ctx.fillText(slogan, width / 2, height - footerHeight / 2);

  return canvas.toDataURL('image/png');
}
