export interface UserProfilePBs {
  '5k': number | null;
  '10k': number | null;
  '21k': number | null;
  '42k': number | null;
}

export interface UserProfile {
  pbs: UserProfilePBs;
  height: number | null; // cm
  weight: number | null; // kg
  maxHeartRate: number | null; // maximum heart rate (bpm)
  lthr: number | null; // lactate threshold heart rate (bpm)
  updatedAt: string;
}

const STORAGE_KEY = 'runblue_user_profile';
const PB_KEYS: Array<keyof UserProfilePBs> = ['5k', '10k', '21k', '42k'];
export const USER_PROFILE_LIMITS = {
  height: { min: 50, max: 250 },
  weight: { min: 20, max: 300 },
  maxHeartRate: { min: 100, max: 240 },
  lthr: { min: 80, max: 240 },
} as const;

function normalizePositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeRangeNumber(
  value: unknown,
  { min, max, integer = false }: { min: number; max: number; integer?: boolean }
): number | null {
  const numberValue = normalizePositiveNumber(value);
  if (numberValue === null || numberValue < min || numberValue > max) return null;
  if (integer && !Number.isInteger(numberValue)) return null;
  return numberValue;
}

function normalizeUserProfile(value: unknown): UserProfile | null {
  if (!value || typeof value !== 'object') return null;

  const parsed = value as Partial<UserProfile>;
  const sourcePBs = parsed.pbs && typeof parsed.pbs === 'object'
    ? parsed.pbs as Partial<UserProfilePBs>
    : {};

  const pbs = PB_KEYS.reduce((acc, key) => {
    acc[key] = normalizePositiveNumber(sourcePBs[key]);
    return acc;
  }, {} as UserProfilePBs);

  return {
    pbs,
    height: normalizeRangeNumber(parsed.height, USER_PROFILE_LIMITS.height),
    weight: normalizeRangeNumber(parsed.weight, USER_PROFILE_LIMITS.weight),
    maxHeartRate: normalizeRangeNumber(parsed.maxHeartRate, {
      ...USER_PROFILE_LIMITS.maxHeartRate,
      integer: true,
    }),
    lthr: normalizeRangeNumber(parsed.lthr, { ...USER_PROFILE_LIMITS.lthr, integer: true }),
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
  };
}

export function isUserProfileRangeValue(
  field: keyof typeof USER_PROFILE_LIMITS,
  value: number | null
): boolean {
  if (value === null) return true;
  const { min, max } = USER_PROFILE_LIMITS[field];
  const requiresInteger = field === 'lthr' || field === 'maxHeartRate';
  return Number.isFinite(value) && value >= min && value <= max && (!requiresInteger || Number.isInteger(value));
}

export function getUserProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeUserProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveUserProfile(profile: Omit<UserProfile, 'updatedAt'>): UserProfile {
  const fullProfile = normalizeUserProfile({
    ...profile,
    updatedAt: new Date().toISOString(),
  }) as UserProfile;

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullProfile));
  }
  return fullProfile;
}

export function clearUserProfile(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Convert time string (mm:ss or hh:mm:ss) to seconds
 */
export function parseTimeToSeconds(input: string): number | null {
  const trimmed = input
    .trim()
    .replace(/[：﹕]/g, ':')
    .replace(/\s+/g, '');
  if (!trimmed) return null;

  const rawParts = trimmed.split(':');
  if (rawParts.length !== 2 && rawParts.length !== 3) return null;
  if (rawParts.some(part => !/^\d+$/.test(part))) return null;

  const parts = rawParts.map(p => Number.parseInt(p, 10));

  if (parts.length === 2) {
    // mm:ss
    const [mm, ss] = parts;
    if (ss >= 60) return null;
    return mm * 60 + ss;
  }

  // hh:mm:ss
  const [hh, mm, ss] = parts;
  if (mm >= 60 || ss >= 60) return null;
  return hh * 3600 + mm * 60 + ss;
}

/**
 * Convert seconds to mm:ss or hh:mm:ss
 */
export function formatSecondsToTime(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds === 0) return '';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Convert user profile PBs to the format expected by training analysis
 */
export function getMergedPBsForAnalysis(
  profile: UserProfile | null,
  fallbackPBs?: Record<string, number> | null
): Record<string, number> | null {
  if (!profile) return fallbackPBs || null;

  const merged: Record<string, number> = { ...fallbackPBs };

  PB_KEYS.forEach(key => {
    const val = profile.pbs[key];
    if (val && val > 0) {
      merged[key] = val;
    }
  });

  return Object.keys(merged).length > 0 ? merged : null;
}
