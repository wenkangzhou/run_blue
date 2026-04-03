import { NextRequest, NextResponse } from 'next/server';
import { exchangeToken } from '@/lib/strava';
import { saveUser } from '@/lib/supabase';

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
    // Build the same redirect URI used in authorization request
    const redirectUri = `${request.nextUrl.origin}/api/auth/callback/strava`;
    const tokenData = await exchangeToken(code, redirectUri);

    if (!tokenData.athlete) {
      return NextResponse.redirect(new URL('/?error=no_athlete', request.url));
    }

    const user = {
      id: tokenData.athlete.id.toString(),
      stravaId: tokenData.athlete.id,
      email: '',
      name: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`,
      image: tokenData.athlete.profile,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_at,
    };

    await saveUser(user);

    // Redirect to dashboard with token info in cookies
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
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
    response.cookies.set('user_id', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (err) {
    console.error('Strava callback error:', err);
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }
}
