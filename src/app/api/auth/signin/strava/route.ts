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

  // Get the origin from the request headers
  const origin = request.headers.get('host') || '';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = origin ? `${protocol}://${origin}` : 'http://localhost:6364';
  const redirectUri = `${baseUrl}/api/auth/callback/strava`;
  
  const authUrl = getStravaAuthUrl(clientId, redirectUri);
  
  return NextResponse.redirect(authUrl);
}
