import { NextRequest, NextResponse } from 'next/server';
import { parseCookieHeader } from '@/lib/authCookies';
import { normalizeSegmentExploreBounds } from '@/lib/segmentBounds';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = parseCookieHeader(cookieHeader);
    const accessToken = cookies['access_token'];

    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bounds = normalizeSegmentExploreBounds(searchParams.get('bounds')); // sw_lat,sw_lng,ne_lat,ne_lng

    if (!bounds) {
      return NextResponse.json({ error: 'valid bounds required' }, { status: 400 });
    }

    const response = await fetch(
      `${STRAVA_API_BASE}/segments/explore?bounds=${bounds}&activity_type=running`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
      }
      const err = await response.text();
      return NextResponse.json({ error: err }, { status: response.status });
    }

    const data = (await response.json()) as { segments?: unknown[] };
    return NextResponse.json({ segments: data.segments || [] });
  } catch (error) {
    console.error('Segments explore error:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Segments explore failed') }, { status: 500 });
  }
}
