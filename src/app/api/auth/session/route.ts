import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/strava';
import {
  AUTH_COOKIE_NAMES,
  AUTH_PROFILE_COOKIE_NAME,
  type AuthProfileCookie,
  getAuthCookieOptions,
  getExpiredAuthCookieOptions,
  parseAuthProfileCookie,
  parseCookieHeader,
  serializeAuthProfileCookie,
  THIRTY_DAYS_SECONDS,
} from '@/lib/authCookies';

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

interface TokenUpdate {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function applyTokenUpdate(response: NextResponse, tokenUpdate?: TokenUpdate) {
  if (!tokenUpdate) return;
  response.cookies.set('access_token', tokenUpdate.accessToken, getAuthCookieOptions(tokenUpdate.expiresIn));
  response.cookies.set('refresh_token', tokenUpdate.refreshToken, getAuthCookieOptions(THIRTY_DAYS_SECONDS));
}

function expiredSessionResponse() {
  const response = NextResponse.json({ user: null, error: 'token_expired' });
  const expiredOptions = getExpiredAuthCookieOptions();
  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.set(name, '', expiredOptions);
  }
  return response;
}

function rateLimitedSessionResponse(tokenUpdate?: TokenUpdate) {
  const response = NextResponse.json({ user: null, error: 'rate_limited' });
  applyTokenUpdate(response, tokenUpdate);
  return response;
}

function unavailableSessionResponse(status?: number, tokenUpdate?: TokenUpdate) {
  const response = NextResponse.json({ user: null, error: 'session_unavailable', status });
  applyTokenUpdate(response, tokenUpdate);
  return response;
}

function fetchStravaAthlete(accessToken: string) {
  return fetch('https://www.strava.com/api/v3/athlete', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function createSessionData(profile: AuthProfileCookie, accessToken: string): SessionData {
  return {
    user: {
      id: profile.id.toString(),
      name: `${profile.firstname} ${profile.lastname}`.trim(),
      email: '',
      image: profile.profile,
    },
    stravaId: profile.id,
    accessToken,
  };
}

function createSessionResponse(profile: AuthProfileCookie, accessToken: string, tokenUpdate?: TokenUpdate) {
  const response = NextResponse.json(createSessionData(profile, accessToken));
  applyTokenUpdate(response, tokenUpdate);
  response.cookies.set(
    AUTH_PROFILE_COOKIE_NAME,
    serializeAuthProfileCookie(profile),
    getAuthCookieOptions(THIRTY_DAYS_SECONDS)
  );
  return response;
}

function isTerminalRefreshError(error: unknown): boolean {
  return error instanceof Error && /:\s*(400|401|403)$/.test(error.message);
}

export async function GET(request: NextRequest) {
  const cookies = parseCookieHeader(request.headers.get('cookie') || '');
  let accessToken = cookies.access_token;
  const userId = cookies.user_id;
  let refreshToken = cookies.refresh_token;
  let profile = parseAuthProfileCookie(cookies[AUTH_PROFILE_COOKIE_NAME]);
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';
  let tokenUpdate: TokenUpdate | undefined;

  if (!userId || (!accessToken && !refreshToken)) {
    return NextResponse.json({ user: null, error: 'no_token' });
  }

  if (profile?.id.toString() !== userId) {
    profile = null;
  }

  // The OAuth response already includes the athlete profile. Keeping that
  // server-side avoids an extra Strava request on every page load.
  if (accessToken && profile && !forceRefresh) {
    return createSessionResponse(profile, accessToken);
  }

  if ((!accessToken || forceRefresh) && refreshToken) {
    try {
      const tokenData = await refreshAccessToken(refreshToken);
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      tokenUpdate = {
        accessToken,
        refreshToken,
        expiresIn: tokenData.expires_in,
      };
    } catch (error) {
      console.error('[Session] Failed to refresh token:', error);
      if (error instanceof Error && error.message.includes('429')) {
        return rateLimitedSessionResponse();
      }
      return isTerminalRefreshError(error) ? expiredSessionResponse() : unavailableSessionResponse();
    }
  }

  if (!accessToken) {
    return NextResponse.json({ user: null, error: 'no_token' });
  }

  if (profile) {
    return createSessionResponse(profile, accessToken, tokenUpdate);
  }

  // Compatibility path for cookies created before athlete_profile existed.
  let athleteResponse: Response;
  try {
    athleteResponse = await fetchStravaAthlete(accessToken);

    if ((athleteResponse.status === 401 || athleteResponse.status === 403) && refreshToken && !tokenUpdate) {
      const tokenData = await refreshAccessToken(refreshToken);
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      tokenUpdate = {
        accessToken,
        refreshToken,
        expiresIn: tokenData.expires_in,
      };
      athleteResponse = await fetchStravaAthlete(accessToken);
    }
  } catch (error) {
    console.error('[Session] Failed to restore legacy session:', error);
    if (error instanceof Error && error.message.includes('429')) {
      return rateLimitedSessionResponse(tokenUpdate);
    }
    if (isTerminalRefreshError(error)) {
      return expiredSessionResponse();
    }
    return unavailableSessionResponse(undefined, tokenUpdate);
  }

  if (!athleteResponse.ok) {
    if (athleteResponse.status === 429) return rateLimitedSessionResponse(tokenUpdate);
    return unavailableSessionResponse(athleteResponse.status, tokenUpdate);
  }

  const athlete = (await athleteResponse.json()) as StravaAthleteResponse;
  profile = {
    id: athlete.id,
    firstname: athlete.firstname,
    lastname: athlete.lastname,
    profile: athlete.profile,
  };
  return createSessionResponse(profile, accessToken, tokenUpdate);
}
