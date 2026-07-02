import type { User } from '@/types';
import { GUEST_ACCESS_TOKEN } from '@/lib/guestMode';

export function stripAuthTokens(user: User | null | undefined): User | null {
  if (!user) return null;
  if (user.isGuest) {
    return {
      ...user,
      accessToken: GUEST_ACCESS_TOKEN,
      refreshToken: '',
      expiresAt: 4102444800,
    };
  }
  return {
    ...user,
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
  };
}

export function shouldClearAuthStateForSessionError(error: unknown, status?: unknown): boolean {
  void status;
  return error === 'no_token' || error === 'token_expired';
}

export function shouldPromptReauthForSessionError(error: unknown, status?: unknown): boolean {
  void status;
  return error === 'token_expired';
}
