import { getZoneForHR, type HRZones } from './heartRateZones';

export interface SegmentData {
  km: number; // 0-based segment index
  avgHR: number;
  avgPaceSecPerKm: number;
  zone: string; // z1-z5
  paceVsAvgPct: number; // +15 = 15% faster than avg, -10 = 10% slower
}

export interface StreamAnalysis {
  segments: SegmentData[];
  hrZoneDistribution: Record<string, number>; // percentage per zone
  avgHRDrift: number; // bpm change from first half to second half
  hasPaceSurges: boolean; // true if any segment is >15% faster than avg
  hasHRDrift: boolean; // true if HR rises >5% in second half without pace surge
}

/**
 * Analyze heart rate and pace streams by slicing into ~1km segments.
 * Requires streams: time, distance, heartrate, velocity_smooth
 */
export function analyzeActivityStreams(
  streams: Record<string, any> | null,
  lthr: number,
  avgPaceSecPerKm: number
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

    // Find indices for this km segment
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < distData.length; i++) {
      if (startIdx === -1 && distData[i] >= startM) startIdx = i;
      if (endIdx === -1 && distData[i] >= endM) { endIdx = i; break; }
    }
    if (startIdx === -1) startIdx = 0;
    if (endIdx === -1) endIdx = distData.length - 1;
    if (endIdx <= startIdx) continue;

    // Slice data
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
  segments.forEach(s => {
    dist[s.zone] = (dist[s.zone] || 0) + 1;
  });
  Object.keys(dist).forEach(k => {
    dist[k] = Math.round((dist[k] / segments.length) * 100);
  });

  // HR drift: compare first half vs second half avg HR
  const mid = Math.floor(segments.length / 2);
  const firstHalfHR = segments.slice(0, mid).reduce((s, x) => s + x.avgHR, 0) / mid;
  const secondHalfHR = segments.slice(mid).reduce((s, x) => s + x.avgHR, 0) / (segments.length - mid);
  const hrDrift = secondHalfHR - firstHalfHR;

  // Pace surges: any segment >15% faster than average?
  const hasPaceSurges = segments.some(s => s.paceVsAvgPct > 15);

  // True HR drift: HR rises >5% in second half AND no pace surges
  const hasHRDrift = hrDrift > (lthr * 0.05) && !hasPaceSurges;

  return {
    segments,
    hrZoneDistribution: dist,
    avgHRDrift: Math.round(hrDrift),
    hasPaceSurges,
    hasHRDrift,
  };
}

/**
 * Format stream analysis for AI prompt
 */
export function formatStreamAnalysisForPrompt(
  analysis: StreamAnalysis | null,
  lthr: number,
  locale: string = 'zh'
): string {
  if (!analysis) return '';
  const en = locale.startsWith('en');

  let text = en
    ? `\n\n## Heart Rate Zone Analysis (LTHR-based, Joe Friel method)`
    : `\n\n## 心率区间分析（基于 LTHR，Joe Friel 法）`;

  text += en
    ? `\n- LTHR: ${lthr} bpm`
    : `\n- 乳酸阈值心率(LTHR): ${lthr} bpm`;

  // Zone distribution
  const zoneLabels: Record<string, string> = en
    ? { z1: 'Recovery', z2: 'Aerobic Base', z3: 'Marathon Pace', z4: 'Threshold', z5: 'VO2max' }
    : { z1: '恢复', z2: '有氧基础', z3: '马拉松配速', z4: '阈值', z5: 'VO2max' };

  text += en ? `\n- Zone distribution:` : `\n- 区间分布:`;
  Object.entries(analysis.hrZoneDistribution).forEach(([zone, pct]) => {
    text += ` ${zoneLabels[zone] || zone} ${pct}%`;
  });

  // Per-km segment summary (first 5 and last 3, or all if ≤8)
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
      ? `\n  Km${s.km + 1}: HR ${s.avgHR}bpm (${s.zone}), pace ${paceStr}/km${surgeFlag}`
      : `\n  第${s.km + 1}公里: 心率${s.avgHR}bpm (${zoneLabels[s.zone] || s.zone}), 配速${paceStr}/km${surgeFlag}`;
  });

  // HR drift + pace surge assessment
  text += en
    ? `\n- HR drift (2nd half vs 1st half): ${analysis.avgHRDrift > 0 ? '+' : ''}${analysis.avgHRDrift} bpm`
    : `\n- 心率漂移（后半程 vs 前半程）: ${analysis.avgHRDrift > 0 ? '+' : ''}${analysis.avgHRDrift} bpm`;

  if (analysis.hasPaceSurges) {
    text += en
      ? `\n- ⚠️ Pace surges detected (some km >15% faster than average). HR elevation in those segments is NORMAL — this is likely a fartlek, tempo insert, or progression run. Do NOT label it as "cardiac drift".`
      : `\n- ⚠️ 检测到配速加速段（部分公里比平均配速快15%以上）。这些段落的心率升高是正常的——可能是法特莱克、穿插阈值配速或渐进跑。禁止将其标记为"心率漂移"。`;
  }

  if (analysis.hasHRDrift) {
    text += en
      ? `\n- ⚠️ True cardiac drift detected: HR rose in 2nd half WITHOUT corresponding pace increase. Possible causes: dehydration, heat, fatigue, or insufficient aerobic base.`
      : `\n- ⚠️ 真正的心率漂移: 后半程心率上升但配速没有对应加快。可能原因：脱水、高温、疲劳或有氧基础不足。`;
  } else if (!analysis.hasPaceSurges && analysis.avgHRDrift > 0) {
    text += en
      ? `\n- HR rose slightly in 2nd half but within normal range for steady-state aerobic effort. No concerning drift.`
      : `\n- 后半程心率略有上升，但在稳态有氧运动的正常范围内。无明显漂移。`;
  }

  return text;
}
