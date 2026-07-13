import type { ActivityStream, StravaActivity } from '@/types';
import type { UserProfile } from '@/lib/userProfile';
import { buildActivityWeatherContext } from '@/lib/weather';

export const AI_ANALYSIS_CACHE_VERSION = 'v26';
const AI_ANALYSIS_LEGACY_CACHE_VERSIONS = ['v19', 'v18'];
const AI_ANALYSIS_WORKOUT_TYPE_LEGACY_CACHE_VERSIONS = ['v19', 'v17'];

type HistoryActivity = Pick<
  StravaActivity,
  | 'id'
  | 'distance'
  | 'moving_time'
  | 'elapsed_time'
  | 'total_elevation_gain'
  | 'type'
  | 'sport_type'
  | 'start_date'
  | 'start_date_local'
  | 'average_speed'
  | 'max_speed'
  | 'has_heartrate'
> &
  Partial<
    Pick<
      StravaActivity,
      | 'average_heartrate'
      | 'max_heartrate'
      | 'average_temp'
      | 'workout_type'
      | 'calories'
      | 'splits_metric'
      | 'laps'
      | 'best_efforts'
    >
  >;

interface AIAnalysisCacheKeyInput {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
  historyActivities: HistoryActivity[];
  locale: string;
  profile: UserProfile | null;
  analysisMode?: 'kimi' | 'fallback';
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function roundNumber(value: number | undefined | null, precision = 1): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function getBestEffortsFingerprint(activity: Pick<HistoryActivity, 'best_efforts'>) {
  return activity.best_efforts
    ?.slice(0, 8)
    .map((effort) => ({
      name: effort.name,
      distance: roundNumber(effort.distance, 0),
      elapsedTime: effort.elapsed_time,
      prRank: effort.pr_rank ?? null,
    })) ?? null;
}

function getSplitsFingerprint(activity: Pick<HistoryActivity, 'splits_metric'>) {
  const splits = activity.splits_metric;
  if (!splits || splits.length === 0) return null;
  const first = splits[0];
  const last = splits[splits.length - 1];
  return {
    count: splits.length,
    first: {
      distance: roundNumber(first.distance, 0),
      movingTime: first.moving_time,
      avgHr: roundNumber(first.average_heartrate),
    },
    last: {
      distance: roundNumber(last.distance, 0),
      movingTime: last.moving_time,
      avgHr: roundNumber(last.average_heartrate),
    },
  };
}

function getLapsFingerprint(activity: Pick<HistoryActivity, 'laps'>) {
  const laps = activity.laps;
  if (!laps || laps.length === 0) return null;
  const first = laps[0];
  const last = laps[laps.length - 1];
  return {
    count: laps.length,
    first: {
      distance: roundNumber(first.distance, 0),
      movingTime: first.moving_time,
      avgHr: roundNumber(first.average_heartrate),
    },
    last: {
      distance: roundNumber(last.distance, 0),
      movingTime: last.moving_time,
      avgHr: roundNumber(last.average_heartrate),
    },
  };
}

function getHistoryFingerprint(activities: HistoryActivity[]): string {
  if (activities.length === 0) return 'empty';

  const normalized = activities.map((activity) => ({
    id: activity.id,
    startDate: activity.start_date,
    startDateLocal: activity.start_date_local,
    distance: roundNumber(activity.distance, 0),
    movingTime: activity.moving_time,
    elapsedTime: activity.elapsed_time,
    elevation: roundNumber(activity.total_elevation_gain, 0),
    type: activity.type,
    sportType: activity.sport_type,
    avgSpeed: roundNumber(activity.average_speed, 3),
    maxSpeed: roundNumber(activity.max_speed, 3),
    hasHeartrate: activity.has_heartrate,
    avgHr: roundNumber(activity.average_heartrate),
    maxHr: roundNumber(activity.max_heartrate),
    averageTemp: roundNumber(activity.average_temp),
    workoutType: activity.workout_type ?? null,
    calories: roundNumber(activity.calories, 0),
    bestEfforts: getBestEffortsFingerprint(activity),
    splits: getSplitsFingerprint(activity),
    laps: getLapsFingerprint(activity),
  }));

  return [
    activities.length,
    normalized[0]?.id,
    normalized[normalized.length - 1]?.id,
    hashString(JSON.stringify(normalized)),
  ].join(':');
}

function getStreamSampleFingerprint(stream: ActivityStream) {
  const data = stream.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  const middle = data[Math.floor(data.length / 2)];
  const last = data[data.length - 1];
  return [first, middle, last];
}

function getStreamFingerprint(streams: Record<string, ActivityStream> | null): string {
  if (!streams) return 'none';

  const normalized = Object.keys(streams)
    .sort()
    .map((key) => {
      const stream = streams[key];
      return {
        key,
        type: stream.type,
        originalSize: stream.original_size,
        resolution: stream.resolution,
        seriesType: stream.series_type,
        sample: getStreamSampleFingerprint(stream),
      };
    });

  return hashString(JSON.stringify(normalized));
}

function getWeatherFingerprint(activity: StravaActivity, streams: Record<string, ActivityStream> | null) {
  const weather = buildActivityWeatherContext(activity, streams);
  if (!weather.hasWeather) return null;
  return {
    temperatureC: roundNumber(weather.temperatureC),
    feelsLikeC: roundNumber(weather.feelsLikeC),
    humidityPercent: roundNumber(weather.humidityPercent, 0),
    windSpeedKmh: roundNumber(weather.windSpeedKmh),
    condition: weather.condition ?? null,
    source: weather.source,
    thermalSeverity: weather.thermalSeverity,
  };
}

function buildAIAnalysisCacheKey({
  activity,
  streams,
  historyActivities,
  locale,
  profile,
  analysisMode = 'kimi',
}: AIAnalysisCacheKeyInput, version: string): string {
  const inputFingerprint = {
    version,
    analysisMode,
    activity: {
      id: activity.id,
      distance: roundNumber(activity.distance, 0),
      movingTime: activity.moving_time,
      elapsedTime: activity.elapsed_time,
      startDate: activity.start_date,
      startDateLocal: activity.start_date_local,
      avgHr: roundNumber(activity.average_heartrate),
      maxHr: roundNumber(activity.max_heartrate),
      averageTemp: roundNumber(activity.average_temp),
      weather: getWeatherFingerprint(activity, streams),
      workoutType: activity.workout_type ?? null,
      bestEfforts: getBestEffortsFingerprint(activity),
      splits: getSplitsFingerprint(activity),
      laps: getLapsFingerprint(activity),
    },
    locale,
    profile: profile
      ? {
          pbs: profile.pbs,
          height: profile.height,
          weight: profile.weight,
          lthr: profile.lthr,
          updatedAt: profile.updatedAt,
        }
      : null,
    history: getHistoryFingerprint(historyActivities),
    streams: getStreamFingerprint(streams),
  };

  return `ai_analysis_${version}_${activity.id}_${hashString(JSON.stringify(inputFingerprint))}`;
}

export function getAIAnalysisCacheKey(input: AIAnalysisCacheKeyInput): string {
  return buildAIAnalysisCacheKey(input, AI_ANALYSIS_CACHE_VERSION);
}

export function getLegacyAIAnalysisCacheKeys(input: AIAnalysisCacheKeyInput): string[] {
  const hasClassificationSensitiveStructure = (input.activity.splits_metric?.length ?? 0) >= 3
    || (input.activity.laps?.length ?? 0) >= 2;
  if (hasClassificationSensitiveStructure) return [];

  const versions = input.activity.workout_type === 3
    ? AI_ANALYSIS_WORKOUT_TYPE_LEGACY_CACHE_VERSIONS
    : AI_ANALYSIS_LEGACY_CACHE_VERSIONS;
  return versions.map((version) => buildAIAnalysisCacheKey(input, version));
}
