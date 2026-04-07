import { StravaActivity, ActivityStream } from '@/types';

const CACHE_PREFIX = 'run_blue_cache_';
const ACTIVITY_CACHE_TTL = 1000 * 60 * 60; // 1 hour

interface CachedActivity {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
  timestamp: number;
}

export function getCachedActivity(activityId: number): CachedActivity | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const key = `${CACHE_PREFIX}activity_${activityId}`;
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const data: CachedActivity = JSON.parse(cached);
    // Check if cache is still valid (1 hour)
    if (Date.now() - data.timestamp > ACTIVITY_CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setCachedActivity(
  activityId: number, 
  activity: StravaActivity, 
  streams: Record<string, ActivityStream> | null
): void {
  if (typeof window === 'undefined') return;
  
  try {
    const key = `${CACHE_PREFIX}activity_${activityId}`;
    const data: CachedActivity = {
      activity,
      streams,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage might be full, ignore
  }
}

export function clearActivityCache(activityId: number): void {
  if (typeof window === 'undefined') return;
  
  try {
    const key = `${CACHE_PREFIX}activity_${activityId}`;
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
