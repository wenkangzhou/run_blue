import { NextRequest, NextResponse } from 'next/server';
import { parseCookieHeader } from '@/lib/authCookies';
import { parseGearIdsRequest } from '@/lib/gearRequest';

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

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookieHeader(cookieHeader);
  const accessToken = cookies['access_token'];

  if (!accessToken) {
    return NextResponse.json({ error: 'no_token' }, { status: 401 });
  }

  let gearIds: string[] = [];
  try {
    const body = await request.json();
    const parsed = parseGearIdsRequest(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    gearIds = parsed.gearIds;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!gearIds.length) {
    return NextResponse.json({ gears: [] });
  }

  // Fetch all gears in parallel with rate-limit safety
  const results = await Promise.allSettled(
    gearIds.map(async (id): Promise<StravaGear | null> => {
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
