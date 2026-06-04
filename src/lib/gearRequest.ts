const MAX_GEAR_IDS = 100;
const MAX_GEAR_ID_LENGTH = 128;

export function parseGearIdsRequest(body: unknown): { gearIds: string[] } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'invalid_body' };
  }

  const gearIds = (body as Record<string, unknown>).gearIds;
  if (gearIds === undefined || gearIds === null) return { gearIds: [] };
  if (!Array.isArray(gearIds)) return { error: 'invalid_gear_ids' };
  if (gearIds.length > MAX_GEAR_IDS) return { error: 'too_many_gear_ids' };

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of gearIds) {
    if (typeof value !== 'string') return { error: 'invalid_gear_ids' };
    const id = value.trim();
    if (!id) continue;
    if (id.length > MAX_GEAR_ID_LENGTH) return { error: 'invalid_gear_ids' };
    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }

  return { gearIds: normalized };
}
