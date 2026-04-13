import { StravaActivity } from '@/types';

// Estimated Personal Bests from activity history
export interface EstimatedPBs {
  '1k': number;      // seconds
  '3k': number;
  '5k': number;
  '10k': number;
  '21k': number;     // half marathon
  '42k': number;     // full marathon
  reliability: 'high' | 'medium' | 'low';
  sources: Record<string, 'actual' | 'estimated'>; // how each PB was derived
}

// Pace zones based on estimated PBs (using Daniels' RUNNING Formula)
export interface PaceZones {
  easy: { min: number; max: number; description: string };      // E pace
  marathon: { min: number; max: number; description: string };  // M pace
  threshold: { min: number; max: number; description: string }; // T pace
  interval: { min: number; max: number; description: string };  // I pace
  repetition: { min: number; max: number; description: string }; // R pace
}

// Training patterns detected from history
export interface TrainingPatterns {
  typicalEasyRunDistance: number;
  typicalLongRunDistance: number;
  typicalWeekDistance: number;
  avgRunsPerWeek: number;
  hasIntervalWorkouts: boolean;
  hasTempoWorkouts: boolean;
  hasLongRuns: boolean;
  hasRaceActivities: boolean;
  trainingDeficiencies: string[];
}

// Weekly training load
export interface WeeklyLoad {
  week: string;
  totalDistance: number;
  totalTime: number;
  runs: number;
  avgIntensity: number;
}

// Comparison with similar activities
export interface SimilarActivityStats {
  count: number;
  avgPace: number;
  bestPace: number;
  avgDistance: number;
  yourPaceRank: number;
  trendDirection: 'improving' | 'stable' | 'declining';
}

// Activity classification
export interface ActivityClassification {
  isRace: boolean;
  raceType: string | null;
  intensity: 'easy' | 'moderate' | 'hard' | 'extreme';
  paceZone: 'E' | 'M' | 'T' | 'I' | 'R' | 'unknown';
}

// Complete user training profile from historical data
export interface TrainingProfile {
  estimatedPBs: EstimatedPBs;
  paceZones: PaceZones;
  patterns: TrainingPatterns;
  recentLoad: WeeklyLoad[];
  similarStats: SimilarActivityStats | null;
  totalRunsAnalyzed: number;
  dateRange: { start: string; end: string };
}

const DISTANCE_RANGES = {
  '1k': { min: 0.9, max: 1.2, ratio: 1 },
  '3k': { min: 2.8, max: 3.3, ratio: 3 },
  '5k': { min: 4.8, max: 5.3, ratio: 5 },
  '10k': { min: 9.5, max: 10.5, ratio: 10 },
  '21k': { min: 20.5, max: 22, ratio: 21.0975 },
  '42k': { min: 41, max: 44, ratio: 42.195 },
};

// Riegel formula: T2 = T1 * (D2/D1)^1.06
const RIEGEL_EXPONENT = 1.06;

/**
 * Check if activity is a race based on workout_type or name
 */
export function classifyActivity(activity: StravaActivity): ActivityClassification {
  // Check workout_type - "Race" indicates a competition
  const isWorkoutRace = activity.workout_type === 'Race';
  
  // Check name for race indicators
  const raceKeywords = ['比赛', '马拉松', '半马', '全马', 'marathon', 'half marathon', 'race', '10k', '5k'];
  const nameLower = activity.name.toLowerCase();
  const hasRaceInName = raceKeywords.some(kw => nameLower.includes(kw.toLowerCase()));
  
  // Check if it's a race effort based on effort count
  const hasEfforts = activity.best_efforts && activity.best_efforts.length > 0;
  
  const isRace = isWorkoutRace || hasRaceInName;
  
  // Determine race type from distance
  let raceType = null;
  const distKm = activity.distance / 1000;
  if (isRace) {
    if (distKm >= 40) raceType = '马拉松';
    else if (distKm >= 20) raceType = '半程马拉松';
    else if (distKm >= 9.5 && distKm <= 10.5) raceType = '10公里';
    else if (distKm >= 4.8 && distKm <= 5.3) raceType = '5公里';
    else raceType = '比赛';
  }
  
  return {
    isRace,
    raceType,
    intensity: 'moderate', // Will be determined by caller based on pace/HR
    paceZone: 'unknown',
  };
}

/**
 * Analyze user's activity history to build training profile
 */
export function analyzeTrainingHistory(
  activities: StravaActivity[],
  currentActivity: StravaActivity
): TrainingProfile {
  // Filter to runs only
  const runs = activities.filter(a => 
    a.type === 'Run' || a.type === 'TrailRun'
  );
  
  // Add current activity to runs list for PB analysis (it has splits data)
  // Only add if it's not already in the list
  if (!runs.find(r => r.id === currentActivity.id)) {
    runs.push(currentActivity);
  }

  // Sort by date (newest first)
  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  // Estimate PBs from best efforts and actual race results
  // Include current activity (which has splits_metric) in the analysis
  const estimatedPBs = estimatePBs(sortedRuns, currentActivity);
  
  // Calculate pace zones from estimated 5k PB
  const paceZones = calculatePaceZones(estimatedPBs['5k']);
  
  // Detect training patterns
  const patterns = detectTrainingPatterns(sortedRuns);
  
  // Calculate weekly load (last 8 weeks)
  const recentLoad = calculateWeeklyLoad(sortedRuns, 8);
  
  // Compare with similar activities
  const similarStats = compareSimilarActivities(sortedRuns, currentActivity);

  return {
    estimatedPBs,
    paceZones,
    patterns,
    recentLoad,
    similarStats,
    totalRunsAnalyzed: sortedRuns.length,
    dateRange: {
      start: sortedRuns[sortedRuns.length - 1]?.start_date || currentActivity.start_date,
      end: sortedRuns[0]?.start_date || currentActivity.start_date,
    },
  };
}

/**
 * Estimate personal bests from activity history
 * Uses Riegel formula for projections between distances
 */
function estimatePBs(runs: StravaActivity[], currentActivity?: StravaActivity): EstimatedPBs {
  const pbs: Record<string, number> = {};
  const sources: Record<string, 'actual' | 'estimated'> = {};
  
  // First pass: find actual race results for each distance
  for (const [distance, range] of Object.entries(DISTANCE_RANGES)) {
    const bestTime = findBestRaceTime(runs, range.min * 1000, range.max * 1000);
    if (bestTime) {
      pbs[distance] = bestTime;
      sources[distance] = 'actual';
    }
  }
  
  // Second pass: check split data from current activity first (most reliable)
  if (currentActivity && currentActivity.splits_metric) {
    // Check 5k split from current activity
    const current5k = calculateSplitTime(currentActivity.splits_metric, 5);
    if (current5k && (!pbs['5k'] || current5k < pbs['5k'])) {
      pbs['5k'] = current5k;
      sources['5k'] = 'actual';
    }
    
    // Check 10k split from current activity
    const current10k = calculateSplitTime(currentActivity.splits_metric, 10);
    if (current10k && (!pbs['10k'] || current10k < pbs['10k'])) {
      pbs['10k'] = current10k;
      sources['10k'] = 'actual';
    }
  }
  
  // Third pass: check split data from all longer runs for 5k and 10k
  if (!pbs['5k'] || sources['5k'] !== 'actual') {
    const best5kSplit = findBestSplitTime(runs, 5);
    if (best5kSplit && (!pbs['5k'] || best5kSplit < pbs['5k'])) {
      pbs['5k'] = best5kSplit;
      sources['5k'] = 'actual';
    }
  }
  
  if (!pbs['10k'] || sources['10k'] !== 'actual') {
    const best10kSplit = findBestSplitTime(runs, 10);
    if (best10kSplit && (!pbs['10k'] || best10kSplit < pbs['10k'])) {
      pbs['10k'] = best10kSplit;
      sources['10k'] = 'actual';
    }
  }
  
  // Third pass: use Riegel formula to project missing distances from known ones
  // Priority: 10k -> 5k -> 21k -> 42k -> others
  
  // If we have 10k but not 5k, project 5k
  if (pbs['10k'] && !pbs['5k']) {
    pbs['5k'] = projectTime(pbs['10k'], 10, 5);
    sources['5k'] = 'estimated';
  }
  
  // If we have 5k but not 10k, project 10k
  if (pbs['5k'] && !pbs['10k']) {
    pbs['10k'] = projectTime(pbs['5k'], 5, 10);
    sources['10k'] = 'estimated';
  }
  
  // If we have 10k but not 21k, project 21k
  if (pbs['10k'] && !pbs['21k']) {
    pbs['21k'] = projectTime(pbs['10k'], 10, 21.0975);
    sources['21k'] = 'estimated';
  }
  
  // If we have 21k but not 10k, project 10k
  if (pbs['21k'] && !pbs['10k']) {
    pbs['10k'] = projectTime(pbs['21k'], 21.0975, 10);
    sources['10k'] = 'estimated';
  }
  
  // If we have 21k but not 42k, project 42k
  if (pbs['21k'] && !pbs['42k']) {
    pbs['42k'] = projectTime(pbs['21k'], 21.0975, 42.195);
    sources['42k'] = 'estimated';
  }
  
  // If we have 42k but not 21k, project 21k
  if (pbs['42k'] && !pbs['21k']) {
    pbs['21k'] = projectTime(pbs['42k'], 42.195, 21.0975);
    sources['21k'] = 'estimated';
  }
  
  // Fill remaining gaps with pace-based estimates
  for (const [distance, range] of Object.entries(DISTANCE_RANGES)) {
    if (!pbs[distance]) {
      pbs[distance] = estimateFromPace(runs, range.ratio);
      sources[distance] = 'estimated';
    }
  }
  
  // Sanity check: 5k should be roughly 10k * 0.48-0.5
  if (pbs['5k'] && pbs['10k']) {
    const ratio = pbs['5k'] / pbs['10k'];
    if (ratio > 0.65) { // 5k is too slow compared to 10k
      // Recalculate 5k based on 10k
      pbs['5k'] = Math.round(pbs['10k'] * 0.485);
      sources['5k'] = 'estimated';
    }
  }
  
  // Determine reliability
  let reliability: 'high' | 'medium' | 'low' = 'low';
  const actualCount = Object.values(sources).filter(s => s === 'actual').length;
  
  if (actualCount >= 3 && pbs['5k'] && pbs['10k'] && sources['5k'] === 'actual' && sources['10k'] === 'actual') {
    reliability = 'high';
  } else if (actualCount >= 2 && runs.length >= 20) {
    reliability = 'medium';
  }
  
  return {
    '1k': pbs['1k'] || 0,
    '3k': pbs['3k'] || 0,
    '5k': pbs['5k'] || 0,
    '10k': pbs['10k'] || 0,
    '21k': pbs['21k'] || 0,
    '42k': pbs['42k'] || 0,
    reliability,
    sources,
  };
}

/**
 * Calculate time for a specific distance from splits of a single activity
 */
function calculateSplitTime(
  splits: { distance: number; moving_time?: number; elapsed_time: number }[],
  targetKm: number
): number | null {
  let accumulatedDistance = 0;
  let accumulatedTime = 0;
  
  for (const split of splits) {
    accumulatedDistance += split.distance;
    accumulatedTime += split.moving_time || split.elapsed_time;
    
    // Check if we've reached target (with 2% tolerance)
    if (accumulatedDistance >= targetKm * 1000 * 0.98) {
      // Normalize to exact distance
      const ratio = (targetKm * 1000) / accumulatedDistance;
      return Math.round(accumulatedTime * ratio);
    }
  }
  
  return null;
}

/**
 * Find best time for a specific distance from splits in longer runs
 * For example, find best 5k time from the first 5 splits of half marathons
 */
function findBestSplitTime(runs: StravaActivity[], targetKm: number): number | null {
  const numSplitsNeeded = Math.ceil(targetKm);
  
  // Filter runs that have splits and are long enough
  const validRuns = runs.filter(r => {
    if (!r.splits_metric || r.splits_metric.length < numSplitsNeeded) return false;
    if (r.distance < targetKm * 1000) return false;
    return true;
  });
  
  if (validRuns.length === 0) return null;
  
  const splitTimes: number[] = [];
  
  for (const run of validRuns) {
    const splits = run.splits_metric;
    if (!splits) continue;
    
    let accumulatedDistance = 0;
    let accumulatedTime = 0;
    let splitsUsed = 0;
    
    for (const split of splits) {
      accumulatedDistance += split.distance;
      accumulatedTime += split.moving_time || split.elapsed_time;
      splitsUsed++;
      
      // Check if we've reached target (with 5% tolerance)
      if (accumulatedDistance >= targetKm * 1000 * 0.95) {
        // Normalize to exact distance
        const ratio = (targetKm * 1000) / accumulatedDistance;
        const normalizedTime = Math.round(accumulatedTime * ratio);
        splitTimes.push(normalizedTime);
        break;
      }
      
      if (splitsUsed >= numSplitsNeeded + 2) break;
    }
  }
  
  if (splitTimes.length === 0) return null;
  
  // Use 5th percentile (slightly conservative) to avoid outliers
  const sorted = [...splitTimes].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.05);
  return sorted[index] || sorted[0];
}

/**
 * Project time from one distance to another using Riegel formula
 * T2 = T1 * (D2/D1)^1.06
 */
function projectTime(time1: number, dist1: number, dist2: number): number {
  return Math.round(time1 * Math.pow(dist2 / dist1, RIEGEL_EXPONENT));
}

/**
 * Find best race time for a specific distance range
 * Prioritizes actual races (workout_type = "Race")
 */
function findBestRaceTime(
  runs: StravaActivity[],
  minDistance: number,
  maxDistance: number
): number | null {
  // First look for actual races in the range
  const races = runs.filter(
    r => r.distance >= minDistance && 
         r.distance <= maxDistance && 
         r.moving_time > 0 &&
         (r.workout_type === 'Race' || classifyActivity(r).isRace)
  );
  
  if (races.length > 0) {
    // Normalize to exact distance
    const targetDistance = (minDistance + maxDistance) / 2 / 1000; // km
    const times = races.map(r => {
      const pace = r.moving_time / (r.distance / 1000); // seconds per km
      return Math.round(pace * targetDistance);
    });
    return Math.min(...times);
  }
  
  // Fall back to any activity in range
  const validRuns = runs.filter(
    r => r.distance >= minDistance && r.distance <= maxDistance && r.moving_time > 0
  );
  
  if (validRuns.length === 0) return null;
  
  const targetDistance = (minDistance + maxDistance) / 2 / 1000;
  const times = validRuns.map(r => {
    const pace = r.moving_time / (r.distance / 1000);
    return Math.round(pace * targetDistance);
  });
  
  // Use 95th percentile (slightly conservative) rather than absolute best
  const sortedTimes = [...times].sort((a, b) => a - b);
  const index = Math.floor(sortedTimes.length * 0.05);
  return sortedTimes[index] || sortedTimes[0];
}

function estimateFromPace(runs: StravaActivity[], targetKm: number): number {
  if (runs.length === 0) return 0;
  
  // Use fastest paces from shorter distances to estimate
  const paces = runs
    .filter(r => r.distance >= 3000)
    .map(r => r.moving_time / r.distance); // seconds per meter
  
  if (paces.length === 0) return 0;
  
  // Use 5th percentile pace as "race pace" estimate
  const sortedPaces = [...paces].sort((a, b) => a - b);
  const fastPace = sortedPaces[Math.floor(sortedPaces.length * 0.05)] || sortedPaces[0];
  
  // Add fatigue factor for longer distances
  const fatigueFactor = 1 + Math.max(0, (targetKm - 5) * 0.015);
  return Math.round(fastPace * targetKm * 1000 * fatigueFactor);
}

/**
 * Calculate training pace zones based on estimated 5k PB
 * Using Daniels' RUNNING Formula methodology
 */
export function calculatePaceZones(pb5kSeconds: number): PaceZones {
  const pb5kPace = pb5kSeconds / 5; // seconds per km
  
  // If PB is 0 or unreasonable, use defaults
  if (pb5kSeconds === 0 || pb5kPace > 480) { // slower than 8:00/km
    return {
      easy: { min: 360, max: 480, description: '轻松跑 - 恢复、有氧基础' },
      marathon: { min: 300, max: 360, description: '马拉松配速 - 比赛节奏' },
      threshold: { min: 270, max: 300, description: '乳酸阈值 - 舒适艰苦的边缘' },
      interval: { min: 240, max: 270, description: '间歇跑 - VO2max训练' },
      repetition: { min: 210, max: 240, description: '重复跑 - 速度和跑姿' },
    };
  }
  
  return {
    easy: {
      min: Math.round(pb5kPace * 1.20),
      max: Math.round(pb5kPace * 1.35),
      description: '轻松跑 - 恢复、有氧基础',
    },
    marathon: {
      min: Math.round(pb5kPace * 1.05),
      max: Math.round(pb5kPace * 1.15),
      description: '马拉松配速 - 比赛节奏',
    },
    threshold: {
      min: Math.round(pb5kPace * 0.93),
      max: Math.round(pb5kPace * 0.97),
      description: '乳酸阈值 - 舒适艰苦的边缘',
    },
    interval: {
      min: Math.round(pb5kPace * 0.88),
      max: Math.round(pb5kPace * 0.92),
      description: '间歇跑 - VO2max训练',
    },
    repetition: {
      min: Math.round(pb5kPace * 0.82),
      max: Math.round(pb5kPace * 0.87),
      description: '重复跑 - 速度和跑姿',
    },
  };
}

/**
 * Detect training patterns and deficiencies
 */
function detectTrainingPatterns(runs: StravaActivity[]): TrainingPatterns {
  if (runs.length === 0) {
    return {
      typicalEasyRunDistance: 5000,
      typicalLongRunDistance: 10000,
      typicalWeekDistance: 20000,
      avgRunsPerWeek: 3,
      hasIntervalWorkouts: false,
      hasTempoWorkouts: false,
      hasLongRuns: false,
      hasRaceActivities: false,
      trainingDeficiencies: ['数据不足'],
    };
  }

  // Calculate typical easy run (most common 5-10k runs)
  const easyRuns = runs.filter(r => r.distance >= 4000 && r.distance <= 12000);
  const typicalEasyRunDistance = easyRuns.length > 0
    ? easyRuns.reduce((sum, r) => sum + r.distance, 0) / easyRuns.length
    : 6000;

  // Long runs (>15k)
  const longRuns = runs.filter(r => r.distance >= 15000);
  const typicalLongRunDistance = longRuns.length > 0
    ? longRuns.reduce((sum, r) => sum + r.distance, 0) / longRuns.length
    : 15000;

  // Weekly volume (last 8 weeks)
  const weekBuckets = new Map<string, number>();
  for (const run of runs.slice(0, 56)) {
    const date = new Date(run.start_date);
    const weekKey = `${date.getFullYear()}-W${getWeekNumber(date)}`;
    weekBuckets.set(weekKey, (weekBuckets.get(weekKey) || 0) + run.distance);
  }
  const weekDistances = Array.from(weekBuckets.values());
  const typicalWeekDistance = weekDistances.length > 0
    ? weekDistances.reduce((a, b) => a + b, 0) / weekDistances.length
    : typicalEasyRunDistance * 3;

  const avgRunsPerWeek = weekDistances.length > 0
    ? Math.round(runs.slice(0, 56).length / weekDistances.length * 10) / 10
    : 3;

  // Detect workout types
  const { hasIntervalWorkouts, hasTempoWorkouts } = detectWorkoutTypes(runs);
  
  // Check for race activities
  const raceActivities = runs.filter(r => classifyActivity(r).isRace);
  const hasRaceActivities = raceActivities.length > 0;
  
  // Check for long runs
  const hasLongRuns = longRuns.length > 0;

  // Identify deficiencies
  const deficiencies: string[] = [];
  
  if (!hasLongRuns && runs.some(r => r.distance >= 10000)) {
    deficiencies.push('缺少长距离训练');
  }
  if (!hasIntervalWorkouts) {
    deficiencies.push('缺少速度/间歇训练');
  }
  if (!hasTempoWorkouts) {
    deficiencies.push('缺少乳酸阈值训练');
  }
  if (avgRunsPerWeek < 3) {
    deficiencies.push('周跑量频率偏低');
  }
  if (deficiencies.length === 0) {
    deficiencies.push('训练结构均衡');
  }

  return {
    typicalEasyRunDistance,
    typicalLongRunDistance,
    typicalWeekDistance,
    avgRunsPerWeek,
    hasIntervalWorkouts,
    hasTempoWorkouts,
    hasLongRuns,
    hasRaceActivities,
    trainingDeficiencies: deficiencies,
  };
}

function detectWorkoutTypes(runs: StravaActivity[]) {
  let hasIntervalWorkouts = false;
  let hasTempoWorkouts = false;

  const recentRuns = runs.slice(0, 30);
  
  for (const run of recentRuns) {
    const paceMinKm = run.moving_time / run.distance * 1000 / 60;
    const classification = classifyActivity(run);
    
    // Skip races for workout type detection
    if (classification.isRace) continue;
    
    // Interval workout detection (short distance but relatively fast)
    if (run.distance < 6000 && paceMinKm < 4.5) {
      hasIntervalWorkouts = true;
    }
    
    // Tempo detection (medium distance, sustained faster pace)
    if (run.distance >= 6000 && run.distance <= 12000 && paceMinKm < 4.3) {
      hasTempoWorkouts = true;
    }
  }

  return { hasIntervalWorkouts, hasTempoWorkouts };
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function calculateWeeklyLoad(runs: StravaActivity[], weeks: number): WeeklyLoad[] {
  const result: WeeklyLoad[] = [];
  const now = new Date();
  
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const weekRuns = runs.filter(r => {
      const runDate = new Date(r.start_date);
      return runDate >= weekStart && runDate < weekEnd;
    });
    
    const totalDistance = weekRuns.reduce((sum, r) => sum + r.distance, 0);
    const totalTime = weekRuns.reduce((sum, r) => sum + r.moving_time, 0);
    
    let avgIntensity = 5;
    if (weekRuns.length > 0) {
      const avgPace = totalTime / totalDistance * 1000 / 60;
      avgIntensity = Math.min(10, Math.max(1, Math.round(8 - (avgPace - 5))));
    }
    
    result.push({
      week: weekStart.toISOString().split('T')[0],
      totalDistance,
      totalTime,
      runs: weekRuns.length,
      avgIntensity,
    });
  }
  
  return result;
}

function compareSimilarActivities(
  runs: StravaActivity[],
  currentActivity: StravaActivity
): SimilarActivityStats | null {
  const currentDistance = currentActivity.distance;
  const currentPace = currentActivity.moving_time / currentDistance * 1000 / 60;
  
  // Find similar runs (within ±20% distance), excluding races when comparing to easy runs
  const currentIsRace = classifyActivity(currentActivity).isRace;
  
  const similarRuns = runs.filter(r => {
    if (r.id === currentActivity.id) return false;
    if (Math.abs(r.distance - currentDistance) / currentDistance >= 0.2) return false;
    if (r.distance <= 1000) return false;
    
    // If current is race, compare to other races
    // If current is easy run, compare to other easy runs
    const rIsRace = classifyActivity(r).isRace;
    return currentIsRace === rIsRace;
  });
  
  if (similarRuns.length === 0) {
    // Fallback: include all similar distances regardless of type
    const allSimilar = runs.filter(r => 
      r.id !== currentActivity.id &&
      Math.abs(r.distance - currentDistance) / currentDistance < 0.2 &&
      r.distance > 1000
    );
    if (allSimilar.length === 0) return null;
  }
  
  const useRuns = similarRuns.length > 0 ? similarRuns : runs.filter(r => 
    r.id !== currentActivity.id &&
    Math.abs(r.distance - currentDistance) / currentDistance < 0.2 &&
    r.distance > 1000
  );
  
  const paces = useRuns.map(r => r.moving_time / r.distance * 1000 / 60);
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
  const bestPace = Math.min(...paces);
  const avgDistance = useRuns.reduce((sum, r) => sum + r.distance, 0) / useRuns.length;
  
  const sortedPaces = [...paces].sort((a, b) => a - b);
  const rankIndex = sortedPaces.findIndex(p => p > currentPace);
  const yourPaceRank = rankIndex === -1 
    ? 100 
    : Math.round((rankIndex / sortedPaces.length) * 100);
  
  const recentSimilar = useRuns.slice(0, 5);
  const recentPaces = recentSimilar.map(r => r.moving_time / r.distance * 1000 / 60);
  const olderPaces = useRuns.slice(5, 10).map(r => r.moving_time / r.distance * 1000 / 60);
  
  let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentPaces.length >= 3 && olderPaces.length >= 3) {
    const recentAvg = recentPaces.reduce((a, b) => a + b, 0) / recentPaces.length;
    const olderAvg = olderPaces.reduce((a, b) => a + b, 0) / olderPaces.length;
    if (recentAvg < olderAvg * 0.98) {
      trendDirection = 'improving';
    } else if (recentAvg > olderAvg * 1.02) {
      trendDirection = 'declining';
    }
  }
  
  return {
    count: useRuns.length,
    avgPace,
    bestPace,
    avgDistance,
    yourPaceRank,
    trendDirection,
  };
}

export function formatTime(seconds: number): string {
  if (!seconds || seconds === 0) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatPace(secondsPerKm: number): string {
  if (!secondsPerKm || secondsPerKm === 0) return '--\'--"';
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
}
