export const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export const AUTH_COOKIE_NAMES = ['access_token', 'refresh_token', 'user_id'] as const;
export const LEGACY_AUTH_COOKIE_NAMES = [
  'next-auth.session-token',
  'next-auth.callback-url',
  'next-auth.csrf-token',
] as const;

export function getAuthCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export function getExpiredAuthCookieOptions() {
  return {
    ...getAuthCookieOptions(0),
    expires: new Date(0),
  };
}

function safeDecodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [rawName, ...rest] = cookie.trim().split('=');
    const name = rawName.trim();
    if (!name) return;
    cookies[name] = safeDecodeCookieValue(rest.join('='));
  });

  return cookies;
}
