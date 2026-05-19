import { getZoneForHR, type HRZones } from './heartRateZones';

export type PacePattern =
  | 'warmup-cooldown'   // slow start + slow end, fast middle
  | 'interval'          // alternating fast/slow segments
  | 'progression'       // steadily faster or slower throughout
  | 'steady'            // consistent pace with minor variation
  | 'bonk'              // sustained slowdown in latter half (race)
  | 'mixed'             // unclassified / complex pattern
  | 'unknown';          // insufficient data

export interface SegmentData {
  km: number;
  avgHR: number;
  avgPaceSecPerKm: number;
  zone: string;
  paceVsAvgPct: number;
}

export interface StreamAnalysis {
  segments: SegmentData[];
  hrZoneDistribution: Record<string, number>;
  pacePattern: PacePattern;
  patternConfidence: string; // human-readable description
  avgHRDrift: number;
  hasPaceSurges: boolean;
  hasHRDrift: boolean;
}

/* ── helpers ─────────────────────────────────────────────── */

function detectPacePattern(segments: SegmentData[], isRace: boolean): { pattern: PacePattern; confidence: string } {
  if (segments.length < 3) return { pattern: 'unknown', confidence: '数据不足' };

  const n = segments.length;
  const paces = segments.map(s => s.avgPaceSecPerKm);
  const avgPace = paces.reduce((a, b) => a + b, 0) / n;
  const fastThreshold = avgPace * 0.90; // >10% faster than avg
  const slowThreshold = avgPace * 1.10; // >10% slower than avg

  // 1. Warmup-cooldown: first 1-2 and last 1-2 segments are slow, middle is normal/fast
  const firstSlow = paces.slice(0, 2).every(p => p > slowThreshold);
  const lastSlow = paces.slice(-2).every(p => p > slowThreshold);
  const middleNormal = paces.slice(2, -2).length > 0 && paces.slice(2, -2).every(p => p <= slowThreshold);
  if (firstSlow && lastSlow && middleNormal) {
    return { pattern: 'warmup-cooldown', confidence: '前段与末段明显慢于主体，符合热身+冷身结构' };
  }

  // 2. Interval: at least 2 full fast-slow cycles
  let cycles = 0;
  let inFast = false;
  for (let i = 0; i < n; i++) {
    if (!inFast && paces[i] < fastThreshold) {
      inFast = true;
    } else if (inFast && paces[i] > slowThreshold) {
      inFast = false;
      cycles++;
    }
  }
  if (cycles >= 2) {
    return { pattern: 'interval', confidence: `检测到${cycles}次明显的快-慢交替周期，符合间歇/法特莱克结构` };
  }

  // 3. Bonk (race only): sustained slowdown in latter half, no recovery
  if (isRace && n >= 6) {
    const latterHalf = paces.slice(Math.floor(n / 2));
    let consecutiveSlow = 0;
    let maxConsecutiveSlow = 0;
    for (let i = 1; i < latterHalf.length; i++) {
      if (latterHalf[i] > latterHalf[i - 1]) {
        consecutiveSlow++;
        maxConsecutiveSlow = Math.max(maxConsecutiveSlow, consecutiveSlow);
      } else if (latterHalf[i] < latterHalf[i - 1] * 0.97) {
        // got faster again — breaks the bonk pattern
        consecutiveSlow = 0;
      }
    }
    if (maxConsecutiveSlow >= 3) {
      return { pattern: 'bonk', confidence: `后程连续${maxConsecutiveSlow + 1}公里持续掉速且无回升，比赛场景下高度疑似跑崩/糖原耗竭` };
    }
  }

  // 4. Progression: steady trend (getting faster or slower)
  const firstThird = paces.slice(0, Math.ceil(n / 3));
  const lastThird = paces.slice(Math.floor((n * 2) / 3));
  const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
  const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
  const trend = (lastAvg - firstAvg) / firstAvg;
  if (Math.abs(trend) > 0.08) {
    return {
      pattern: 'progression',
      confidence: trend < 0 ? '整体呈渐进加速趋势' : '整体呈渐进降速趋势',
    };
  }

  // 5. Steady: most segments within ±10% of average
  const steadyCount = paces.filter(p => p >= avgPace * 0.90 && p <= avgPace * 1.10).length;
  if (steadyCount / n >= 0.7) {
    return { pattern: 'steady', confidence: '配速整体稳定，波动较小' };
  }

  return { pattern: 'mixed', confidence: '配速变化较复杂，未识别出明确模式' };
}

/* ── main analysis ───────────────────────────────────────── */

export function analyzeActivityStreams(
  streams: Record<string, any> | null,
  lthr: number,
  avgPaceSecPerKm: number,
  isRace: boolean = false
): StreamAnalysis | null {
  if (!streams) return null;

  const hrData = streams.heartrate?.data as number[] | undefined;
  const distData = streams.distance?.data as number[] | undefined;
  const velData = streams.velocity_smooth?.data as number[] | undefined;

  if (!hrData || !distData || !velData || hrData.length === 0) {
    return null;
  }

  const totalDist = distData[distData.length - 1];
  const totalKm = Math.floor(totalDist / 1000);
  if (totalKm < 1) return null;

  const segments: SegmentData[] = [];

  for (let km = 0; km < totalKm; km++) {
    const startM = km * 1000;
    const endM = (km + 1) * 1000;

    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < distData.length; i++) {
      if (startIdx === -1 && distData[i] >= startM) startIdx = i;
      if (endIdx === -1 && distData[i] >= endM) { endIdx = i; break; }
    }
    if (startIdx === -1) startIdx = 0;
    if (endIdx === -1) endIdx = distData.length - 1;
    if (endIdx <= startIdx) continue;

    const hrSlice = hrData.slice(startIdx, endIdx);
    const velSlice = velData.slice(startIdx, endIdx);

    const avgHR = hrSlice.reduce((a, b) => a + b, 0) / hrSlice.length;
    const avgVel = velSlice.reduce((a, b) => a + b, 0) / velSlice.length;
    const paceSec = avgVel > 0 ? 1000 / avgVel : 0;

    const zone = getZoneForHR(avgHR, lthr);
    const paceDiff = avgPaceSecPerKm > 0
      ? ((avgPaceSecPerKm - paceSec) / avgPaceSecPerKm) * 100
      : 0;

    segments.push({
      km,
      avgHR: Math.round(avgHR),
      avgPaceSecPerKm: Math.round(paceSec),
      zone,
      paceVsAvgPct: Math.round(paceDiff),
    });
  }

  if (segments.length === 0) return null;

  // HR zone distribution
  const dist: Record<string, number> = {};
  segments.forEach(s => { dist[s.zone] = (dist[s.zone] || 0) + 1; });
  Object.keys(dist).forEach(k => {
    dist[k] = Math.round((dist[k] / segments.length) * 100);
  });

  // HR drift
  const mid = Math.floor(segments.length / 2);
  const firstHalfHR = segments.slice(0, mid).reduce((s, x) => s + x.avgHR, 0) / mid;
  const secondHalfHR = segments.slice(mid).reduce((s, x) => s + x.avgHR, 0) / (segments.length - mid);
  const hrDrift = secondHalfHR - firstHalfHR;

  // Pace surges
  const hasPaceSurges = segments.some(s => s.paceVsAvgPct > 15);

  // True HR drift: only if no pattern explains the HR rise
  const { pattern, confidence } = detectPacePattern(segments, isRace);
  const hasHRDrift =
    hrDrift > (lthr * 0.05) &&
    !hasPaceSurges &&
    pattern !== 'interval' &&
    pattern !== 'warmup-cooldown';

  return {
    segments,
    hrZoneDistribution: dist,
    pacePattern: pattern,
    patternConfidence: confidence,
    avgHRDrift: Math.round(hrDrift),
    hasPaceSurges,
    hasHRDrift,
  };
}

/* ── prompt formatter ────────────────────────────────────── */

export function formatStreamAnalysisForPrompt(
  analysis: StreamAnalysis | null,
  lthr: number,
  locale: string = 'zh'
): string {
  if (!analysis) return '';
  const en = locale.startsWith('en');

  const zoneLabels: Record<string, string> = en
    ? { z1: 'Recovery', z2: 'Aerobic Base', z3: 'Marathon Pace', z4: 'Threshold', z5: 'VO2max' }
    : { z1: '恢复', z2: '有氧基础', z3: '马拉松配速', z4: '阈值', z5: 'VO2max' };

  const patternDesc: Record<PacePattern, string> = en
    ? {
        'warmup-cooldown': 'Warmup + Cooldown structure detected. Slow segments at start/end are NORMAL — do NOT flag as poor performance.',
        'interval': 'Interval/Fartlek structure detected. Alternating fast/slow segments are INTENTIONAL — do NOT flag pace variation as a problem.',
        'progression': 'Progression run detected. Overall pace trend is by design.',
        'steady': 'Steady pace throughout. Good aerobic control.',
        'bonk': 'Sustained slowdown in latter half with no recovery. In a race this strongly suggests glycogen depletion / bonk.',
        'mixed': 'Complex pace pattern.',
        'unknown': 'Insufficient data for pattern detection.',
      }
    : {
        'warmup-cooldown': '检测到热身+冷身结构。开头/结尾的慢速段是正常的——禁止标记为表现差。',
        'interval': '检测到间歇/法特莱克结构。快慢交替是训练设计——禁止将配速波动判定为问题。',
        'progression': '检测到渐进跑结构。整体配速趋势是有意设计。',
        'steady': '全程配速稳定。有氧控制良好。',
        'bonk': '后程持续掉速且无回升。比赛中高度疑似糖原耗竭/跑崩。',
        'mixed': '配速模式较复杂。',
        'unknown': '数据不足，无法识别模式。',
      };

  let text = en
    ? `\n\n## Heart Rate & Pace Segment Analysis`
    : `\n\n## 心率与配速分段分析`;

  // LTHR zones
  text += en
    ? `\n- LTHR (lactate threshold heart rate): ${lthr} bpm`
    : `\n- 乳酸阈值心率(LTHR): ${lthr} bpm`;
  text += en
    ? `\n- HR Zones: Z1 Recovery <${Math.round(lthr * 0.85)} | Z2 Aerobic ${Math.round(lthr * 0.85)}-${Math.round(lthr * 0.89)} | Z3 Marathon ${Math.round(lthr * 0.90)}-${Math.round(lthr * 0.94)} | Z4 Threshold ${Math.round(lthr * 0.95)}-${Math.round(lthr * 0.99)} | Z5 VO2max ≥${lthr}`
    : `\n- 心率区间: Z1恢复<${Math.round(lthr * 0.85)} | Z2有氧基础${Math.round(lthr * 0.85)}-${Math.round(lthr * 0.89)} | Z3马拉松配速${Math.round(lthr * 0.90)}-${Math.round(lthr * 0.94)} | Z4阈值${Math.round(lthr * 0.95)}-${Math.round(lthr * 0.99)} | Z5 VO2max≥${lthr}`;

  // Zone distribution
  text += en ? `\n- Time in each zone:` : `\n- 各区时间占比:`;
  Object.entries(analysis.hrZoneDistribution).forEach(([zone, pct]) => {
    text += ` ${zoneLabels[zone] || zone} ${pct}%`;
  });

  // Pattern detection (CRITICAL)
  text += en
    ? `\n- Detected pace pattern: ${analysis.pacePattern}`
    : `\n- 配速模式识别: ${analysis.pacePattern}`;
  text += ` — ${analysis.patternConfidence}`;
  text += en
    ? `\n- IMPORTANT: ${patternDesc[analysis.pacePattern]}`
    : `\n- 重要: ${patternDesc[analysis.pacePattern]}`;

  // Per-km breakdown (first 5 + last 3, or all if ≤8)
  const segs = analysis.segments;
  const showAll = segs.length <= 8;
  const showSegs = showAll ? segs : [...segs.slice(0, 5), ...segs.slice(-3)];

  text += en ? `\n- Per-km breakdown:` : `\n- 每公里分段:`;
  showSegs.forEach((s, i) => {
    if (!showAll && i === 5) text += en ? ` ... ` : ` ... `;
    const paceMin = Math.floor(s.avgPaceSecPerKm / 60);
    const paceSec = s.avgPaceSecPerKm % 60;
    const paceStr = `${paceMin}'${paceSec.toString().padStart(2, '0')}"`;
    const surgeFlag = s.paceVsAvgPct > 15 ? (en ? ' [SURGE]' : ' [加速]') : '';
    text += en
      ? `\n  Km${s.km + 1}: HR ${s.avgHR}bpm (${zoneLabels[s.zone] || s.zone}), pace ${paceStr}/km${surgeFlag}`
      : `\n  第${s.km + 1}公里: 心率${s.avgHR}bpm(${zoneLabels[s.zone] || s.zone}), 配速${paceStr}/km${surgeFlag}`;
  });

  // HR drift assessment
  text += en
    ? `\n- HR drift (2nd half vs 1st half): ${analysis.avgHRDrift > 0 ? '+' : ''}${analysis.avgHRDrift} bpm`
    : `\n- 心率漂移（后半程vs前半程）: ${analysis.avgHRDrift > 0 ? '+' : ''}${analysis.avgHRDrift} bpm`;

  if (analysis.hasHRDrift) {
    text += en
      ? `\n- ⚠️ Cardiac drift detected: HR rose in 2nd half with NO corresponding pace pattern explanation. Possible causes: dehydration, heat, fatigue, or insufficient aerobic base.`
      : `\n- ⚠️ 心率漂移: 后半程心率上升，且无法用配速模式（间歇/加速段）解释。可能原因：脱水、高温、疲劳或有氧基础不足。`;
  } else if (analysis.avgHRDrift > 0) {
    text += en
      ? `\n- HR rose slightly in 2nd half but this is explained by the detected pace pattern (${analysis.pacePattern}). Not a concern.`
      : `\n- 后半程心率略有上升，但已被识别出的配速模式(${analysis.pacePattern})解释。无需担忧。`;
  }

  // CRITICAL: pace slowdown rules
  text += en
    ? `\n\n## CRITICAL RULES for Pace Slowdown Assessment`
    : `\n\n## 配速下降判定关键规则`;
  text += en
    ? `\n1. If pace slows ONLY at the START (first 1-2 km): this is WARMUP. Normal.`
    : `\n1. 如果只有开头1-2公里慢：这是热身。正常。`;
  text += en
    ? `\n2. If pace slows ONLY at the END (last 1-2 km): this is COOLDOWN / recovery jog. Normal.`
    : `\n2. 如果只有结尾1-2公里慢：这是冷身/恢复慢跑。正常。`;
  text += en
    ? `\n3. If pace alternates fast-slow-fast-slow repeatedly: this is INTERVAL / FARTLEK. The slow segments are INTENTIONAL recovery. Normal.`
    : `\n3. 如果配速连续快慢交替：这是间歇/法特莱克。慢段是故意恢复。正常。`;
  text += en
    ? `\n4. If pace shows sustained slowdown in the latter half of a RACE with no recovery: this is BONK / glycogen depletion. Flag as a problem.`
    : `\n4. 如果是比赛，且后程持续掉速无回升：这是跑崩/糖原耗竭。标记为问题。`;
  text += en
    ? `\n5. If a training run has a fast segment followed by slowdown mid-run (not at start/end) without interval pattern: this may be a tempo insert or progression run. Do NOT automatically label as "glycogen depletion" unless HR also drifted without explanation.`
    : `\n5. 如果是训练，中间某段快之后掉速（不在头尾），且不符合间歇模式：可能是穿插阈值配速或渐进跑。除非心率也无缘无故漂移，否则禁止自动标记为"糖原耗竭"。`;

  return text;
}
