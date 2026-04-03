import { NextRequest, NextResponse } from 'next/server';
import { exchangeToken } from '@/lib/strava';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  console.log('Strava callback received:', {
    code: code ? 'present' : 'missing',
    error,
    origin: request.nextUrl.origin,
  });

  if (error) {
    console.error('Strava returned error:', error);
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    // Build the same redirect URI used in authorization request
    const redirectUri = `${request.nextUrl.origin}/api/auth/callback/strava`;
    console.log('Exchanging token with redirect_uri:', redirectUri);
    
    const tokenData = await exchangeToken(code, redirectUri);
    console.log('Token exchange successful:', {
      hasAthlete: !!tokenData.athlete,
      athleteId: tokenData.athlete?.id,
    });

    if (!tokenData.athlete) {
      return NextResponse.redirect(new URL('/?error=no_athlete', request.url));
    }

    // Redirect to activities with token info in cookies
    const response = NextResponse.redirect(new URL('/activities', request.url));
    response.cookies.set('access_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in,
    });
    response.cookies.set('refresh_token', tokenData.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    response.cookies.set('user_id', tokenData.athlete.id.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (err: any) {
    console.error('Strava callback error:', err);
    const errorMessage = encodeURIComponent(err.message || 'auth_failed');
    return NextResponse.redirect(new URL(`/?error=${errorMessage}`, request.url));
  }
}
