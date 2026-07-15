/**
 * Strava-style heart-rate zones based on maximum heart rate.
 * The rounded upper boundaries reproduce Strava's default zones; for a
 * maximum heart rate of 182 bpm they are 118 / 147 / 162 / 177 / 178+.
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

const STRAVA_ZONE_UPPER_RATIOS = [0.65, 0.81, 0.89, 0.97] as const;

export function getHRZones(maxHeartRate: number): HRZones {
  const [z1Max, z2Max, z3Max, z4Max] = STRAVA_ZONE_UPPER_RATIOS
    .map((ratio) => Math.round(maxHeartRate * ratio));

  return {
    z1: { min: 0, max: z1Max, label: '恢复', shortLabel: 'Z1' },
    z2: { min: z1Max + 1, max: z2Max, label: '耐力', shortLabel: 'Z2' },
    z3: { min: z2Max + 1, max: z3Max, label: '节奏', shortLabel: 'Z3' },
    z4: { min: z3Max + 1, max: z4Max, label: '阈值', shortLabel: 'Z4' },
    z5: { min: z4Max + 1, max: 999, label: '无氧', shortLabel: 'Z5' },
  };
}

export function getZoneForHR(hr: number, maxHeartRate: number): keyof HRZones {
  const zones = getHRZones(maxHeartRate);
  if (hr >= zones.z5.min) return 'z5';
  if (hr >= zones.z4.min) return 'z4';
  if (hr >= zones.z3.min) return 'z3';
  if (hr >= zones.z2.min) return 'z2';
  return 'z1';
}

export function getZoneLabelForHR(hr: number, maxHeartRate: number): string {
  const zone = getZoneForHR(hr, maxHeartRate);
  const zones = getHRZones(maxHeartRate);
  return zones[zone].label;
}

/**
 * Joe Friel / TrainingPeaks zones remain available for threshold-based
 * classification and plan prescriptions. They must not be presented as the
 * Strava max-HR zones above.
 */
export function getLthrHRZones(lthr: number): HRZones {
  const r = Math.round;
  return {
    z1: { min: 0, max: r(lthr * 0.849), label: '恢复', shortLabel: 'Z1' },
    z2: { min: r(lthr * 0.85), max: r(lthr * 0.89), label: '有氧基础', shortLabel: 'Z2' },
    z3: { min: r(lthr * 0.90), max: r(lthr * 0.94), label: '马拉松配速', shortLabel: 'Z3' },
    z4: { min: r(lthr * 0.95), max: r(lthr * 0.99), label: '阈值', shortLabel: 'Z4' },
    z5: { min: r(lthr), max: 999, label: 'VO2max', shortLabel: 'Z5' },
  };
}

export function getLthrZoneForHR(hr: number, lthr: number): keyof HRZones {
  const pct = hr / lthr;
  if (pct >= 1.0) return 'z5';
  if (pct >= 0.95) return 'z4';
  if (pct >= 0.90) return 'z3';
  if (pct >= 0.85) return 'z2';
  return 'z1';
}
