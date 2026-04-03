import { NextRequest, NextResponse } from 'next/server';
import { getStravaAuthUrl } from '@/lib/strava';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  
  if (!clientId) {
    return NextResponse.json(
      { error: 'Strava Client ID not configured' },
      { status: 500 }
    );
  }

  // Use APP_URL env var, fallback to request origin, then localhost
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = `${appUrl}/api/auth/callback/strava`;
  
  const authUrl = getStravaAuthUrl(clientId, redirectUri);
  
  return NextResponse.redirect(authUrl);
}
