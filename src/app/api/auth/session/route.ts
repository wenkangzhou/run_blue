import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/strava';

export async function GET(request: NextRequest) {
  // Get cookies from request headers
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  
  let accessToken = cookies['access_token'];
  const userId = cookies['user_id'];
  let refreshToken = cookies['refresh_token'];

  if (!accessToken || !userId) {
    return NextResponse.json({ user: null, error: 'no_token' });
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
      console.log('[Session] Token expired, attempting refresh...');
      const tokenData = await refreshAccessToken(refreshToken);
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      
      // Update cookies with new tokens
      const cookieOptions = `; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`;
      const headers = new Headers();
      
      headers.append('Set-Cookie', `access_token=${accessToken}${cookieOptions}`);
      headers.append('Set-Cookie', `refresh_token=${refreshToken}${cookieOptions}`);
      
      // Retry request with new token
      response = await fetch('https://www.strava.com/api/v3/athlete', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }
      
      const athlete = await response.json();
      
      const res = NextResponse.json({
        user: {
          id: userId,
          name: `${athlete.firstname} ${athlete.lastname}`,
          email: '',
          image: athlete.profile,
          accessToken,
          refreshToken,
        },
        stravaId: athlete.id,
        accessToken,
        refreshToken,
      });
      
      res.headers.set('Set-Cookie', `access_token=${accessToken}${cookieOptions}`);
      res.headers.append('Set-Cookie', `refresh_token=${refreshToken}${cookieOptions}`);
      
      console.log('[Session] Token refreshed successfully');
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

  const athlete = await response.json();

  return NextResponse.json({
    user: {
      id: userId,
      name: `${athlete.firstname} ${athlete.lastname}`,
      email: '',
      image: athlete.profile,
      accessToken,
      refreshToken,
    },
    stravaId: athlete.id,
    accessToken,
    refreshToken,
  });
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
