import { NextRequest, NextResponse } from 'next/server';
import { generateTrainingPlan, TrainingPlanInputError, type RaceDistance } from '@/lib/trainingPlan';

const RACE_DISTANCES = new Set<RaceDistance>(['5k', '10k', '21k', '42k']);
const MIN_PLAN_WEEKS = 4;
const MAX_PLAN_WEEKS = 20;
const DEFAULT_WEEKLY_VOLUME = 30;
const MAX_WEEKLY_VOLUME = 300;
const MIN_LTHR = 80;
const MAX_LTHR = 240;

interface PlanRequestPayload {
  distance: RaceDistance;
  targetTimeSeconds: number;
  weeks: number;
  pb5kSec: number;
  weeklyVolume: number;
  raceDate?: string;
  locale?: string;
  lthr?: number;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isRaceDistance(value: unknown): value is RaceDistance {
  return typeof value === 'string' && RACE_DISTANCES.has(value as RaceDistance);
}

function getFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
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

function parsePlanRequest(body: unknown): { payload: PlanRequestPayload } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Invalid request body' };
  }

  const data = body as Record<string, unknown>;
  if (!isRaceDistance(data.distance)) {
    return { error: 'Invalid race distance' };
  }

  const targetTimeSeconds = getFiniteNumber(data.targetTimeSeconds);
  if (!targetTimeSeconds || targetTimeSeconds <= 0) {
    return { error: 'Invalid target time' };
  }

  const weeks = getFiniteNumber(data.weeks);
  if (!weeks || !Number.isInteger(weeks) || weeks < MIN_PLAN_WEEKS || weeks > MAX_PLAN_WEEKS) {
    return { error: `Plan weeks must be between ${MIN_PLAN_WEEKS} and ${MAX_PLAN_WEEKS}` };
  }

  const pb5kSec = getFiniteNumber(data.pb5kSec);
  if (!pb5kSec || pb5kSec <= 0) {
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
  if (lthr !== undefined && (lthr === null || lthr < MIN_LTHR || lthr > MAX_LTHR)) {
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

export async function handleTrainingPlanRequest(request: NextRequest) {
  try {
    // Verify authentication
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const accessToken = cookies['access_token'];

    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = parsePlanRequest(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { distance, targetTimeSeconds, weeks, pb5kSec, weeklyVolume, raceDate, locale, lthr } = parsed.payload;
    const plan = await generateTrainingPlan(
      distance,
      targetTimeSeconds,
      weeks,
      pb5kSec,
      weeklyVolume,
      raceDate,
      locale,
      lthr
    );

    return NextResponse.json({ plan });
  } catch (error) {
    const message = getErrorMessage(error, 'Plan generation failed');
    if (error instanceof TrainingPlanInputError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('Training plan generation error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });

  return cookies;
}
