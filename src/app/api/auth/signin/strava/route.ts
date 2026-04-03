import { NextResponse } from 'next/server';
import { getStravaAuthUrl } from '@/lib/strava';

export async function GET() {
  const authUrl = getStravaAuthUrl();
  return NextResponse.redirect(authUrl);
}
