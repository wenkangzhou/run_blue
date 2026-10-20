import type { StravaActivity } from '@/types';
import type { UserProfilePBs } from './userProfile';
import { getKeySustainedEffort } from './activityHighlights';
import { calculateSemanticPaceZones } from './trainingZones';
import { buildActivityWeatherContext } from './weather';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const EVIDENCE_WINDOW_DAYS = 84;
const DECAY_DAYS = 56;
const SNAPSHOT_WEEKS = 52;
const RIEGEL_EXPONENT = 1.06;

export type PerformanceDistance = '5k' | '10k' | '21k' | '42k';
export type PerformanceConfidence = 'low' | 'medium' | 'high';
export type PerformanceEvidenceSource = 'best-effort' | 'race' | 'quality-block' | 'distance-effort' | 'long-run';
export type PerformanceEvidenceDimension = 'speed' | 'endurance';
export type PerformanceExclusionReason =
  | 'outside-window'
  | 'manual-or-flagged'
  | 'trail-run'
  | 'insufficient-distance'
  | 'no-quality-signal';

export interface PerformanceEvidence {
  activityId: number;
  activityName: string;
  timestamp: number;
  date: string;
  source: PerformanceEvidenceSource;
  distanceMeters: number;
  durationSeconds: number;
  normalizedDurationSeconds: number;
  vdot: number;
  confidence: number;
  prRank: number | null;
  heatAdjusted: boolean;
}

export interface PerformanceRecordEvent {
  activityId: number;
  activityName: string;
  timestamp: number;
  date: string;
  distance: PerformanceDistance;
  durationSeconds: number;
  prRank: number | null;
  source: 'best-effort' | 'race' | 'distance-effort';
}

export interface PerformanceRecord {
  distance: PerformanceDistance;
  durationSeconds: number;
  source: 'activity' | 'profile';
  event: PerformanceRecordEvent | null;
}

export interface PerformanceSnapshot {
  timestamp: number;
  date: string;
  vdot: number;
  confidence: PerformanceConfidence;
  confidenceScore: number;
  evidenceCount: number;
  latestEvidenceDays: number;
  primaryEvidence: PerformanceEvidence;
  evidence: PerformanceEvidence[];
}

export interface PerformanceEvidenceAuditItem {
  activityId: number;
  activityName: string;
  timestamp: number;
  date: string;
  distanceMeters: number;
  durationSeconds: number;
  dimension: PerformanceEvidenceDimension | null;
  source: PerformanceEvidenceSource | null;
  exclusionReason: PerformanceExclusionReason | null;
}

export interface PerformanceEvidenceAudit {
  included: PerformanceEvidenceAuditItem[];
  excluded: PerformanceEvidenceAuditItem[];
}

export type MarathonReadinessStatus = 'ready' | 'solid' | 'building' | 'limited';

export interface MarathonReadiness {
  score: number;
  status: MarathonReadinessStatus;
  confidence: PerformanceConfidence;
  adjustmentPercent: number;
  recentWeeklyKm: number;
  activeWeeks: number;
  longRunCount: number;
  maxLongRunMeters: number;
  ninetyMinuteRunCount: number;
  durabilitySampleCount: number;
  durabilityScore: number | null;
}

export interface MarathonProjection {
  speedPotentialSeconds: number;
  enduranceAdjustmentSeconds: number;
  estimatedSeconds: number;
  lowerSeconds: number;
  upperSeconds: number;
  confidence: PerformanceConfidence;
  readiness: MarathonReadiness;
}

export interface PerformanceTrend {
  snapshots: PerformanceSnapshot[];
  speedSnapshots: PerformanceSnapshot[];
  distanceSnapshots: Record<PerformanceDistance, PerformanceSnapshot[]>;
  evidence: PerformanceEvidence[];
  audits: Record<PerformanceDistance, PerformanceEvidenceAudit>;
  marathonProjection: MarathonProjection | null;
  recordEvents: Record<PerformanceDistance, PerformanceRecordEvent[]>;
  records: Record<PerformanceDistance, PerformanceRecord | null>;
  profileFiveKSeconds: number | null;
}

export interface ActivityPerformanceImpact {
  kind: 'pb' | 'ability';
  activityId: number;
  distance: PerformanceDistance;
  durationSeconds: number;
  predictedImprovementSeconds: number;
  heatAdjusted: boolean;
}

export const PERFORMANCE_DISTANCES: Record<PerformanceDistance, { meters: number; label: string }> = {
  '5k': { meters: 5_000, label: '5K' },
  '10k': { meters: 10_000, label: '10K' },
  '21k': { meters: 21_097.5, label: 'Half Marathon' },
  '42k': { meters: 42_195, label: 'Marathon' },
};

const RECORD_DISTANCE_TOLERANCE: Record<PerformanceDistance, number> = {
  '5k': 0.06,
  '10k': 0.06,
  '21k': 0.07,
  '42k': 0.07,
};

const MIN_RELEVANT_EVIDENCE_METERS: Record<PerformanceDistance, number> = {
  '5k': 2_850,
  '10k': 4_750,
  '21k': 9_500,
  '42k': 20_000,
};

const MARATHON_LONG_RUN_MIN_METERS = 28_000;
const MARATHON_LONG_RUN_MIN_SECONDS = 2 * 60 * 60;
const MARATHON_LONG_DURATION_MIN_METERS = 24_000;

function isRun(activity: StravaActivity): boolean {
  return activity.type === 'Run'
    || activity.type === 'TrailRun'
    || activity.sport_type === 'Run'
    || activity.sport_type === 'TrailRun'
    || activity.sport_type === 'VirtualRun';
}

function isTrailRun(activity: StravaActivity): boolean {
  return activity.type === 'TrailRun' || activity.sport_type === 'TrailRun';
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isMarathonLongRunActivity(activity: StravaActivity): boolean {
  return activity.distance >= MARATHON_LONG_RUN_MIN_METERS
    || (
      activity.distance >= MARATHON_LONG_DURATION_MIN_METERS
      && activity.moving_time >= MARATHON_LONG_RUN_MIN_SECONDS
    );
}

function getTimestamp(activity: Pick<StravaActivity, 'start_date' | 'start_date_local'>): number {
  const value = activity.start_date || activity.start_date_local;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function isRace(activity: StravaActivity): boolean {
  if (activity.workout_type === 1) return true;
  return /(?:^|\s)(race|racing)(?:\s|$)|比赛|竞赛/i.test(`${activity.name} ${activity.description ?? ''}`);
}

function findDistance(distanceMeters: number): PerformanceDistance | null {
  for (const [key, config] of Object.entries(PERFORMANCE_DISTANCES) as Array<[
    PerformanceDistance,
    { meters: number; label: string },
  ]>) {
    if (Math.abs(distanceMeters - config.meters) / config.meters <= RECORD_DISTANCE_TOLERANCE[key]) {
      return key;
    }
  }
  return null;
}

function projectTime(timeSeconds: number, fromMeters: number, toMeters: number): number {
  return timeSeconds * Math.pow(toMeters / fromMeters, RIEGEL_EXPONENT);
}

function resolveProfileFiveKSeconds(profilePBs?: Partial<UserProfilePBs> | null): number | null {
  if (!profilePBs) return null;
  if (isPositiveFinite(profilePBs['5k'])) return profilePBs['5k'];

  for (const key of ['10k', '21k', '42k'] as PerformanceDistance[]) {
    const value = profilePBs[key];
    if (isPositiveFinite(value)) {
      return Math.round(projectTime(value, PERFORMANCE_DISTANCES[key].meters, 5_000));
    }
  }
  return null;
}

function calculateRawVDOT(distanceMeters: number, durationSeconds: number): number | null {
  if (!isPositiveFinite(distanceMeters) || !isPositiveFinite(durationSeconds)) return null;
  const minutes = durationSeconds / 60;
  const velocity = distanceMeters / minutes;
  const oxygenCost = -4.6 + 0.182258 * velocity + 0.000104 * velocity * velocity;
  const sustainableFraction = 0.8
    + 0.1894393 * Math.exp(-0.012778 * minutes)
    + 0.2989558 * Math.exp(-0.1932605 * minutes);
  const vdot = oxygenCost / sustainableFraction;
  return Number.isFinite(vdot) ? vdot : null;
}

/** Daniels VDOT estimate from a sustained performance. */
export function calculateVDOT(distanceMeters: number, durationSeconds: number): number | null {
  const vdot = calculateRawVDOT(distanceMeters, durationSeconds);
  if (vdot === null || vdot < 15 || vdot > 90) return null;
  return vdot;
}

export function predictTimeFromVDOT(vdot: number, distance: PerformanceDistance): number | null {
  if (!Number.isFinite(vdot) || vdot < 15 || vdot > 90) return null;
  const distanceMeters = PERFORMANCE_DISTANCES[distance].meters;
  let fast = Math.max(120, distanceMeters / 10);
  let slow = 8 * 60 * 60;

  for (let index = 0; index < 55; index += 1) {
    const middle = (fast + slow) / 2;
    const middleVDOT = calculateRawVDOT(distanceMeters, middle);
    if (middleVDOT === null) return null;
    if (middleVDOT > vdot) {
      fast = middle;
    } else {
      slow = middle;
    }
  }
  return Math.round((fast + slow) / 2);
}

function getHeatDurationFactor(activity: StravaActivity): number {
  const severity = buildActivityWeatherContext(activity).thermalSeverity;
  if (severity === 'heat-stress') return 0.955;
  if (severity === 'heat-load') return 0.975;
  if (severity === 'muggy') return 0.992;
  return 1;
}

function createEvidence({
  activity,
  source,
  distanceMeters,
  durationSeconds,
  confidence,
  prRank = null,
  minimumVDOT = null,
}: {
  activity: StravaActivity;
  source: PerformanceEvidenceSource;
  distanceMeters: number;
  durationSeconds: number;
  confidence: number;
  prRank?: number | null;
  minimumVDOT?: number | null;
}): PerformanceEvidence | null {
  if (!isPositiveFinite(distanceMeters) || !isPositiveFinite(durationSeconds)) return null;
  const pace = durationSeconds / (distanceMeters / 1000);
  if (pace < 120 || pace > 900) return null;

  const heatFactor = getHeatDurationFactor(activity);
  const normalizedDurationSeconds = durationSeconds * heatFactor;
  const rawVDOT = calculateVDOT(distanceMeters, normalizedDurationSeconds);
  if (rawVDOT === null) return null;
  const vdot = minimumVDOT === null ? rawVDOT : Math.max(rawVDOT, minimumVDOT);
  const timestamp = getTimestamp(activity);
  if (!timestamp) return null;

  return {
    activityId: activity.id,
    activityName: activity.name,
    timestamp,
    date: formatDateKey(timestamp),
    source,
    distanceMeters,
    durationSeconds,
    normalizedDurationSeconds,
    vdot,
    confidence,
    prRank,
    heatAdjusted: heatFactor < 1,
  };
}

function getFallbackFiveKSeconds(activities: StravaActivity[]): number | null {
  const candidates: number[] = [];
  for (const activity of activities) {
    for (const effort of activity.best_efforts ?? []) {
      if (Math.abs(effort.distance - 5_000) / 5_000 <= 0.06 && isPositiveFinite(effort.elapsed_time)) {
        candidates.push(effort.elapsed_time * 5_000 / effort.distance);
      }
    }
    if (
      isPositiveFinite(activity.distance)
      && isPositiveFinite(activity.moving_time)
      && Math.abs(activity.distance - 5_000) / 5_000 <= 0.08
    ) {
      candidates.push(activity.moving_time * 5_000 / activity.distance);
    }
  }
  return candidates.length > 0 ? Math.round(Math.min(...candidates)) : null;
}

function extractActivityEvidence(
  activity: StravaActivity,
  qualityPaceCeilingSecondsPerKm: number | null,
  referenceVDOT: number | null,
  heartRateProfile: { maxHeartRate?: number | null; lthr?: number | null }
): PerformanceEvidence[] {
  if (!isRun(activity) || activity.manual || activity.flagged) return [];
  const candidates: PerformanceEvidence[] = [];
  const race = isRace(activity);
  const qualityFloorVDOT = referenceVDOT === null ? null : referenceVDOT - 0.8;

  for (const effort of activity.best_efforts ?? []) {
    if (effort.distance < 2_850 || !findDistance(effort.distance)) continue;
    const effortDuration = effort.moving_time || effort.elapsed_time;
    const effortPace = effortDuration / (effort.distance / 1000);
    const isRankedEffort = isPositiveFinite(effort.pr_rank) && effort.pr_rank <= 3;
    const qualifiesByPace = qualityPaceCeilingSecondsPerKm !== null
      && effortPace <= qualityPaceCeilingSecondsPerKm;

    // Strava exposes a "best effort" for many ordinary runs. It is only
    // performance evidence when it is a ranked result, race, or true quality pace.
    if (!isRankedEffort && !race && !qualifiesByPace) continue;
    const evidence = createEvidence({
      activity,
      source: 'best-effort',
      distanceMeters: effort.distance,
      durationSeconds: effortDuration,
      confidence: effort.pr_rank === 1
        ? 1
        : isRankedEffort
          ? 0.95
          : race
            ? 0.93
            : 0.84,
      prRank: effort.pr_rank,
      minimumVDOT: race || effort.pr_rank === 1 ? null : qualityFloorVDOT,
    });
    if (evidence) candidates.push(evidence);
  }

  const activityPace = activity.moving_time / (activity.distance / 1000);
  const standardDistance = findDistance(activity.distance);
  const qualifiesByPace = qualityPaceCeilingSecondsPerKm !== null
    && activityPace <= qualityPaceCeilingSecondsPerKm;
  const isMarathonLongRun = isMarathonLongRunActivity(activity);
  const averageHeartRate = activity.average_heartrate;
  const lthrRatio = isPositiveFinite(averageHeartRate) && isPositiveFinite(heartRateProfile.lthr)
    ? averageHeartRate / heartRateProfile.lthr
    : null;
  const maxHeartRateRatio = isPositiveFinite(averageHeartRate) && isPositiveFinite(heartRateProfile.maxHeartRate)
    ? averageHeartRate / heartRateProfile.maxHeartRate
    : null;
  const longRunHasStrongCardiacEvidence = (lthrRatio !== null && lthrRatio >= 0.86)
    || (maxHeartRateRatio !== null && maxHeartRateRatio >= 0.82);
  const longRunConfidence = longRunHasStrongCardiacEvidence
    ? 0.8
    : qualifiesByPace
      ? 0.74
      : 0.62;
  const longRunMinimumVDOT = referenceVDOT === null ? null : referenceVDOT - 2;

  if (
    isPositiveFinite(activity.distance)
    && isPositiveFinite(activity.moving_time)
    && activity.distance >= 2_850
    && !isTrailRun(activity)
    && (
      race
      || (standardDistance && qualifiesByPace)
      || (activity.workout_type === 3 && qualifiesByPace)
      || isMarathonLongRun
    )
  ) {
    const source: PerformanceEvidenceSource = race
      ? 'race'
      : isMarathonLongRun
        ? 'long-run'
        : 'distance-effort';
    const evidence = createEvidence({
      activity,
      source,
      distanceMeters: activity.distance,
      durationSeconds: activity.moving_time,
      confidence: race
        ? 0.97
        : isMarathonLongRun
          ? longRunConfidence
          : activity.workout_type === 3
            ? 0.72
            : 0.64,
      minimumVDOT: race
        ? null
        : isMarathonLongRun
          ? longRunMinimumVDOT
          : qualityFloorVDOT,
    });
    if (evidence) candidates.push(evidence);
  }

  if (!isTrailRun(activity) && qualityPaceCeilingSecondsPerKm !== null) {
    const block = getKeySustainedEffort(activity, qualityPaceCeilingSecondsPerKm);
    if (block) {
      const evidence = createEvidence({
        activity,
        source: 'quality-block',
        distanceMeters: block.distanceMeters,
        durationSeconds: block.movingTimeSeconds,
        confidence: block.officialBestEffortElapsedSeconds ? 0.86 : 0.68,
        minimumVDOT: qualityFloorVDOT,
      });
      if (evidence) candidates.push(evidence);
    }
  }

  const deduped = new Map<string, PerformanceEvidence>();
  for (const evidence of candidates) {
    const distance = findDistance(evidence.distanceMeters) ?? `${Math.round(evidence.distanceMeters / 1000)}k`;
    const key = `${evidence.activityId}:${distance}`;
    const existing = deduped.get(key);
    if (!existing || evidence.confidence > existing.confidence) deduped.set(key, evidence);
  }
  return [...deduped.values()];
}

function selectOneEvidencePerActivity(evidence: PerformanceEvidence[]): PerformanceEvidence[] {
  const byActivity = new Map<number, PerformanceEvidence>();
  const sourcePriority: Record<PerformanceEvidenceSource, number> = {
    'best-effort': 4,
    race: 3,
    'quality-block': 2,
    'long-run': 1.5,
    'distance-effort': 1,
  };

  for (const item of evidence) {
    const existing = byActivity.get(item.activityId);
    if (!existing) {
      byActivity.set(item.activityId, item);
      continue;
    }
    const itemScore = sourcePriority[item.source] * 10 + item.confidence + Math.min(item.distanceMeters, 10_000) / 100_000;
    const existingScore = sourcePriority[existing.source] * 10 + existing.confidence + Math.min(existing.distanceMeters, 10_000) / 100_000;
    if (itemScore > existingScore) byActivity.set(item.activityId, item);
  }
  return [...byActivity.values()];
}

function weightedQuantile(
  items: Array<{ evidence: PerformanceEvidence; weight: number }>,
  quantile: number
): number {
  const sorted = [...items].sort((a, b) => a.evidence.vdot - b.evidence.vdot);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  const target = totalWeight * quantile;
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= target) return item.evidence.vdot;
  }
  return sorted[sorted.length - 1].evidence.vdot;
}

function estimateSnapshot(
  evidence: PerformanceEvidence[],
  timestamp: number,
  previousVDOT: number | null
): PerformanceSnapshot | null {
  const windowStart = timestamp - EVIDENCE_WINDOW_DAYS * DAY_MS;
  const candidates = selectOneEvidencePerActivity(
    evidence.filter((item) => item.timestamp <= timestamp && item.timestamp >= windowStart)
  );
  if (candidates.length === 0) return null;

  const weighted = candidates.map((item) => {
    const ageDays = Math.max(0, (timestamp - item.timestamp) / DAY_MS);
    return {
      evidence: item,
      weight: item.confidence * Math.exp(-ageDays / DECAY_DAYS),
    };
  });
  const bestVDOT = Math.max(...candidates.map((item) => item.vdot));
  const credible = weighted.filter((item) => item.evidence.vdot >= bestVDOT - 4.5);
  const quantileVDOT = weightedQuantile(credible, 0.72);
  const recentHighConfidence = credible
    .filter((item) => item.evidence.confidence >= 0.9 && timestamp - item.evidence.timestamp <= 56 * DAY_MS)
    .sort((a, b) => b.evidence.vdot - a.evidence.vdot)[0]?.evidence;
  let rawVDOT = recentHighConfidence
    ? quantileVDOT * 0.62 + recentHighConfidence.vdot * 0.38
    : quantileVDOT;

  if (previousVDOT !== null) {
    rawVDOT = previousVDOT * 0.42 + rawVDOT * 0.58;
    rawVDOT = Math.min(previousVDOT + 2.2, Math.max(previousVDOT - 1.2, rawVDOT));
  }

  const latestTimestamp = Math.max(...candidates.map((item) => item.timestamp));
  const latestEvidenceDays = Math.max(0, Math.round((timestamp - latestTimestamp) / DAY_MS));
  const highConfidenceCount = candidates.filter((item) => item.confidence >= 0.88).length;
  const confidence: PerformanceConfidence = highConfidenceCount >= 2 && candidates.length >= 3 && latestEvidenceDays <= 28
    ? 'high'
    : (candidates.length >= 2 && latestEvidenceDays <= 42) || (highConfidenceCount >= 1 && latestEvidenceDays <= 28)
      ? 'medium'
      : 'low';
  const confidenceScore = Math.min(96, Math.round(
    26
      + Math.min(candidates.length, 5) * 9
      + highConfidenceCount * 10
      + Math.max(0, 18 - latestEvidenceDays * 0.5)
  ));
  const rankedEvidence = [...candidates].sort((a, b) => {
    const scoreA = a.confidence * Math.exp(-(timestamp - a.timestamp) / DAY_MS / DECAY_DAYS) * a.vdot;
    const scoreB = b.confidence * Math.exp(-(timestamp - b.timestamp) / DAY_MS / DECAY_DAYS) * b.vdot;
    return scoreB - scoreA;
  });
  const primaryEvidence = rankedEvidence[0];

  return {
    timestamp,
    date: formatDateKey(timestamp),
    vdot: Math.round(rawVDOT * 10) / 10,
    confidence,
    confidenceScore,
    evidenceCount: candidates.length,
    latestEvidenceDays,
    primaryEvidence,
    evidence: rankedEvidence,
  };
}

function buildSnapshots(evidence: PerformanceEvidence[], endTimestamp: number): PerformanceSnapshot[] {
  const startTimestamp = endTimestamp - SNAPSHOT_WEEKS * WEEK_MS;
  const snapshots: PerformanceSnapshot[] = [];
  let previousVDOT: number | null = null;

  for (let index = 0; index <= SNAPSHOT_WEEKS; index += 1) {
    const timestamp = index === SNAPSHOT_WEEKS
      ? endTimestamp
      : startTimestamp + index * WEEK_MS;
    const snapshot = estimateSnapshot(evidence, timestamp, previousVDOT);
    if (!snapshot) continue;
    snapshots.push(snapshot);
    previousVDOT = snapshot.vdot;
  }

  return snapshots;
}

function getCurrentSnapshot(
  snapshots: PerformanceSnapshot[],
  endTimestamp: number
): PerformanceSnapshot | null {
  const latest = snapshots.at(-1) ?? null;
  return latest?.timestamp === endTimestamp ? latest : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getDurabilityScore(activity: StravaActivity): number | null {
  const splits = (activity.splits_metric ?? []).filter((split) => {
    const duration = split.moving_time || split.elapsed_time;
    const pace = duration / (split.distance / 1000);
    return split.distance >= 500 && isPositiveFinite(duration) && pace >= 150 && pace <= 900;
  });
  if (splits.length < 6) return null;

  const sampleSize = Math.max(2, Math.floor(splits.length / 3));
  const first = splits.slice(0, sampleSize);
  const last = splits.slice(-sampleSize);
  const weightedPace = (items: typeof splits): number => {
    const distance = items.reduce((sum, split) => sum + split.distance, 0);
    const duration = items.reduce((sum, split) => sum + (split.moving_time || split.elapsed_time), 0);
    return duration / (distance / 1000);
  };
  const weightedHeartRate = (items: typeof splits): number | null => {
    const withHeartRate = items.filter((split) => isPositiveFinite(split.average_heartrate));
    if (withHeartRate.length < Math.ceil(items.length * 0.6)) return null;
    const duration = withHeartRate.reduce((sum, split) => sum + (split.moving_time || split.elapsed_time), 0);
    return withHeartRate.reduce(
      (sum, split) => sum + (split.average_heartrate ?? 0) * (split.moving_time || split.elapsed_time),
      0
    ) / duration;
  };

  const paceRatio = weightedPace(last) / weightedPace(first);
  const firstHeartRate = weightedHeartRate(first);
  const lastHeartRate = weightedHeartRate(last);
  const heartRateDelta = firstHeartRate !== null && lastHeartRate !== null
    ? lastHeartRate - firstHeartRate
    : null;

  if (paceRatio <= 0.98) return 10;
  if (paceRatio <= 1.03) return 9;
  if (paceRatio <= 1.06) return 7;
  if (heartRateDelta !== null && heartRateDelta <= -5) return 7;
  if (heartRateDelta !== null && heartRateDelta <= 2) return 5;
  const fadePenalty = (paceRatio - 1.06) * 28 + Math.max(0, heartRateDelta ?? 4) * 0.08;
  return Math.round(clamp(5 - fadePenalty, 1, 5) * 10) / 10;
}

function calculateMarathonReadiness(
  activities: StravaActivity[],
  endTimestamp: number
): MarathonReadiness {
  const windowStart = endTimestamp - EVIDENCE_WINDOW_DAYS * DAY_MS;
  const runs = activities.filter((activity) => {
    const timestamp = getTimestamp(activity);
    return isRun(activity)
      && !activity.manual
      && !activity.flagged
      && timestamp >= windowStart
      && timestamp <= endTimestamp;
  });

  const recentEightWeekDistances = Array.from({ length: 8 }, () => 0);
  for (const activity of runs) {
    const ageWeeks = Math.floor((endTimestamp - getTimestamp(activity)) / WEEK_MS);
    if (ageWeeks >= 0 && ageWeeks < recentEightWeekDistances.length) {
      recentEightWeekDistances[ageWeeks] += activity.distance / 1000;
    }
  }
  const recentWeeklyKm = recentEightWeekDistances.reduce((sum, value) => sum + value, 0) / 8;
  const activeWeeks = recentEightWeekDistances.filter((value) => value >= 5).length;
  const averageWeek = recentWeeklyKm;
  const variance = recentEightWeekDistances.reduce(
    (sum, value) => sum + Math.pow(value - averageWeek, 2),
    0
  ) / recentEightWeekDistances.length;
  const variation = averageWeek > 0 ? Math.sqrt(variance) / averageWeek : 1;

  const longRuns = runs.filter(isMarathonLongRunActivity);
  const maxLongRun = [...runs].sort((a, b) => b.distance - a.distance)[0] ?? null;
  const maxLongRunMeters = maxLongRun?.distance ?? 0;
  const maxLongRunAgeDays = maxLongRun
    ? Math.max(0, (endTimestamp - getTimestamp(maxLongRun)) / DAY_MS)
    : EVIDENCE_WINDOW_DAYS;
  const ninetyMinuteRuns = runs.filter((activity) => activity.moving_time >= 90 * 60);
  const durabilitySamples = runs
    .filter((activity) => activity.distance >= 20_000 || activity.moving_time >= 2 * 60 * 60)
    .map((activity) => ({ score: getDurabilityScore(activity), timestamp: getTimestamp(activity) }))
    .filter((sample): sample is { score: number; timestamp: number } => sample.score !== null)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);
  const durabilityScores = durabilitySamples.map((sample) => sample.score);
  const durabilityScore = durabilityScores.length > 0
    ? durabilityScores.reduce((sum, value) => sum + value, 0) / durabilityScores.length
    : null;

  const weeklyVolumeScore = clamp(recentWeeklyKm / 55, 0, 1) * 25;
  const longRunDistanceScore = maxLongRunMeters < 20_000
    ? 0
    : maxLongRunMeters < 24_000
      ? 6 + (maxLongRunMeters - 20_000) / 4_000 * 6
      : maxLongRunMeters < 28_000
        ? 12 + (maxLongRunMeters - 24_000) / 4_000 * 10
        : maxLongRunMeters < 32_000
          ? 22 + (maxLongRunMeters - 28_000) / 4_000 * 9
          : clamp(31 + (maxLongRunMeters - 32_000) / 3_000 * 2, 31, 33);
  const recencyFactor = clamp(1 - Math.max(0, maxLongRunAgeDays - 21) / 210, 0.7, 1);
  const longRunScore = clamp(
    longRunDistanceScore * recencyFactor + Math.min(2, Math.max(0, longRuns.length - 1)) * 1.5,
    0,
    35
  );
  const durationScore = clamp(ninetyMinuteRuns.length / 4, 0, 1) * 12
    + clamp(runs.filter((activity) => activity.moving_time >= 150 * 60).length, 0, 2) * 1.5;
  const consistencyScore = activeWeeks / 8 * 10 + clamp(1 - variation, 0, 1) * 5;
  const resolvedDurabilityScore = durabilityScore ?? (longRuns.length > 0 ? 6 : 4);
  const score = Math.round(clamp(
    weeklyVolumeScore + longRunScore + durationScore + consistencyScore + resolvedDurabilityScore,
    0,
    100
  ));
  const confidence: PerformanceConfidence = longRuns.length >= 2
    && ninetyMinuteRuns.length >= 4
    && durabilityScores.length >= 1
    && activeWeeks >= 6
    ? 'high'
    : (longRuns.length >= 1 || ninetyMinuteRuns.length >= 2) && activeWeeks >= 4
      ? 'medium'
      : 'low';
  const status: MarathonReadinessStatus = score >= 85
    ? 'ready'
    : score >= 70
      ? 'solid'
      : score >= 55
        ? 'building'
        : 'limited';

  return {
    score,
    status,
    confidence,
    adjustmentPercent: clamp((90 - score) * 0.0015, 0, 0.09),
    recentWeeklyKm: Math.round(recentWeeklyKm * 10) / 10,
    activeWeeks,
    longRunCount: longRuns.length,
    maxLongRunMeters,
    ninetyMinuteRunCount: ninetyMinuteRuns.length,
    durabilitySampleCount: durabilityScores.length,
    durabilityScore: durabilityScore === null ? null : Math.round(durabilityScore * 10) / 10,
  };
}

function combineConfidence(
  first: PerformanceConfidence,
  second: PerformanceConfidence
): PerformanceConfidence {
  const values: Record<PerformanceConfidence, number> = { low: 0, medium: 1, high: 2 };
  return values[first] <= values[second] ? first : second;
}

function buildMarathonProjection(
  speedSnapshot: PerformanceSnapshot | null,
  readiness: MarathonReadiness
): MarathonProjection | null {
  if (!speedSnapshot) return null;
  const speedPotentialSeconds = predictTimeFromVDOT(speedSnapshot.vdot, '42k');
  if (!speedPotentialSeconds) return null;
  const enduranceAdjustmentSeconds = Math.round(speedPotentialSeconds * readiness.adjustmentPercent);
  const estimatedSeconds = speedPotentialSeconds + enduranceAdjustmentSeconds;
  const confidence = combineConfidence(speedSnapshot.confidence, readiness.confidence);
  const rangePercent = confidence === 'high' ? 0.018 : confidence === 'medium' ? 0.03 : 0.05;

  return {
    speedPotentialSeconds,
    enduranceAdjustmentSeconds,
    estimatedSeconds,
    lowerSeconds: Math.max(
      speedPotentialSeconds,
      Math.round(estimatedSeconds * (1 - rangePercent * 0.4))
    ),
    upperSeconds: Math.round(estimatedSeconds * (1 + rangePercent)),
    confidence,
    readiness,
  };
}

function isEvidenceRelevantForDistance(
  evidence: PerformanceEvidence,
  distance: PerformanceDistance
): boolean {
  if (evidence.source === 'long-run') return distance === '42k';
  return evidence.distanceMeters >= MIN_RELEVANT_EVIDENCE_METERS[distance];
}

function toAuditItem(
  evidence: PerformanceEvidence,
  dimension: PerformanceEvidenceDimension
): PerformanceEvidenceAuditItem {
  return {
    activityId: evidence.activityId,
    activityName: evidence.activityName,
    timestamp: evidence.timestamp,
    date: evidence.date,
    distanceMeters: evidence.distanceMeters,
    durationSeconds: evidence.durationSeconds,
    dimension,
    source: evidence.source,
    exclusionReason: null,
  };
}

function buildEvidenceAudit({
  activities,
  evidence,
  distanceSnapshot,
  speedSnapshot,
  distance,
  endTimestamp,
}: {
  activities: StravaActivity[];
  evidence: PerformanceEvidence[];
  distanceSnapshot: PerformanceSnapshot | null;
  speedSnapshot: PerformanceSnapshot | null;
  distance: PerformanceDistance;
  endTimestamp: number;
}): PerformanceEvidenceAudit {
  const includedEvidence = distance === '42k'
    ? [
      ...(speedSnapshot?.evidence ?? []).map((item) => ({ item, dimension: 'speed' as const })),
      ...(distanceSnapshot?.evidence ?? [])
        .filter((item) => item.source === 'long-run')
        .map((item) => ({ item, dimension: 'endurance' as const })),
    ]
    : (distanceSnapshot?.evidence ?? []).map((item) => ({ item, dimension: 'speed' as const }));
  const includedByActivity = new Map<number, PerformanceEvidenceAuditItem>();
  for (const { item, dimension } of includedEvidence) {
    if (item.activityId === 0) continue;
    const existing = includedByActivity.get(item.activityId);
    if (!existing || dimension === 'endurance' || item.confidence > (evidence.find((candidate) => (
      candidate.activityId === existing.activityId && candidate.source === existing.source
    ))?.confidence ?? 0)) {
      includedByActivity.set(item.activityId, toAuditItem(item, dimension));
    }
  }

  const windowStart = endTimestamp - EVIDENCE_WINDOW_DAYS * DAY_MS;
  const excludedByActivity = new Map<number, PerformanceEvidenceAuditItem>();
  const relevantEvidence = distance === '42k'
    ? evidence
    : evidence.filter((item) => isEvidenceRelevantForDistance(item, distance));
  for (const item of relevantEvidence) {
    if (includedByActivity.has(item.activityId) || item.timestamp > endTimestamp) continue;
    excludedByActivity.set(item.activityId, {
      ...toAuditItem(item, item.source === 'long-run' ? 'endurance' : 'speed'),
      exclusionReason: item.timestamp < windowStart ? 'outside-window' : 'no-quality-signal',
    });
  }

  const minimumCandidateDistance = distance === '42k'
    ? 5_000
    : Math.min(5_000, MIN_RELEVANT_EVIDENCE_METERS[distance]);
  for (const activity of activities) {
    if (includedByActivity.has(activity.id) || excludedByActivity.has(activity.id) || !isRun(activity)) continue;
    const timestamp = getTimestamp(activity);
    if (!timestamp || timestamp < windowStart || timestamp > endTimestamp) continue;
    if (activity.distance < minimumCandidateDistance) continue;
    const exclusionReason: PerformanceExclusionReason = activity.manual || activity.flagged
      ? 'manual-or-flagged'
      : isTrailRun(activity)
        ? 'trail-run'
        : activity.distance < MIN_RELEVANT_EVIDENCE_METERS[distance] && distance !== '42k'
          ? 'insufficient-distance'
          : 'no-quality-signal';
    excludedByActivity.set(activity.id, {
      activityId: activity.id,
      activityName: activity.name,
      timestamp,
      date: formatDateKey(timestamp),
      distanceMeters: activity.distance,
      durationSeconds: activity.moving_time,
      dimension: null,
      source: null,
      exclusionReason,
    });
  }

  return {
    included: [...includedByActivity.values()].sort((a, b) => b.timestamp - a.timestamp),
    excluded: [...excludedByActivity.values()].sort((a, b) => b.timestamp - a.timestamp),
  };
}

function getDirectRecordCandidates(activity: StravaActivity): PerformanceRecordEvent[] {
  if (!isRun(activity) || activity.manual || activity.flagged) return [];
  const timestamp = getTimestamp(activity);
  if (!timestamp) return [];
  const candidates: PerformanceRecordEvent[] = [];

  for (const effort of activity.best_efforts ?? []) {
    const distance = findDistance(effort.distance);
    if (!distance || !isPositiveFinite(effort.elapsed_time)) continue;
    candidates.push({
      activityId: activity.id,
      activityName: activity.name,
      timestamp,
      date: formatDateKey(timestamp),
      distance,
      durationSeconds: Math.round(effort.elapsed_time * PERFORMANCE_DISTANCES[distance].meters / effort.distance),
      prRank: effort.pr_rank ?? null,
      source: 'best-effort',
    });
  }

  const distance = findDistance(activity.distance);
  if (distance && !isTrailRun(activity) && isPositiveFinite(activity.moving_time)) {
    candidates.push({
      activityId: activity.id,
      activityName: activity.name,
      timestamp,
      date: formatDateKey(timestamp),
      distance,
      durationSeconds: Math.round(activity.moving_time * PERFORMANCE_DISTANCES[distance].meters / activity.distance),
      prRank: null,
      source: isRace(activity) ? 'race' : 'distance-effort',
    });
  }

  const bestByDistance = new Map<PerformanceDistance, PerformanceRecordEvent>();
  for (const candidate of candidates) {
    const existing = bestByDistance.get(candidate.distance);
    if (!existing || candidate.durationSeconds < existing.durationSeconds) {
      bestByDistance.set(candidate.distance, candidate);
    }
  }
  return [...bestByDistance.values()];
}

function buildRecords(
  activities: StravaActivity[],
  profilePBs?: Partial<UserProfilePBs> | null
): {
  recordEvents: Record<PerformanceDistance, PerformanceRecordEvent[]>;
  records: Record<PerformanceDistance, PerformanceRecord | null>;
} {
  const recordEvents: Record<PerformanceDistance, PerformanceRecordEvent[]> = {
    '5k': [],
    '10k': [],
    '21k': [],
    '42k': [],
  };
  const bestTimes = new Map<PerformanceDistance, number>();

  for (const activity of [...activities].sort((a, b) => getTimestamp(a) - getTimestamp(b))) {
    for (const candidate of getDirectRecordCandidates(activity)) {
      const previous = bestTimes.get(candidate.distance);
      if (previous === undefined || candidate.durationSeconds < previous) {
        bestTimes.set(candidate.distance, candidate.durationSeconds);
        recordEvents[candidate.distance].push(candidate);
      }
    }
  }

  const records = Object.fromEntries(
    (Object.keys(PERFORMANCE_DISTANCES) as PerformanceDistance[]).map((distance) => {
      const events = recordEvents[distance];
      const event = events[events.length - 1] ?? null;
      const activityTime = event?.durationSeconds ?? null;
      const profileTime = profilePBs?.[distance];
      if (isPositiveFinite(profileTime) && (activityTime === null || profileTime < activityTime)) {
        return [distance, {
          distance,
          durationSeconds: profileTime,
          source: 'profile' as const,
          event: null,
        }];
      }
      return [distance, event ? {
        distance,
        durationSeconds: event.durationSeconds,
        source: 'activity' as const,
        event,
      } : null];
    })
  ) as Record<PerformanceDistance, PerformanceRecord | null>;

  return { recordEvents, records };
}

function createProfileFallbackSnapshot(
  profileFiveKSeconds: number,
  endTimestamp: number
): PerformanceSnapshot | null {
  const profileVDOT = calculateVDOT(5_000, profileFiveKSeconds);
  if (profileVDOT === null) return null;
  const fallbackEvidence: PerformanceEvidence = {
    activityId: 0,
    activityName: 'Runner profile',
    timestamp: endTimestamp,
    date: formatDateKey(endTimestamp),
    source: 'distance-effort',
    distanceMeters: 5_000,
    durationSeconds: profileFiveKSeconds,
    normalizedDurationSeconds: profileFiveKSeconds,
    vdot: profileVDOT,
    confidence: 0.5,
    prRank: null,
    heatAdjusted: false,
  };
  return {
    timestamp: endTimestamp,
    date: formatDateKey(endTimestamp),
    vdot: Math.round(profileVDOT * 10) / 10,
    confidence: 'low',
    confidenceScore: 40,
    evidenceCount: 1,
    latestEvidenceDays: 0,
    primaryEvidence: fallbackEvidence,
    evidence: [fallbackEvidence],
  };
}

export function calculatePerformanceTrend({
  activities,
  profilePBs,
  maxHeartRate,
  lthr,
  now = new Date(),
}: {
  activities: StravaActivity[];
  profilePBs?: Partial<UserProfilePBs> | null;
  maxHeartRate?: number | null;
  lthr?: number | null;
  now?: Date;
}): PerformanceTrend {
  const runs = activities.filter(isRun);
  const profileFiveKSeconds = resolveProfileFiveKSeconds(profilePBs);
  const referenceFiveKSeconds = profileFiveKSeconds ?? getFallbackFiveKSeconds(runs);
  const referenceVDOT = referenceFiveKSeconds
    ? calculateVDOT(5_000, referenceFiveKSeconds)
    : null;
  const qualityPaceCeiling = referenceFiveKSeconds
    ? calculateSemanticPaceZones(referenceFiveKSeconds).marathon.max
    : null;
  const evidence = runs
    .flatMap((activity) => extractActivityEvidence(
      activity,
      qualityPaceCeiling,
      referenceVDOT,
      { maxHeartRate, lthr }
    ))
    .sort((a, b) => a.timestamp - b.timestamp);
  const { recordEvents, records } = buildRecords(runs, profilePBs);

  const endTimestamp = now.getTime();
  const snapshots = buildSnapshots(evidence, endTimestamp);
  const speedSnapshots = buildSnapshots(
    evidence.filter((item) => item.source !== 'long-run'),
    endTimestamp
  );
  const distanceSnapshots = Object.fromEntries(
    (Object.keys(PERFORMANCE_DISTANCES) as PerformanceDistance[]).map((distance) => [
      distance,
      buildSnapshots(
        evidence.filter((item) => isEvidenceRelevantForDistance(item, distance)),
        endTimestamp
      ),
    ])
  ) as Record<PerformanceDistance, PerformanceSnapshot[]>;

  if (profileFiveKSeconds) {
    const fallbackSnapshot = createProfileFallbackSnapshot(profileFiveKSeconds, endTimestamp);
    if (fallbackSnapshot && snapshots.length === 0) snapshots.push(fallbackSnapshot);
    if (fallbackSnapshot && speedSnapshots.length === 0) speedSnapshots.push(fallbackSnapshot);
  }

  const speedSnapshot = getCurrentSnapshot(speedSnapshots, endTimestamp);
  const marathonReadiness = calculateMarathonReadiness(runs, endTimestamp);
  const marathonProjection = buildMarathonProjection(speedSnapshot, marathonReadiness);
  const audits = Object.fromEntries(
    (Object.keys(PERFORMANCE_DISTANCES) as PerformanceDistance[]).map((distance) => [
      distance,
      buildEvidenceAudit({
        activities: runs,
        evidence,
        distanceSnapshot: getCurrentSnapshot(distanceSnapshots[distance], endTimestamp),
        speedSnapshot,
        distance,
        endTimestamp,
      }),
    ])
  ) as Record<PerformanceDistance, PerformanceEvidenceAudit>;

  return {
    snapshots,
    speedSnapshots,
    distanceSnapshots,
    evidence,
    audits,
    marathonProjection,
    recordEvents,
    records,
    profileFiveKSeconds,
  };
}

export function getActivityPerformanceImpact(
  trend: PerformanceTrend,
  activityId: number
): ActivityPerformanceImpact | null {
  for (const distance of Object.keys(PERFORMANCE_DISTANCES) as PerformanceDistance[]) {
    const event = trend.recordEvents[distance].find((candidate) => candidate.activityId === activityId);
    if (event?.prRank === 1) {
      return {
        kind: 'pb',
        activityId,
        distance,
        durationSeconds: event.durationSeconds,
        predictedImprovementSeconds: 0,
        heatAdjusted: trend.evidence.some((item) => item.activityId === activityId && item.heatAdjusted),
      };
    }
  }

  const activityEvidence = trend.evidence
    .filter((item) => item.activityId === activityId)
    .sort((a, b) => b.confidence - a.confidence || b.vdot - a.vdot)[0];
  if (
    !activityEvidence
    || activityEvidence.source === 'distance-effort'
    || activityEvidence.source === 'long-run'
  ) return null;

  const previousEvidence = trend.evidence.filter((item) => (
    item.timestamp < activityEvidence.timestamp
    && item.timestamp >= activityEvidence.timestamp - EVIDENCE_WINDOW_DAYS * DAY_MS
  ));
  const previousSnapshot = estimateSnapshot(previousEvidence, activityEvidence.timestamp - 1, null);
  if (!previousSnapshot || activityEvidence.vdot <= previousSnapshot.vdot + 0.35) return null;

  const previousFiveK = predictTimeFromVDOT(previousSnapshot.vdot, '5k');
  const currentFiveK = predictTimeFromVDOT(
    previousSnapshot.vdot * 0.42 + activityEvidence.vdot * 0.58,
    '5k'
  );
  const improvement = previousFiveK && currentFiveK ? previousFiveK - currentFiveK : 0;
  if (improvement < 5) return null;

  const directDistance = findDistance(activityEvidence.distanceMeters) ?? '5k';
  return {
    kind: 'ability',
    activityId,
    distance: directDistance,
    durationSeconds: Math.round(activityEvidence.durationSeconds),
    predictedImprovementSeconds: Math.round(improvement),
    heatAdjusted: activityEvidence.heatAdjusted,
  };
}
