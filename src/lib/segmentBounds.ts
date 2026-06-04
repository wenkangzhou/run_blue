function getFiniteCoordinate(value: string): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function normalizeSegmentExploreBounds(value: string | null): string | null {
  if (!value) return null;

  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) return null;

  const [swLat, swLng, neLat, neLng] = parts.map(getFiniteCoordinate);
  if (swLat === null || swLng === null || neLat === null || neLng === null) return null;
  if (swLat < -90 || swLat > 90 || neLat < -90 || neLat > 90) return null;
  if (swLng < -180 || swLng > 180 || neLng < -180 || neLng > 180) return null;
  if (swLat >= neLat || swLng >= neLng) return null;

  return [swLat, swLng, neLat, neLng].join(',');
}
