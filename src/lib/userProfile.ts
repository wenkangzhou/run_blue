import { UserProfile } from './ai';
import { StravaActivity } from '@/types';

const PROFILE_KEY = 'runblue_user_profile';

// Get user profile from localStorage
export function getUserProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Save user profile to localStorage
export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to save user profile:', e);
  }
}

// Update user profile with new activity data
export function updateUserProfileWithActivity(activity: StravaActivity): UserProfile {
  const existing = getUserProfile();
  
  const pace = activity.average_speed > 0 
    ? 1000 / activity.average_speed / 60 
    : 0;
  
  const heartRate = activity.average_heartrate || 0;
  const distance = activity.distance;
  const duration = activity.moving_time;
  
  // Determine preferred time from activity start time
  const hour = new Date(activity.start_date_local).getHours();
  let preferredTime: UserProfile['preferredTime'] = 'unknown';
  if (hour >= 5 && hour < 12) preferredTime = 'morning';
  else if (hour >= 12 && hour < 17) preferredTime = 'afternoon';
  else if (hour >= 17 && hour < 22) preferredTime = 'evening';
  
  if (!existing) {
    // First activity
    return {
      avgPace: pace,
      avgHeartRate: heartRate,
      avgDistance: distance,
      avgDuration: duration,
      totalRuns: 1,
      weeklyDistance: distance,
      preferredTime,
      lastUpdated: Date.now(),
    };
  }
  
  // Calculate weighted averages (more weight to recent activities)
  const totalWeight = existing.totalRuns + 1;
  const newAvgPace = (existing.avgPace * existing.totalRuns + pace) / totalWeight;
  const newAvgHeartRate = existing.avgHeartRate 
    ? (existing.avgHeartRate * existing.totalRuns + heartRate) / totalWeight
    : heartRate;
  const newAvgDistance = (existing.avgDistance * existing.totalRuns + distance) / totalWeight;
  const newAvgDuration = (existing.avgDuration * existing.totalRuns + duration) / totalWeight;
  
  // Update weekly distance (simple rolling window)
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const isNewWeek = existing.lastUpdated < oneWeekAgo;
  const newWeeklyDistance = isNewWeek ? distance : existing.weeklyDistance + distance;
  
  // Update preferred time (majority vote)
  const currentPreferred = existing.preferredTime;
  const newPreferred = currentPreferred === preferredTime || currentPreferred === 'unknown'
    ? preferredTime
    : currentPreferred;
  
  const updated: UserProfile = {
    avgPace: newAvgPace,
    avgHeartRate: newAvgHeartRate || existing.avgHeartRate,
    avgDistance: newAvgDistance,
    avgDuration: newAvgDuration,
    totalRuns: existing.totalRuns + 1,
    weeklyDistance: newWeeklyDistance,
    preferredTime: newPreferred,
    lastUpdated: Date.now(),
  };
  
  saveUserProfile(updated);
  return updated;
}

// Clear user profile (for logout or reset)
export function clearUserProfile(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PROFILE_KEY);
}
