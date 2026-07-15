import type { ActivityStream, StravaActivity } from '@/types';
import { isUserProfileRangeValue } from '@/lib/userProfile';

export type AnalysisHistoryActivity = Pick<
  StravaActivity,
  | 'id'
  | 'name'
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
  Partial<StravaActivity>;

interface AnalyzeRequestBody {
  activity?: unknown;
  streams?: unknown;
  userProfilePBs?: unknown;
  recentActivities?: unknown;
  locale?: unknown;
  physique?: unknown;
  maxHeartRate?: unknown;
  lthr?: unknown;
  allowThirdPartyAI?: unknown;
}

export interface AIAnalyzeRequestPayload {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
  userProfilePBs: Record<string, number> | null;
  recentActivities?: AnalysisHistoryActivity[];
  locale?: string;
  physique?: { height?: number | null; weight?: number | null };
  maxHeartRate?: number | null;
  lthr?: number | null;
  allowThirdPartyAI: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function isValidActivity(value: unknown): value is StravaActivity {
  if (!isPlainObject(value)) return false;
  return (
    getPositiveNumber(value.id) !== null &&
    typeof value.name === 'string' &&
    getPositiveNumber(value.distance) !== null &&
    getPositiveNumber(value.moving_time) !== null &&
    typeof value.type === 'string' &&
    typeof value.sport_type === 'string' &&
    typeof value.start_date === 'string'
  );
}

function normalizeStreams(value: unknown): Record<string, ActivityStream> | null {
  if (value === undefined || value === null) return null;
  return isPlainObject(value) ? value as Record<string, ActivityStream> : null;
}

function normalizePBs(value: unknown): Record<string, number> | null {
  if (!isPlainObject(value)) return null;

  const pbs: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
      pbs[key] = rawValue;
    }
  }

  return Object.keys(pbs).length > 0 ? pbs : null;
}

function normalizePhysique(value: unknown): { height?: number | null; weight?: number | null } | undefined {
  if (!isPlainObject(value)) return undefined;

  const height = getPositiveNumber(value.height);
  const weight = getPositiveNumber(value.weight);
  return {
    height: height !== null && isUserProfileRangeValue('height', height) ? height : null,
    weight: weight !== null && isUserProfileRangeValue('weight', weight) ? weight : null,
  };
}

function normalizeLthr(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || !isUserProfileRangeValue('lthr', value)) {
    return null;
  }
  return value;
}

function normalizeMaxHeartRate(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || !isUserProfileRangeValue('maxHeartRate', value)
  ) {
    return null;
  }
  return value;
}

function normalizeLocale(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeRecentActivities(value: unknown): AnalysisHistoryActivity[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((activity): activity is AnalysisHistoryActivity => isValidActivity(activity));
}

export function parseAIAnalyzeRequest(body: unknown): { payload: AIAnalyzeRequestPayload } | { error: string } {
  if (!isPlainObject(body)) return { error: 'Invalid request body' };

  const data = body as AnalyzeRequestBody;
  if (!isValidActivity(data.activity)) return { error: 'Activity data required' };

  const lthr = normalizeLthr(data.lthr);
  if (lthr === null) return { error: 'Invalid LTHR' };
  const maxHeartRate = normalizeMaxHeartRate(data.maxHeartRate);
  if (maxHeartRate === null) return { error: 'Invalid maximum heart rate' };

  return {
    payload: {
      activity: data.activity,
      streams: normalizeStreams(data.streams),
      userProfilePBs: normalizePBs(data.userProfilePBs),
      recentActivities: normalizeRecentActivities(data.recentActivities),
      locale: normalizeLocale(data.locale),
      physique: normalizePhysique(data.physique),
      maxHeartRate,
      lthr,
      allowThirdPartyAI: data.allowThirdPartyAI === true,
    },
  };
}
