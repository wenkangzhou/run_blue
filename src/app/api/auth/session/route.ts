import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get cookies from request headers
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = parseCookies(cookieHeader);
  
  const accessToken = cookies['access_token'];
  const userId = cookies['user_id'];
  const refreshToken = cookies['refresh_token'];

  if (!accessToken || !userId) {
    return NextResponse.json({ user: null, error: 'no_token' });
  }

  // Try to get user info from Strava
  try {
    const response = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      // Token might be expired - return error so client knows to reauth
      const status = response.status;
      if (status === 401) {
        return NextResponse.json({ user: null, error: 'token_expired' });
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
      },
      stravaId: athlete.id,
      accessToken,
      refreshToken,
    });
  } catch {
    return NextResponse.json({ user: null, error: 'network_error' });
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
