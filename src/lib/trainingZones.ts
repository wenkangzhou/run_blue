import type { ActivityStream, StravaActivity } from '@/types';
import { getActivityTimestamp } from './dates';
import { getHRZones, getZoneForHR } from './heartRateZones';

const DAY_MS = 24 * 60 * 60 * 1000;
const RIEGEL_EXPONENT = 1.06;

export type PaceTrainingZoneId = 'z1' | 'z2' | 'z3' | 'z4' | 'z5' | 'z6';
export type HeartRateTrainingZoneId = 'z1' | 'z2' | 'z3' | 'z4' | 'z5';
export type TrainingZoneMode = 'pace' | 'heartRate';
export type TrainingZonePeriod = '7d' | '30d' | '90d' | '180d' | 'ytd' | '365d';
export type FiveKReferenceSource = 'profile' | 'profile-equivalent' | 'history-estimate';

export interface PaceTrainingZone {
  id: PaceTrainingZoneId;
  min: number;
  max: number;
  semantic: 'E' | 'M' | 'T' | 'I' | 'R';
}

export interface SemanticPaceZones {
  easy: { min: number; max: number; description: string };
  marathon: { min: number; max: number; description: string };
  threshold: { min: number; max: number; description: string };
  interval: { min: number; max: number; description: string };
  repetition: { min: number; max: number; description: string };
}

export interface FiveKReference {
  seconds: number;
  source: FiveKReferenceSource;
}

export interface TrainingZoneDistributionItem {
  id: PaceTrainingZoneId | HeartRateTrainingZoneId;
  min: number;
  max: number;
  seconds: number;
  percent: number;
  previousPercent: number;
  deltaPercent: number;
}

export interface TrainingZoneDistribution {
  mode: TrainingZoneMode;
  period: TrainingZonePeriod;
  zones: TrainingZoneDistributionItem[];
  totalSeconds: number;
  previousTotalSeconds: number;
  coveredActivities: number;
  totalActivities: number;
  coveragePercent: number;
  dominantZone: TrainingZoneDistributionItem['id'] | null;
  lowIntensityPercent: number;
  qualityPercent: number;
}

export type ActivityTrainingZoneSource = 'stream' | 'splits' | 'average' | 'unavailable';

export interface ActivityTrainingZoneDistribution {
  mode: TrainingZoneMode;
  zones: Array<Pick<TrainingZoneDistributionItem, 'id' | 'min' | 'max' | 'seconds' | 'percent'>>;
  totalSeconds: number;
  coveragePercent: number;
  dominantZone: TrainingZoneDistributionItem['id'] | null;
  source: ActivityTrainingZoneSource;
}

const PACE_ZONE_IDS: PaceTrainingZoneId[] = ['z6', 'z5', 'z4', 'z3', 'z2', 'z1'];
const HR_ZONE_IDS: HeartRateTrainingZoneId[] = ['z5', 'z4', 'z3', 'z2', 'z1'];

function isRun(activity: StravaActivity): boolean {
  return activity.type === 'Run'
    || activity.type === 'TrailRun'
    || activity.sport_type === 'Run'
    || activity.sport_type === 'TrailRun'
    || activity.sport_type === 'VirtualRun';
}

function roundBoundary(value: number): number {
  return Math.max(1, Math.round(value));
}

/**
 * Six display zones calibrated from 5K ability. The boundaries mirror the
 * progression in Strava's pace-zone presentation while preserving E/M/T/I/R
 * semantics used by the rest of the app.
 */
export function getPaceTrainingZones(pb5kSeconds: number): PaceTrainingZone[] {
  const pace = pb5kSeconds > 0 ? pb5kSeconds / 5 : 300;
  const z6Max = roundBoundary(pace * 0.95);
  const z5Max = roundBoundary(pace * 1.008);
  const z4Max = roundBoundary(pace * 1.075);
  const z3Max = roundBoundary(pace * 1.20);
  const z2Max = roundBoundary(pace * 1.393);

  return [
    { id: 'z6', min: 0, max: z6Max, semantic: 'R' },
    { id: 'z5', min: z6Max, max: z5Max, semantic: 'I' },
    { id: 'z4', min: z5Max, max: z4Max, semantic: 'T' },
    { id: 'z3', min: z4Max, max: z3Max, semantic: 'M' },
    { id: 'z2', min: z3Max, max: z2Max, semantic: 'E' },
    { id: 'z1', min: z2Max, max: Number.POSITIVE_INFINITY, semantic: 'E' },
  ];
}

export function calculateSemanticPaceZones(pb5kSeconds: number): SemanticPaceZones {
  const pace = pb5kSeconds > 0 ? pb5kSeconds / 5 : 300;
  const zones = getPaceTrainingZones(pb5kSeconds);
  const byId = Object.fromEntries(zones.map((zone) => [zone.id, zone])) as Record<PaceTrainingZoneId, PaceTrainingZone>;

  return {
    easy: {
      min: byId.z2.min,
      max: byId.z2.max,
      description: '轻松跑 - 恢复、有氧基础',
    },
    marathon: {
      min: byId.z3.min,
      max: byId.z3.max,
      description: '稳态跑 - 马拉松配速附近',
    },
    threshold: {
      min: byId.z4.min,
      max: byId.z4.max,
      description: '乳酸阈值 - 可持续的较高强度',
    },
    interval: {
      min: byId.z5.min,
      max: byId.z5.max,
      description: '间歇跑 - VO2max 训练',
    },
    repetition: {
      min: roundBoundary(pace * 0.87),
      max: byId.z6.max,
      description: '重复跑 - 速度和跑姿',
    },
  };
}

export function getPaceZoneForSeconds(paceSeconds: number, pb5kSeconds: number): PaceTrainingZoneId | null {
  if (!Number.isFinite(paceSeconds) || paceSeconds <= 0) return null;
  return getPaceTrainingZones(pb5kSeconds).find((zone) => paceSeconds < zone.max)?.id ?? 'z1';
}

function getActivityZoneDefinitions(
  mode: TrainingZoneMode,
  pb5kSeconds?: number | null,
  lthr?: number | null
) {
  if (mode === 'pace') {
    if (!pb5kSeconds) return [];
    return getPaceTrainingZones(pb5kSeconds).map(({ id, min, max }) => ({ id, min, max }));
  }

  if (!lthr) return [];
  const zones = getHRZones(lthr);
  return HR_ZONE_IDS.map((id) => ({ id, min: zones[id].min, max: zones[id].max }));
}

function getSampleZone(
  value: number,
  mode: TrainingZoneMode,
  pb5kSeconds?: number | null,
  lthr?: number | null
): PaceTrainingZoneId | HeartRateTrainingZoneId | null {
  if (!Number.isFinite(value)) return null;
  if (mode === 'pace') {
    if (!pb5kSeconds || value <= 0) return null;
    const paceSeconds = 1000 / value;
    if (paceSeconds < 120 || paceSeconds > 1200) return null;
    return getPaceZoneForSeconds(paceSeconds, pb5kSeconds);
  }

  if (!lthr || value < 40 || value > 240) return null;
  return getZoneForHR(value, lthr);
}

/**
 * Calculates one activity's zone distribution from high-resolution streams.
 * When streams are unavailable, the activity average is used and surfaced as
 * a lower-precision fallback instead of pretending it is sample-level data.
 */
export function calculateActivityTrainingZoneDistribution({
  activity,
  streams,
  mode,
  pb5kSeconds,
  lthr,
}: {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
  mode: TrainingZoneMode;
  pb5kSeconds?: number | null;
  lthr?: number | null;
}): ActivityTrainingZoneDistribution {
  const definitions = getActivityZoneDefinitions(mode, pb5kSeconds, lthr);
  const zoneIds = mode === 'pace' ? PACE_ZONE_IDS : HR_ZONE_IDS;
  const seconds = Object.fromEntries(zoneIds.map((id) => [id, 0])) as Record<string, number>;

  if (definitions.length === 0) {
    return {
      mode,
      zones: [],
      totalSeconds: 0,
      coveragePercent: 0,
      dominantZone: null,
      source: 'unavailable',
    };
  }

  const timeData = streams?.time?.data as number[] | undefined;
  const valueData = (mode === 'pace' ? streams?.velocity_smooth?.data : streams?.heartrate?.data) as number[] | undefined;
  const velocityData = streams?.velocity_smooth?.data as number[] | undefined;
  let source: ActivityTrainingZoneSource = 'unavailable';

  if (timeData && valueData && timeData.length > 1 && valueData.length > 1) {
    const sampleCount = Math.min(timeData.length, valueData.length) - 1;
    for (let index = 0; index < sampleCount; index += 1) {
      const duration = timeData[index + 1] - timeData[index];
      if (!Number.isFinite(duration) || duration <= 0 || duration > 180) continue;
      if (mode === 'heartRate' && velocityData?.[index] !== undefined && velocityData[index] <= 0.3) continue;
      const zone = getSampleZone(valueData[index], mode, pb5kSeconds, lthr);
      if (!zone) continue;
      seconds[zone] += duration;
    }
    if (Object.values(seconds).some((value) => value > 0)) source = 'stream';
  }

  if (source === 'unavailable') {
    const segments = activity.splits_metric?.length
      ? activity.splits_metric
      : activity.laps ?? [];
    segments.forEach((segment) => {
      if (!segment.moving_time || segment.moving_time <= 0) return;
      const value = mode === 'pace'
        ? segment.average_speed
        : segment.average_heartrate ?? 0;
      const zone = getSampleZone(value, mode, pb5kSeconds, lthr);
      if (!zone) return;
      seconds[zone] += segment.moving_time;
    });
    if (Object.values(seconds).some((value) => value > 0)) source = 'splits';
  }

  if (source === 'unavailable') {
    const averageValue = mode === 'pace'
      ? activity.distance > 0 && activity.moving_time > 0
        ? activity.distance / activity.moving_time
        : 0
      : activity.average_heartrate ?? 0;
    const zone = getSampleZone(averageValue, mode, pb5kSeconds, lthr);
    if (zone && activity.moving_time > 0) {
      seconds[zone] = activity.moving_time;
      source = 'average';
    }
  }

  let totalSeconds = Object.values(seconds).reduce((sum, value) => sum + value, 0);
  if (activity.moving_time > 0 && totalSeconds > activity.moving_time) {
    const scale = activity.moving_time / totalSeconds;
    Object.keys(seconds).forEach((id) => {
      seconds[id] *= scale;
    });
    totalSeconds = activity.moving_time;
  }

  const items = definitions.map(({ id, min, max }) => {
    const zoneSeconds = seconds[id] ?? 0;
    return {
      id,
      min,
      max,
      seconds: zoneSeconds,
      percent: totalSeconds > 0 ? Math.round((zoneSeconds / totalSeconds) * 100) : 0,
    };
  });
  const dominant = items.reduce<(typeof items)[number] | null>(
    (best, item) => !best || item.seconds > best.seconds ? item : best,
    null
  );

  return {
    mode,
    zones: items,
    totalSeconds,
    coveragePercent: activity.moving_time > 0
      ? Math.min(100, Math.round((totalSeconds / activity.moving_time) * 100))
      : 0,
    dominantZone: totalSeconds > 0 ? dominant?.id ?? null : null,
    source,
  };
}

function projectToFiveK(timeSeconds: number, distanceKm: number): number {
  return Math.round(timeSeconds * Math.pow(5 / distanceKm, RIEGEL_EXPONENT));
}

export function resolveFiveKReference(
  pbs: Partial<Record<'5k' | '10k' | '21k' | '42k', number | null>> | null | undefined,
  activities: StravaActivity[] = []
): FiveKReference | null {
  const direct = pbs?.['5k'];
  if (direct && direct > 0) return { seconds: Math.round(direct), source: 'profile' };

  const references: Array<[keyof NonNullable<typeof pbs>, number]> = [
    ['10k', 10],
    ['21k', 21.0975],
    ['42k', 42.195],
  ];
  for (const [key, distance] of references) {
    const value = pbs?.[key];
    if (value && value > 0) {
      return { seconds: projectToFiveK(value, distance), source: 'profile-equivalent' };
    }
  }

  const candidates = activities
    .filter(isRun)
    .filter((activity) => activity.distance >= 3000 && activity.distance <= 50000 && activity.moving_time > 0)
    .map((activity) => projectToFiveK(activity.moving_time, activity.distance / 1000))
    .filter((seconds) => seconds >= 600 && seconds <= 7200);

  return candidates.length > 0
    ? { seconds: Math.min(...candidates), source: 'history-estimate' }
    : null;
}

function getPeriodStart(period: TrainingZonePeriod, now: Date): number {
  if (period === 'ytd') return new Date(now.getFullYear(), 0, 1).getTime();
  const days = period === '7d' ? 7
    : period === '30d' ? 30
      : period === '90d' ? 90
        : period === '180d' ? 180
          : 365;
  return now.getTime() - days * DAY_MS;
}

function getActivityZone(
  activity: StravaActivity,
  mode: TrainingZoneMode,
  pb5kSeconds?: number | null,
  lthr?: number | null
): PaceTrainingZoneId | HeartRateTrainingZoneId | null {
  if (mode === 'pace') {
    if (!pb5kSeconds || activity.distance <= 0 || activity.moving_time <= 0) return null;
    const pace = activity.moving_time / (activity.distance / 1000);
    if (pace < 120 || pace > 1200) return null;
    return getPaceZoneForSeconds(pace, pb5kSeconds);
  }

  const heartRate = activity.average_heartrate;
  if (!lthr || !heartRate || heartRate < 40 || heartRate > 240) return null;
  return getZoneForHR(heartRate, lthr);
}

function calculateWindowDistribution(
  activities: StravaActivity[],
  start: number,
  end: number,
  mode: TrainingZoneMode,
  zoneIds: Array<PaceTrainingZoneId | HeartRateTrainingZoneId>,
  pb5kSeconds?: number | null,
  lthr?: number | null
) {
  const seconds = Object.fromEntries(zoneIds.map((id) => [id, 0])) as Record<string, number>;
  let totalActivities = 0;
  let coveredActivities = 0;
  let eligibleSeconds = 0;
  let coveredSeconds = 0;

  activities.forEach((activity) => {
    if (!isRun(activity) || activity.moving_time <= 0) return;
    const timestamp = getActivityTimestamp(activity);
    if (timestamp < start || timestamp >= end) return;
    totalActivities += 1;
    eligibleSeconds += activity.moving_time;
    const zone = getActivityZone(activity, mode, pb5kSeconds, lthr);
    if (!zone) return;
    coveredActivities += 1;
    coveredSeconds += activity.moving_time;
    seconds[zone] = (seconds[zone] ?? 0) + activity.moving_time;
  });

  return { seconds, totalActivities, coveredActivities, eligibleSeconds, coveredSeconds };
}

export function calculateTrainingZoneDistribution({
  activities,
  mode,
  period,
  pb5kSeconds,
  lthr,
  now = new Date(),
}: {
  activities: StravaActivity[];
  mode: TrainingZoneMode;
  period: TrainingZonePeriod;
  pb5kSeconds?: number | null;
  lthr?: number | null;
  now?: Date;
}): TrainingZoneDistribution {
  const nowTime = now.getTime();
  const currentStart = getPeriodStart(period, now);
  const duration = Math.max(DAY_MS, nowTime - currentStart);
  const previousStart = currentStart - duration;
  const paceZones = pb5kSeconds ? getPaceTrainingZones(pb5kSeconds) : [];
  const hrZones = lthr ? getHRZones(lthr) : null;
  const zoneIds = mode === 'pace' ? PACE_ZONE_IDS : HR_ZONE_IDS;
  const current = calculateWindowDistribution(
    activities, currentStart, nowTime + 1, mode, zoneIds, pb5kSeconds, lthr
  );
  const previous = calculateWindowDistribution(
    activities, previousStart, currentStart, mode, zoneIds, pb5kSeconds, lthr
  );
  const currentTotal = Object.values(current.seconds).reduce((sum, value) => sum + value, 0);
  const previousTotal = Object.values(previous.seconds).reduce((sum, value) => sum + value, 0);

  const items = zoneIds.map((id) => {
    const paceZone = paceZones.find((zone) => zone.id === id);
    const hrZone = hrZones?.[id as HeartRateTrainingZoneId];
    const seconds = current.seconds[id] ?? 0;
    const percent = currentTotal > 0 ? Math.round((seconds / currentTotal) * 100) : 0;
    const previousPercent = previousTotal > 0
      ? Math.round(((previous.seconds[id] ?? 0) / previousTotal) * 100)
      : 0;
    return {
      id,
      min: paceZone?.min ?? hrZone?.min ?? 0,
      max: paceZone?.max ?? hrZone?.max ?? 0,
      seconds,
      percent,
      previousPercent,
      deltaPercent: percent - previousPercent,
    };
  });
  const dominant = items.reduce<TrainingZoneDistributionItem | null>(
    (best, item) => !best || item.seconds > best.seconds ? item : best,
    null
  );
  const percentFor = (ids: string[]) => items
    .filter((item) => ids.includes(item.id))
    .reduce((sum, item) => sum + item.percent, 0);

  return {
    mode,
    period,
    zones: items,
    totalSeconds: currentTotal,
    previousTotalSeconds: previousTotal,
    coveredActivities: current.coveredActivities,
    totalActivities: current.totalActivities,
    coveragePercent: current.eligibleSeconds > 0
      ? Math.round((current.coveredSeconds / current.eligibleSeconds) * 100)
      : 0,
    dominantZone: currentTotal > 0 ? dominant?.id ?? null : null,
    lowIntensityPercent: percentFor(['z1', 'z2']),
    qualityPercent: percentFor(mode === 'pace' ? ['z4', 'z5', 'z6'] : ['z4', 'z5']),
  };
}
