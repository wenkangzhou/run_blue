import { NextRequest, NextResponse } from 'next/server';

interface StravaGear {
  id: string;
  resource_state: number;
  name: string;
  distance: number;
  brand_name?: string;
  model_name?: string;
  description?: string;
  retired: boolean;
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

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  const accessToken = cookies['access_token'];

  if (!accessToken) {
    return NextResponse.json({ error: 'no_token' }, { status: 401 });
  }

  let gearIds: string[] = [];
  try {
    const body = await request.json();
    gearIds = body.gearIds || [];
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!gearIds.length) {
    return NextResponse.json({ gears: [] });
  }

  // Deduplicate
  const uniqueIds = [...new Set(gearIds)];

  // Fetch all gears in parallel with rate-limit safety
  const results = await Promise.allSettled(
    uniqueIds.map(async (id): Promise<StravaGear | null> => {
      const res = await fetch(`https://www.strava.com/api/v3/gear/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('token_expired');
        if (res.status === 429) throw new Error('rate_limited');
        // 404 or other errors: gear may not exist or no permission
        return null;
      }
      return res.json();
    })
  );

  const gears: StravaGear[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      gears.push(result.value);
    }
  }

  // If any was rejected due to auth/rate limit, propagate
  const firstRejection = results.find(
    (r) => r.status === 'rejected' && (r.reason?.message === 'token_expired' || r.reason?.message === 'rate_limited')
  );
  if (firstRejection && firstRejection.status === 'rejected') {
    const reason = firstRejection.reason.message;
    return NextResponse.json({ error: reason }, { status: reason === 'token_expired' ? 401 : 429 });
  }

  return NextResponse.json({ gears });
}
