import { NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAMES,
  LEGACY_AUTH_COOKIE_NAMES,
  getExpiredAuthCookieOptions,
} from '@/lib/authCookies';

export async function POST() {
  const response = NextResponse.json({ success: true });

  const expiredOptions = getExpiredAuthCookieOptions();
  for (const name of [...AUTH_COOKIE_NAMES, ...LEGACY_AUTH_COOKIE_NAMES]) {
    response.cookies.set(name, '', expiredOptions);
  }
  
  return response;
}
