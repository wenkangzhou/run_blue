import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/strava';
import { getAuthCookieOptions, parseCookieHeader, THIRTY_DAYS_SECONDS } from '@/lib/authCookies';

interface StravaAthleteResponse {
  id: number;
  firstname: string;
  lastname: string;
  profile: string | null;
}

interface SessionData {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  stravaId: number;
  accessToken: string;
}

// In-memory cache to reduce Strava API calls (30s TTL)
const sessionCache = new Map<string, { data: SessionData; timestamp: number }>();
const SESSION_CACHE_TTL = 30 * 1000; // 30 seconds
export async function GET(request: NextRequest) {
  // Get cookies from request headers
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookieHeader(cookieHeader);
  
  let accessToken = cookies['access_token'];
  const userId = cookies['user_id'];
  let refreshToken = cookies['refresh_token'];

  if (!accessToken || !userId) {
    return NextResponse.json({ user: null, error: 'no_token' });
  }

  // Check in-memory cache first
  const cacheKey = `${userId}:${accessToken.slice(-8)}`;
  const cached = sessionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SESSION_CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  // Try to get user info from Strava
  let response = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // If token expired, try to refresh
  if (response.status === 401 && refreshToken) {
    try {
      const tokenData = await refreshAccessToken(refreshToken);
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      
      // Retry request with new token
      response = await fetch('https://www.strava.com/api/v3/athlete', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }
      
      const athlete = (await response.json()) as StravaAthleteResponse;

      const sessionData = {
        user: {
          id: userId,
          name: `${athlete.firstname} ${athlete.lastname}`,
          email: '',
          image: athlete.profile,
        },
        stravaId: athlete.id,
        accessToken,
      };

      // Update cache with new token
      const newCacheKey = `${userId}:${accessToken.slice(-8)}`;
      sessionCache.set(newCacheKey, { data: sessionData, timestamp: Date.now() });

      const res = NextResponse.json(sessionData);
      res.cookies.set('access_token', accessToken, getAuthCookieOptions(tokenData.expires_in));
      res.cookies.set('refresh_token', refreshToken, getAuthCookieOptions(THIRTY_DAYS_SECONDS));
      
      return res;
    } catch (error) {
      console.error('[Session] Failed to refresh token:', error);
      return NextResponse.json({ user: null, error: 'token_expired' });
    }
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 401) {
      return NextResponse.json({ user: null, error: 'token_expired' });
    }
    if (status === 429) {
      return NextResponse.json({ user: null, error: 'rate_limited' });
    }
    return NextResponse.json({ user: null, error: 'strava_error', status });
  }

  const athlete = (await response.json()) as StravaAthleteResponse;

  const sessionData = {
    user: {
      id: userId,
      name: `${athlete.firstname} ${athlete.lastname}`,
      email: '',
      image: athlete.profile,
    },
    stravaId: athlete.id,
    accessToken,
  };

  sessionCache.set(cacheKey, { data: sessionData, timestamp: Date.now() });
  return NextResponse.json(sessionData);
}
