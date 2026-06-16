export function getRoundedPaceParts(secondsPerKm: number): { minutes: number; seconds: number } | null {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return null;

  const totalSeconds = Math.round(secondsPerKm);
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatPaceSeconds(secondsPerKm: number, fallback = '--'): string {
  const parts = getRoundedPaceParts(secondsPerKm);
  if (!parts) return fallback;

  return `${parts.minutes}'${parts.seconds.toString().padStart(2, '0')}"`;
}
