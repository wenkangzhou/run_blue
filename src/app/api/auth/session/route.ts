import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('access_token')?.value;
  const userId = cookieStore.get('user_id')?.value;
  const refreshToken = cookieStore.get('refresh_token')?.value;

  if (!accessToken || !userId) {
    return NextResponse.json({ user: null });
  }

  // Try to get user info from Strava
  try {
    const response = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      // Token might be expired
      return NextResponse.json({ user: null });
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
    return NextResponse.json({ user: null });
  }
}
