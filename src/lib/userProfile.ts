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
  updatedAt: string;
}

const STORAGE_KEY = 'runblue_user_profile';

export function getUserProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    // Backward compatibility: old profiles may not have height/weight
    if (parsed.height === undefined) parsed.height = null;
    if (parsed.weight === undefined) parsed.weight = null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveUserProfile(profile: Omit<UserProfile, 'updatedAt'>): UserProfile {
  const fullProfile: UserProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };
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
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;

  if (parts.length === 2) {
    // mm:ss
    const [mm, ss] = parts;
    return mm * 60 + ss;
  } else if (parts.length === 3) {
    // hh:mm:ss
    const [hh, mm, ss] = parts;
    return hh * 3600 + mm * 60 + ss;
  }
  return null;
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

  (Object.keys(profile.pbs) as Array<keyof UserProfilePBs>).forEach(key => {
    const val = profile.pbs[key];
    if (val && val > 0) {
      merged[key] = val;
    }
  });

  return Object.keys(merged).length > 0 ? merged : null;
}
