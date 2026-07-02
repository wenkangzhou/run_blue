import { StravaActivity, StravaToken, StravaAthlete, ActivityStream } from '@/types';
import { parseStravaLocalDate } from './dates';
import { formatPaceSeconds } from './paceFormat';
import { getClientSession } from './clientSession';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

function getTokenError(operation: 'exchange' | 'refresh', status: number): Error {
  return new Error(`Failed to ${operation} Strava token: ${status}`);
}

export function getStravaAuthUrl(clientId: string, redirectUri: string): string {
  const scope = 'read,activity:read';
  
  return `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${encodeURIComponent(scope)}`;
}

export async function exchangeToken(code: string, redirectUri?: string): Promise<StravaToken> {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  
  const body: Record<string, string> = {
    client_id: clientId || '',
    client_secret: clientSecret || '',
    code,
    grant_type: 'authorization_code',
  };
  
  if (redirectUri) {
    body.redirect_uri = redirectUri;
  }
  
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error('[Strava] Token exchange failed:', response.status);
    throw getTokenError('exchange', response.status);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<StravaToken> {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  
  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    console.error('[Strava] Token refresh failed:', response.status);
    throw getTokenError('refresh', response.status);
  }

  return response.json();
}

export async function getAthlete(accessToken: string): Promise<StravaAthlete> {
  const response = await fetch(`${STRAVA_API_BASE}/athlete`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get athlete');
  }

  return response.json();
}

// Helper to get valid access token (auto-refresh if needed)
async function getValidAccessToken(): Promise<string | null> {
  try {
    const session = await getClientSession();
    return session.accessToken || null;
  } catch (e) {
    console.error('Failed to get session:', e);
  }
  return null;
}

export async function getActivities(
  accessToken: string,
  page: number = 1,
  perPage: number = 30
): Promise<StravaActivity[]> {
  // Try to get a valid token (may refresh automatically)
  const validToken = await getValidAccessToken() || accessToken;
  
  try {
    const response = await fetch(
      `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=${perPage}`,
      {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('401 Unauthorized');
      }
      if (response.status === 429) {
        throw new Error('429 Rate Limited');
      }
      throw new Error(`Failed to get activities: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    // Re-throw network errors with a clear message
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Failed to fetch');
    }
    throw error;
  }
}

export async function getActivity(
  accessToken: string,
  activityId: number
): Promise<StravaActivity> {
  // Try to get a valid token (may refresh automatically)
  const validToken = await getValidAccessToken() || accessToken;
  
  try {
    const response = await fetch(
      `${STRAVA_API_BASE}/activities/${activityId}?include_all_efforts=true`,
      {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('401 Unauthorized');
      }
      if (response.status === 429) {
        throw new Error('429 Rate Limited');
      }
      throw new Error(`Failed to get activity: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    // Re-throw network errors with a clear message
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Failed to fetch');
    }
    throw error;
  }
}

export async function getActivityStreams(
  accessToken: string,
  activityId: number,
  types: string[] = ['time', 'distance', 'latlng', 'altitude', 'velocity_smooth', 'heartrate', 'watts']
): Promise<Record<string, ActivityStream>> {
  // Try to get a valid token (may refresh automatically)
  const validToken = await getValidAccessToken() || accessToken;
  
  try {
    const response = await fetch(
      `${STRAVA_API_BASE}/activities/${activityId}/streams/${types.join(',')}?resolution=high`,
      {
        headers: {
          Authorization: `Bearer ${validToken}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('401 Unauthorized');
      }
      if (response.status === 429) {
        throw new Error('429 Rate Limited');
      }
      throw new Error(`Failed to get activity streams: ${response.status}`);
    }

    const data = await response.json();
    // Convert array to object keyed by type
    const streams: Record<string, ActivityStream> = {};
    for (const stream of data) {
      streams[stream.type] = stream;
    }
    return streams;
  } catch (error) {
    // Re-throw network errors with a clear message
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Failed to fetch');
    }
    throw error;
  }
}

export function decodePolyline(encoded: string | null): [number, number][] {
  if (!encoded) return [];
  
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

export function formatDistance(meters: number, unit: 'km' | 'mi' = 'km'): string {
  if (unit === 'mi') {
    return `${(meters / 1609.344).toFixed(2)} mi`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatPace(
  meters: number,
  seconds: number,
  unit: 'min/km' | 'min/mi' = 'min/km'
): string {
  if (meters === 0) return '--';
  
  const distance = unit === 'min/mi' ? meters / 1609.344 : meters / 1000;
  const paceSeconds = seconds / distance;
  
  return `${formatPaceSeconds(paceSeconds)}${unit === 'min/mi' ? '/mi' : '/km'}`;
}

export function formatDate(dateString: string, locale: string = 'zh-CN'): string {
  const date = parseStravaLocalDate(dateString);
  
  // Format manually to avoid locale issues in SSR
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  if (locale.startsWith('zh')) {
    return `${year}年${month}月${day}日`;
  }
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[date.getMonth()]} ${day}, ${year}`;
}

export function formatDateTime(dateString: string, locale: string = 'zh-CN'): string {
  const date = parseStravaLocalDate(dateString);
  const dateStr = formatDate(dateString, locale);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}:${seconds}`;
}

export function formatGearDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
