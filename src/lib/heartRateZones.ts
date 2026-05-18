/**
 * Joe Friel / TrainingPeaks heart rate zones based on LTHR (lactate threshold heart rate)
 *
 * Zone   %LTHR      Meaning
 * Z1     < 85%      恢复
 * Z2     85-89%     有氧基础
 * Z3     90-94%     马拉松配速附近
 * Z4     95-99%     阈值
 * Z5     ≥ 100%     VO2max
 */

export interface HRZone {
  min: number;
  max: number;
  label: string;
  shortLabel: string;
}

export interface HRZones {
  z1: HRZone;
  z2: HRZone;
  z3: HRZone;
  z4: HRZone;
  z5: HRZone;
}

export function getHRZones(lthr: number): HRZones {
  const r = Math.round;
  return {
    z1: { min: 0, max: r(lthr * 0.849), label: '恢复', shortLabel: 'Z1' },
    z2: { min: r(lthr * 0.85), max: r(lthr * 0.89), label: '有氧基础', shortLabel: 'Z2' },
    z3: { min: r(lthr * 0.90), max: r(lthr * 0.94), label: '马拉松配速', shortLabel: 'Z3' },
    z4: { min: r(lthr * 0.95), max: r(lthr * 0.99), label: '阈值', shortLabel: 'Z4' },
    z5: { min: r(lthr), max: 999, label: 'VO2max', shortLabel: 'Z5' },
  };
}

export function getZoneForHR(hr: number, lthr: number): keyof HRZones {
  const pct = hr / lthr;
  if (pct >= 1.0) return 'z5';
  if (pct >= 0.95) return 'z4';
  if (pct >= 0.90) return 'z3';
  if (pct >= 0.85) return 'z2';
  return 'z1';
}

export function getZoneLabelForHR(hr: number, lthr: number): string {
  const zone = getZoneForHR(hr, lthr);
  const zones = getHRZones(lthr);
  return zones[zone].label;
}
