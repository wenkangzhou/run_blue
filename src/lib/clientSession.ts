export interface ClientSessionPayload {
  user: {
    id: string;
    name: string;
    email?: string;
    image?: string | null;
  } | null;
  stravaId?: number;
  accessToken?: string;
  expiresAt?: number;
  error?: string;
  status?: number;
}

const SESSION_SUCCESS_TTL = 25_000;
const SESSION_ERROR_TTL = 3_000;

let cachedSession: { payload: ClientSessionPayload; expiresAt: number } | null = null;
let pendingSessionRequest: Promise<ClientSessionPayload> | null = null;

export function invalidateClientSessionCache() {
  cachedSession = null;
}

export async function getClientSession(
  { force = false }: { force?: boolean } = {}
): Promise<ClientSessionPayload> {
  const now = Date.now();
  if (!force && cachedSession && cachedSession.expiresAt > now) {
    return cachedSession.payload;
  }
  if (pendingSessionRequest) return pendingSessionRequest;

  pendingSessionRequest = fetch(force ? '/api/auth/session?refresh=1' : '/api/auth/session', {
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`session_request_failed:${response.status}`);
      }
      const payload = (await response.json()) as ClientSessionPayload;
      cachedSession = {
        payload,
        expiresAt: Date.now() + (payload.user ? SESSION_SUCCESS_TTL : SESSION_ERROR_TTL),
      };
      return payload;
    })
    .finally(() => {
      pendingSessionRequest = null;
    });

  return pendingSessionRequest;
}
