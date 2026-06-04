import { NextRequest, NextResponse } from 'next/server';
import { generateTrainingPlan, TrainingPlanInputError } from '@/lib/trainingPlan';
import { parseTrainingPlanRequest } from '@/lib/trainingPlanRequest';
import { parseCookieHeader } from '@/lib/authCookies';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function handleTrainingPlanRequest(request: NextRequest) {
  try {
    // Verify authentication
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = parseCookieHeader(cookieHeader);
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

    const parsed = parseTrainingPlanRequest(body);
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
