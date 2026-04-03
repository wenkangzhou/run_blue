import { NextRequest, NextResponse } from 'next/server';
import { exchangeToken } from '@/lib/strava';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url));
  }

  try {
    // Use APP_URL env var for redirect_uri (must match authorization request)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const redirectUri = `${appUrl}/api/auth/callback/strava`;
    
    const tokenData = await exchangeToken(code, redirectUri);

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
      maxAge: 60 * 60 * 24 * 30,
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
