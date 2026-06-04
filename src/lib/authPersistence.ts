import type { User } from '@/types';

export function stripAuthTokens(user: User | null | undefined): User | null {
  if (!user) return null;
  return {
    ...user,
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
  };
}

export function shouldClearAuthStateForSessionError(error: unknown): boolean {
  return error === 'no_token' || error === 'token_expired';
}

export function shouldPromptReauthForSessionError(error: unknown): boolean {
  return error === 'token_expired';
}
