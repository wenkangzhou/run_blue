const MAX_AUTH_ERROR_LENGTH = 120;

export function getAuthErrorRedirectPath(error: unknown, fallback = 'auth_failed'): string {
  const raw = typeof error === 'string' ? error.trim() : '';
  const message = raw.length > 0 ? raw.slice(0, MAX_AUTH_ERROR_LENGTH) : fallback;
  return `/?error=${encodeURIComponent(message)}`;
}
