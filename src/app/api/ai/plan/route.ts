import { NextRequest, NextResponse } from 'next/server';
import { generateTrainingPlan } from '@/lib/ai';
import type { RaceDistance } from '@/lib/trainingPlan';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const accessToken = cookies['access_token'];
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { distance, targetTimeSeconds, weeks, pb5kSec, weeklyVolume, raceDate, locale } = body as {
      distance: RaceDistance;
      targetTimeSeconds: number;
      weeks: number;
      pb5kSec: number;
      weeklyVolume: number;
      raceDate?: string;
      locale?: string;
    };

    if (!distance || !targetTimeSeconds || !weeks || !pb5kSec) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const plan = await generateTrainingPlan(
      distance,
      targetTimeSeconds,
      weeks,
      pb5kSec,
      weeklyVolume || 30,
      raceDate,
      locale
    );

    return NextResponse.json({ plan });
  } catch (error: any) {
    console.error('AI plan error:', error);
    return NextResponse.json(
      { error: error.message || 'Plan generation failed' },
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
