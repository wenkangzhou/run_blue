import { NextResponse } from 'next/server';
import { getStravaAuthUrl } from '@/lib/strava';

export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  
  if (!clientId) {
    return NextResponse.json(
      { error: 'Strava Client ID not configured' },
      { status: 500 }
    );
  }

  // For server-side redirect, we need to construct the URL manually
  // since we don't have access to window.location in the server
  const redirectUri = 'http://localhost:6364/api/auth/callback/strava';
  const authUrl = getStravaAuthUrl(clientId, redirectUri);
  
  return NextResponse.redirect(authUrl);
}
