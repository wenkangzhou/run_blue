import { NextRequest, NextResponse } from 'next/server';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const accessToken = cookies['access_token'];

    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bounds = searchParams.get('bounds'); // sw_lat,sw_lng,ne_lat,ne_lng

    if (!bounds) {
      return NextResponse.json({ error: 'bounds required' }, { status: 400 });
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

    const data = await response.json();
    return NextResponse.json({ segments: data.segments || [] });
  } catch (error: any) {
    console.error('Segments explore error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
