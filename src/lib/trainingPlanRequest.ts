import type { RaceDistance } from '@/lib/trainingPlan';

const RACE_DISTANCES = new Set<RaceDistance>(['5k', '10k', '21k', '42k']);
const MIN_PLAN_WEEKS = 4;
const MAX_PLAN_WEEKS = 20;
const DEFAULT_WEEKLY_VOLUME = 30;
const MAX_WEEKLY_VOLUME = 300;
const MIN_LTHR = 80;
const MAX_LTHR = 240;

export interface TrainingPlanRequestPayload {
  distance: RaceDistance;
  targetTimeSeconds: number;
  weeks: number;
  pb5kSec: number;
  weeklyVolume: number;
  raceDate?: string;
  locale?: string;
  lthr?: number;
}

function isRaceDistance(value: unknown): value is RaceDistance {
  return typeof value === 'string' && RACE_DISTANCES.has(value as RaceDistance);
}

function getFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function getPositiveInteger(value: unknown): number | null {
  const numberValue = getFiniteNumber(value);
  if (!numberValue || !Number.isInteger(numberValue) || numberValue <= 0) return null;
  return numberValue;
}

function normalizeRaceDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10) === value ? value : null;
}

function normalizeLocale(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function parseTrainingPlanRequest(
  body: unknown
): { payload: TrainingPlanRequestPayload } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Invalid request body' };
  }

  const data = body as Record<string, unknown>;
  if (!isRaceDistance(data.distance)) {
    return { error: 'Invalid race distance' };
  }

  const targetTimeSeconds = getPositiveInteger(data.targetTimeSeconds);
  if (!targetTimeSeconds) {
    return { error: 'Invalid target time' };
  }

  const weeks = getFiniteNumber(data.weeks);
  if (!weeks || !Number.isInteger(weeks) || weeks < MIN_PLAN_WEEKS || weeks > MAX_PLAN_WEEKS) {
    return { error: `Plan weeks must be between ${MIN_PLAN_WEEKS} and ${MAX_PLAN_WEEKS}` };
  }

  const pb5kSec = getPositiveInteger(data.pb5kSec);
  if (!pb5kSec) {
    return { error: 'Invalid 5K PB' };
  }

  const weeklyVolume = data.weeklyVolume === undefined || data.weeklyVolume === null
    ? DEFAULT_WEEKLY_VOLUME
    : getFiniteNumber(data.weeklyVolume);
  if (weeklyVolume === null || weeklyVolume < 0 || weeklyVolume > MAX_WEEKLY_VOLUME) {
    return { error: `Weekly volume must be between 0 and ${MAX_WEEKLY_VOLUME} km` };
  }

  const raceDate = normalizeRaceDate(data.raceDate);
  if (raceDate === null) {
    return { error: 'Invalid race date' };
  }

  const lthr = data.lthr === undefined || data.lthr === null
    ? undefined
    : getFiniteNumber(data.lthr);
  if (lthr !== undefined && (lthr === null || !Number.isInteger(lthr) || lthr < MIN_LTHR || lthr > MAX_LTHR)) {
    return { error: `LTHR must be between ${MIN_LTHR} and ${MAX_LTHR} bpm` };
  }

  return {
    payload: {
      distance: data.distance,
      targetTimeSeconds,
      weeks,
      pb5kSec,
      weeklyVolume,
      raceDate,
      locale: normalizeLocale(data.locale),
      lthr,
    },
  };
}
