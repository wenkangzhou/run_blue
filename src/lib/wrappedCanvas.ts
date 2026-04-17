export interface WrappedCanvasData {
  year: number;
  quarter?: number;
  totalDistanceKm: number;
  totalRuns: number;
  totalDurationSec: number;
  longestRunKm: number;
  longestRunDate: string;
  avgPaceSecPerKm: number;
  totalElevationGainM: number;
  favoriteMonth: { month: number; distanceKm: number };
  timeOfDay: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
  longestStreakDays: number;
  monthlyDistances: { month: number; distanceKm: number }[];
  bestPaceSecPerKm: number;
  bestPaceDate: string;
}

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

  // Layout constants
  const paddingX = 60;
  const cardGap = 24;
  const cardPadding = 32;
  const headerHeight = 220;
  const footerHeight = 140;
  const chartHeight = 320;
  const bigCardHeight = 180;
  const smallCardHeight = 140;

  // Calculate rows of cards
  const rows = [
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

  const contentHeight = rows.reduce((sum, row) => {
    const h = row.length === 1 ? bigCardHeight : smallCardHeight;
    return sum + h + cardGap;
  }, 0);

  const height = headerHeight + contentHeight + chartHeight + footerHeight + paddingX * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 80px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  const periodText = data.quarter
    ? `${data.year} Q${data.quarter}`
    : `${data.year}`;
  ctx.fillText(periodText, width / 2, headerHeight / 2 - 20);

  ctx.font = '400 32px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  ctx.fillStyle = subColor;
  ctx.fillText(isEn ? 'Running Wrapped' : '年度跑步回顾', width / 2, headerHeight / 2 + 50);

  // Draw cards
  let currentY = headerHeight + paddingX;

  rows.forEach((row) => {
    const cardHeight = row.length === 1 ? bigCardHeight : smallCardHeight;
    const cardWidth = (width - paddingX * 2 - cardGap * (row.length - 1)) / row.length;

    row.forEach((card, idx) => {
      const x = paddingX + idx * (cardWidth + cardGap);
      const y = currentY;

      // Card background
      ctx.fillStyle = cardBg;
      ctx.fillRect(x, y, cardWidth, cardHeight);

      // Card border
      ctx.strokeStyle = cardBorder;
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      // Label
      ctx.fillStyle = subColor;
      ctx.font = '400 24px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(card.label, x + cardPadding, y + cardPadding);

      // Value + Unit aligned on same baseline
      ctx.fillStyle = textColor;
      const valueFontSize = cardHeight === bigCardHeight ? 72 : 48;
      ctx.font = `bold ${valueFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.textBaseline = 'alphabetic';
      const valueY = y + cardHeight - cardPadding - (card.sub ? 36 : 10);
      ctx.fillText(card.value, x + cardPadding, valueY);

      if (card.unit) {
        const valueWidth = ctx.measureText(card.value).width;
        ctx.fillStyle = subColor;
        const unitFontSize = cardHeight === bigCardHeight ? 32 : 24;
        ctx.font = `400 ${unitFontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(card.unit, x + cardPadding + valueWidth + 10, valueY);
      }

      // Sub
      if (card.sub) {
        ctx.fillStyle = subColor;
        ctx.font = '400 20px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        ctx.textBaseline = 'bottom';
        ctx.fillText(card.sub, x + cardPadding, y + cardHeight - cardPadding);
      }
    });

    currentY += cardHeight + cardGap;
  });

  // Time of day badge (floating style under cards)
  const todEntries = Object.entries(data.timeOfDay).sort((a, b) => b[1] - a[1]);
  const topTod = todEntries[0];
  if (topTod && topTod[1] > 0) {
    currentY += 10;
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 28px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const todText = `${isEn ? 'You mostly run in the' : '你最常在'} ${timeOfDayLabel(topTod[0])}${isEn ? '' : ''}`;
    ctx.fillText(todText, width / 2, currentY);
    currentY += 50;
  }

  // Monthly bar chart
  const chartTop = currentY + 20;
  const barAreaWidth = width - paddingX * 2;
  const barMaxHeight = chartHeight - 80;
  const maxMonthDist = Math.max(...data.monthlyDistances.map((d) => d.distanceKm), 1);
  const barWidth = (barAreaWidth - (data.monthlyDistances.length - 1) * 16) / data.monthlyDistances.length;

  data.monthlyDistances.forEach((d, i) => {
    const barH = (d.distanceKm / maxMonthDist) * barMaxHeight;
    const x = paddingX + i * (barWidth + 16);
    const y = chartTop + barMaxHeight - barH;

    ctx.fillStyle = d.distanceKm === maxMonthDist ? accentColor : '#d4d4d8';
    ctx.fillRect(x, y, barWidth, barH);

    // Month label
    ctx.fillStyle = subColor;
    ctx.font = '400 22px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(monthLabel(d.month), x + barWidth / 2, chartTop + barMaxHeight + 12);
  });

  // Footer slogan
  ctx.fillStyle = textColor;
  ctx.font = 'bold 40px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const slogan = isEn ? 'Still Running.' : `${data.year}，我还在跑`;
  ctx.fillText(slogan, width / 2, height - footerHeight / 2);

  return canvas.toDataURL('image/png');
}
