import { StravaActivity } from '@/types';
import { formatLocalDateKey, getActivityDate, getActivityTimestamp, getISOWeek } from './dates';
import { getZoneForHR } from './heartRateZones';
import { calculateSemanticPaceZones } from './trainingZones';

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

export type PaceZoneLabel = 'E' | 'M' | 'T' | 'I' | 'R';
export type ClassificationConfidence = 'low' | 'medium' | 'high';

export type WorkoutType =
  | 'race'
  | 'interval'
  | 'fartlek'
  | 'threshold'
  | 'tempo'
  | 'progression'
  | 'long-run'
  | 'workout'
  | 'easy'
  | 'recovery'
  | 'hill'
  | 'treadmill'
  | 'mixed'
  | 'unknown';

export interface ActivityStructureSummary {
  source: 'laps' | 'splits' | 'basic';
  lapCount: number;
  medianLapDistance: number | null;
  shortRepCount: number;
  fastRepCount: number;
  recoveryRepCount: number;
  hasWarmup: boolean;
  hasCooldown: boolean;
  splitPattern: 'interval' | 'progression' | 'steady' | 'mixed' | 'unknown';
  paceVariability: number | null;
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
  workoutTypeCounts: Partial<Record<WorkoutType, number>>;
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
  strictCount: number;
  avgPace: number;
  bestPace: number;
  avgDistance: number;
  yourPaceRank: number;
  trendDirection: 'improving' | 'stable' | 'declining';
  recentAvgPace: number; // avg pace of most recent 5 similar workouts (min/km)
  olderAvgPace: number;  // avg pace of next 5 older similar workouts (min/km)
  comparisonMode: 'strict' | 'fallback';
  sampleConfidence: ClassificationConfidence;
}

export interface ThermalComparisonStats {
  count: number;
  currentTemperature: number;
  averageTemperature: number;
  averagePaceSeconds: number;
  paceDifferenceSeconds: number;
  averageHeartRate: number | null;
  heartRateDifference: number | null;
  sampleConfidence: ClassificationConfidence;
}

// Running physiology metrics (the three key factors)
export interface PhysiologyMetrics {
  vo2max: {
    value: number;      // ml/kg/min
    level: 'elite' | 'excellent' | 'good' | 'average' | 'below_average';
    description: string;
  };
  lactateThreshold: {
    pace: number;       // seconds per km
    heartRate?: number; // estimated bpm
    description: string;
  };
  runningEconomy: {
    score: 'excellent' | 'good' | 'average' | 'needs_improvement';
    efficiency: number; // seconds per km at marathon pace
    description: string;
    suggestions: string[];
  };
  // Derived metrics
  speedEndurance: 'strength' | 'balanced' | 'endurance'; // 速度vs耐力倾向
}

// Activity classification
export interface ActivityClassification {
  isRace: boolean;
  raceType: string | null;
  intensity: 'easy' | 'moderate' | 'hard' | 'extreme';
  paceZone: PaceZoneLabel;
  paceZoneConfidence: ClassificationConfidence;
  paceZoneExactMatch: boolean;
  paceZoneGapSeconds: number | null;
  workoutType: WorkoutType;
  workoutTypeConfidence: ClassificationConfidence;
  workoutTypeEvidence: string[];
  structure: ActivityStructureSummary;
}

// Complete user training profile from historical data
export interface TrainingProfile {
  estimatedPBs: EstimatedPBs;
  paceZones: PaceZones;
  patterns: TrainingPatterns;
  physiologyMetrics: PhysiologyMetrics;
  recentLoad: WeeklyLoad[];
  similarStats: SimilarActivityStats | null;
  thermalStats: ThermalComparisonStats | null;
  totalRunsAnalyzed: number;
  dateRange: { start: string; end: string };
}

/**
 * Calculate physiology metrics (VO2max, LT, Running Economy)
 * Based on race PBs and performance patterns
 */
function calculatePhysiologyMetrics(pbs: EstimatedPBs): PhysiologyMetrics {
  const pb5k = pbs['5k'];
  const pb10k = pbs['10k'];
  const pb42k = pbs['42k'];
  
  // 1. Estimate VO2max using Daniels formula
  let vo2maxValue = 45; // default average
  if (pb5k > 0) {
    const pace5kMetersPerMin = 5000 / (pb5k / 60);
    vo2maxValue = Math.round((pace5kMetersPerMin * 0.18 + 2.5) * 10) / 10;
  }
  
  let vo2maxLevel: PhysiologyMetrics['vo2max']['level'] = 'average';
  if (vo2maxValue >= 60) vo2maxLevel = 'elite';
  else if (vo2maxValue >= 55) vo2maxLevel = 'excellent';
  else if (vo2maxValue >= 50) vo2maxLevel = 'good';
  else if (vo2maxValue < 40) vo2maxLevel = 'below_average';
  
  // 2. Estimate Lactate Threshold
  const ltPace = pb10k > 0 ? pb10k / 10 : (pb5k > 0 ? pb5k / 5 * 1.05 : 300);
  const ltHeartRate = 170;
  
  // 3. Running Economy analysis
  let economyScore: PhysiologyMetrics['runningEconomy']['score'] = 'good';
  let speedEndurance: PhysiologyMetrics['speedEndurance'] = 'balanced';
  const suggestions: string[] = [];
  
  if (pb5k > 0 && pb42k > 0) {
    const pace5k = pb5k / 5;
    const pace42k = pb42k / 42.195;
    const slowdown = pace42k / pace5k;
    
    if (slowdown < 1.15) {
      economyScore = 'excellent';
      speedEndurance = 'balanced';
      suggestions.push('跑步经济性优秀，保持当前训练结构');
    } else if (slowdown < 1.20) {
      economyScore = 'good';
      speedEndurance = 'balanced';
      suggestions.push('可适当增加长距离有氧训练提升耐力');
    } else if (slowdown < 1.25) {
      economyScore = 'average';
      speedEndurance = 'endurance';
      suggestions.push('建议增加乳酸阈值跑和马拉松配速跑');
      suggestions.push('每周安排一次30km+的长距离训练');
    } else {
      economyScore = 'needs_improvement';
      speedEndurance = 'endurance';
      suggestions.push('耐力相对速度明显不足，需重点加强');
      suggestions.push('增加M配速跑和长距离慢跑比例');
      suggestions.push('考虑增加周跑量至60-80km');
    }
    
    if (pb10k > 0) {
      const pace10k = pb10k / 10;
      const speedRatio = pace10k / pace5k;
      if (speedRatio > 1.06) {
        speedEndurance = 'strength';
        suggestions.push('速度能力优于耐力，适合短距离比赛');
      }
    }
  }
  
  return {
    vo2max: {
      value: vo2maxValue,
      level: vo2maxLevel,
      description: getVo2maxDescription(vo2maxLevel, vo2maxValue),
    },
    lactateThreshold: {
      pace: Math.round(ltPace),
      heartRate: ltHeartRate,
      description: `乳酸阈值配速约 ${formatPace(ltPace)}/km，对应10K-15K比赛配速`,
    },
    runningEconomy: {
      score: economyScore,
      efficiency: Math.round(ltPace * 1.05),
      description: getEconomyDescription(economyScore, speedEndurance),
      suggestions,
    },
    speedEndurance,
  };
}

function getVo2maxDescription(level: string, value: number): string {
  switch (level) {
    case 'elite': return `精英级 (${value} ml/kg/min)，接近国家选手水平`;
    case 'excellent': return `优秀 (${value} ml/kg/min)，超越95%跑者`;
    case 'good': return `良好 (${value} ml/kg/min)，超过平均水平`;
    case 'average': return `中等 (${value} ml/kg/min)，有提升空间`;
    case 'below_average': return `基础水平 (${value} ml/kg/min)，建议加强有氧训练`;
    default: return `${value} ml/kg/min`;
  }
}

function getEconomyDescription(score: string, profile: string): string {
  const profileText = profile === 'strength' ? '速度型' : profile === 'endurance' ? '耐力型' : '均衡型';
  switch (score) {
    case 'excellent': return `${profileText}跑者，跑步经济性优秀，能量利用效率高`;
    case 'good': return `${profileText}跑者，跑步经济性良好，技术动作合理`;
    case 'average': return `${profileText}跑者，跑步经济性一般，有优化空间`;
    case 'needs_improvement': return `${profileText}跑者，建议改善跑姿和增加力量训练`;
    default: return `${profileText}跑者`;
  }
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

const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  race: '比赛',
  interval: '间歇',
  fartlek: '法特莱克',
  threshold: '阈值跑',
  tempo: '节奏跑',
  progression: '渐进跑',
  'long-run': '长距离',
  workout: '训练',
  easy: '轻松跑',
  recovery: '恢复跑',
  hill: '坡跑',
  treadmill: '跑步机',
  mixed: '混合训练',
  unknown: '未识别',
};

export function getWorkoutTypeLabel(workoutType: WorkoutType, locale: string = 'zh'): string {
  if (locale.startsWith('en')) {
    return {
      race: 'Race',
      interval: 'Interval',
      fartlek: 'Fartlek',
      threshold: 'Threshold',
      tempo: 'Tempo',
      progression: 'Progression',
      'long-run': 'Long run',
      workout: 'Workout',
      easy: 'Easy run',
      recovery: 'Recovery run',
      hill: 'Hill workout',
      treadmill: 'Treadmill run',
      mixed: 'Mixed workout',
      unknown: 'Unclassified',
    }[workoutType];
  }

  return WORKOUT_TYPE_LABELS[workoutType];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function varianceRatio(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = average(values);
  if (!mean) return null;
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function getLapPaceSecPerKm(distance: number, movingTime: number): number {
  if (!distance || !movingTime) return 0;
  return movingTime / distance * 1000;
}

function detectSplitPatternFromPaces(paces: number[]): ActivityStructureSummary['splitPattern'] {
  if (paces.length < 3) return 'unknown';

  const avgPace = average(paces);
  if (!avgPace) return 'unknown';

  const fastThreshold = avgPace * 0.92;
  const slowThreshold = avgPace * 1.08;
  let intervalCycles = 0;
  let inFast = false;

  for (const pace of paces) {
    if (!inFast && pace < fastThreshold) {
      inFast = true;
    } else if (inFast && pace > slowThreshold) {
      inFast = false;
      intervalCycles += 1;
    }
  }

  if (intervalCycles >= 2) return 'interval';

  const progressionPaces =
    paces.length >= 5 && paces[paces.length - 1] > avgPace * 1.08
      ? paces.slice(0, -1)
      : paces;
  const firstThird = progressionPaces.slice(0, Math.ceil(progressionPaces.length / 3));
  const lastThird = progressionPaces.slice(Math.floor((progressionPaces.length * 2) / 3));
  const firstAvg = average(firstThird);
  const lastAvg = average(lastThird);
  if (firstAvg > 0) {
    const trend = (lastAvg - firstAvg) / firstAvg;
    if (trend <= -0.06) return 'progression';
  }

  if (progressionPaces.length >= 5 && firstAvg > 0) {
    const bestPace = Math.min(...progressionPaces);
    const bestIndex = progressionPaces.indexOf(bestPace);
    const lateEnough = bestIndex >= Math.floor(progressionPaces.length * 0.55);
    const clearLateSurge = (firstAvg - bestPace) / firstAvg >= 0.08;
    const latePaces = progressionPaces.slice(Math.floor(progressionPaces.length * 0.55));
    const sustainedFasterCount = latePaces.filter((pace) => pace <= firstAvg * 0.95).length;
    const sustainedLateSurge = sustainedFasterCount >= Math.max(2, Math.ceil(latePaces.length * 0.6));
    if (lateEnough && clearLateSurge && sustainedLateSurge) return 'progression';
  }

  const steadyCount = paces.filter((pace) => pace >= avgPace * 0.94 && pace <= avgPace * 1.06).length;
  if (steadyCount / paces.length >= 0.7) return 'steady';

  return 'mixed';
}

function summarizeActivityStructure(activity: StravaActivity): ActivityStructureSummary {
  const lapCandidates = activity.laps?.filter(
    (lap) => lap.distance >= 120 && lap.distance <= 5000 && lap.moving_time >= 25
  ) ?? [];

  if (lapCandidates.length >= 2) {
    const distances = lapCandidates.map((lap) => lap.distance);
    const paces = lapCandidates.map((lap) => getLapPaceSecPerKm(lap.distance, lap.moving_time)).filter(Boolean);
    const medianPace = median(paces) ?? 0;
    const medianDistance = median(distances);
    const paceVariability = varianceRatio(paces);
    const shortRepCount = lapCandidates.filter((lap) => lap.distance >= 150 && lap.distance <= 2000).length;
    const fastRepCount = medianPace
      ? lapCandidates.filter((lap) => getLapPaceSecPerKm(lap.distance, lap.moving_time) < medianPace * 0.93).length
      : 0;
    const recoveryRepCount = medianPace
      ? lapCandidates.filter((lap) => getLapPaceSecPerKm(lap.distance, lap.moving_time) > medianPace * 1.08).length
      : 0;

    return {
      source: 'laps',
      lapCount: activity.laps?.length ?? lapCandidates.length,
      medianLapDistance: medianDistance,
      shortRepCount,
      fastRepCount,
      recoveryRepCount,
      hasWarmup: lapCandidates.length >= 4 && getLapPaceSecPerKm(lapCandidates[0].distance, lapCandidates[0].moving_time) > medianPace * 1.08,
      hasCooldown: lapCandidates.length >= 4 && getLapPaceSecPerKm(lapCandidates[lapCandidates.length - 1].distance, lapCandidates[lapCandidates.length - 1].moving_time) > medianPace * 1.08,
      splitPattern: detectSplitPatternFromPaces(paces),
      paceVariability,
    };
  }

  const splitCandidates = activity.splits_metric?.filter(
    (split) => split.distance >= 500 && split.moving_time >= 60
  ) ?? [];
  if (splitCandidates.length >= 3) {
    const paces = splitCandidates.map((split) => getLapPaceSecPerKm(split.distance, split.moving_time || split.elapsed_time)).filter(Boolean);
    const medianSplitDistance = median(splitCandidates.map((split) => split.distance));
    const patternCandidates = splitCandidates.filter((split, index) => (
      index !== splitCandidates.length - 1
      || !medianSplitDistance
      || split.distance >= medianSplitDistance * 0.8
    ));
    const patternPaces = patternCandidates
      .map((split) => getLapPaceSecPerKm(split.distance, split.moving_time || split.elapsed_time))
      .filter(Boolean);
    return {
      source: 'splits',
      lapCount: 0,
      medianLapDistance: medianSplitDistance,
      shortRepCount: splitCandidates.filter((split) => split.distance <= 1200).length,
      fastRepCount: 0,
      recoveryRepCount: 0,
      hasWarmup: false,
      hasCooldown: false,
      splitPattern: detectSplitPatternFromPaces(patternPaces),
      paceVariability: varianceRatio(paces),
    };
  }

  return {
    source: 'basic',
    lapCount: activity.laps?.length ?? 0,
    medianLapDistance: null,
    shortRepCount: 0,
    fastRepCount: 0,
    recoveryRepCount: 0,
    hasWarmup: false,
    hasCooldown: false,
    splitPattern: 'unknown',
    paceVariability: null,
  };
}

function getWorkoutTypeFromKeywords(activity: StravaActivity): WorkoutType | null {
  const haystack = `${activity.name || ''} ${activity.description || ''}`.toLowerCase();
  const keywordMap: Array<[WorkoutType, string[]]> = [
    ['interval', ['interval', 'intervals', '间歇', 'repeat', 'repeats', '400m', '800m', '1k repeat']],
    ['fartlek', ['fartlek', '法特莱克']],
    ['threshold', ['threshold', '阈值']],
    ['tempo', ['tempo', '节奏']],
    ['progression', ['progression', '渐进', 'negative split']],
    ['long-run', ['long run', 'lsd', '长距离']],
    ['recovery', ['recovery', '恢复跑', 'shakeout']],
    ['easy', ['easy run', '轻松跑', 'easy']],
    ['hill', ['hill', '爬坡', '坡跑']],
    ['treadmill', ['treadmill', '跑步机']],
  ];

  for (const [type, keywords] of keywordMap) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return type;
    }
  }

  return null;
}

interface PaceZoneAssessment {
  zone: PaceZoneLabel;
  confidence: ClassificationConfidence;
  exactMatch: boolean;
  gapSeconds: number | null;
  evidence: string[];
}

interface HeartRateAssessment {
  avgZone: 'z1' | 'z2' | 'z3' | 'z4' | 'z5' | 'unknown';
  maxZone: 'z1' | 'z2' | 'z3' | 'z4' | 'z5' | 'unknown';
  average: number | null;
  max: number | null;
}

function assessHeartRateForActivity(
  activity: StravaActivity,
  lthr?: number | null
): HeartRateAssessment {
  const avg = activity.average_heartrate ?? null;
  const max = activity.max_heartrate ?? null;

  if (!lthr || lthr <= 0 || !avg || avg <= 0) {
    return {
      avgZone: 'unknown',
      maxZone: 'unknown',
      average: avg,
      max,
    };
  }

  return {
    avgZone: getZoneForHR(avg, lthr),
    maxZone: max && max > 0 ? getZoneForHR(max, lthr) : getZoneForHR(avg, lthr),
    average: avg,
    max,
  };
}

function assessPaceZoneForActivity(
  activity: StravaActivity,
  paceZones?: PaceZones | null,
  modelReliability: EstimatedPBs['reliability'] = 'medium'
): PaceZoneAssessment {
  if (!paceZones || !activity.distance || !activity.moving_time) {
    return {
      zone: 'E',
      confidence: 'low',
      exactMatch: false,
      gapSeconds: null,
      evidence: ['pace-zone model unavailable, defaulted to easy'],
    };
  }

  const pace = activity.moving_time / activity.distance * 1000;
  const confidence: ClassificationConfidence = modelReliability === 'high' ? 'high' : modelReliability === 'low' ? 'low' : 'medium';

  // Check from fastest to slowest — continuous zones, no gaps
  if (pace <= paceZones.repetition.max) {
    return {
      zone: 'R',
      confidence,
      exactMatch: true,
      gapSeconds: 0,
      evidence: [`pace in repetition zone`],
    };
  }

  if (pace <= paceZones.interval.max) {
    return {
      zone: 'I',
      confidence,
      exactMatch: true,
      gapSeconds: 0,
      evidence: [`pace in interval zone`],
    };
  }

  if (pace <= paceZones.threshold.max) {
    return {
      zone: 'T',
      confidence,
      exactMatch: true,
      gapSeconds: 0,
      evidence: [`pace in threshold zone`],
    };
  }

  if (pace <= paceZones.marathon.max) {
    return {
      zone: 'M',
      confidence,
      exactMatch: true,
      gapSeconds: 0,
      evidence: [`pace in marathon zone`],
    };
  }

  // Everything slower than marathon zone is easy
  return {
    zone: 'E',
    confidence,
    exactMatch: true,
    gapSeconds: 0,
    evidence: [`pace in easy zone`],
  };
}

function inferWorkoutType(
  activity: StravaActivity,
  structure: ActivityStructureSummary,
  paceAssessment: PaceZoneAssessment,
  lthr?: number | null
): Pick<ActivityClassification, 'workoutType' | 'workoutTypeConfidence' | 'workoutTypeEvidence' | 'intensity'> {
  const evidence: string[] = [];
  const keywordType = getWorkoutTypeFromKeywords(activity);
  const elevationRatio = activity.distance > 0 ? activity.total_elevation_gain / activity.distance : 0;
  const distanceKm = activity.distance / 1000;
  const durationMinutes = activity.moving_time / 60;
  const paceZone = paceAssessment.zone;
  const hrAssessment = assessHeartRateForActivity(activity, lthr);
  const isExplicitWorkout = activity.workout_type === 3;

  if (isExplicitWorkout) {
    evidence.push('Strava workout_type=3');
  }

  if (activity.workout_type === 1) {
    return {
      workoutType: 'race',
      workoutTypeConfidence: 'high',
      workoutTypeEvidence: ['Strava workout_type=1'],
      intensity: 'extreme',
    };
  }

  if (keywordType === 'treadmill' || activity.trainer || activity.sport_type === 'VirtualRun') {
    evidence.push(keywordType === 'treadmill' ? 'name/description indicates treadmill' : 'trainer/VirtualRun flag');
    return {
      workoutType: 'treadmill',
      workoutTypeConfidence: 'high',
      workoutTypeEvidence: evidence,
      intensity: paceZone === 'T' || paceZone === 'I' || paceZone === 'R' ? 'hard' : 'moderate',
    };
  }

  if (keywordType === 'hill' || (distanceKm <= 12 && elevationRatio >= 0.03 && structure.shortRepCount >= 3)) {
    evidence.push(keywordType === 'hill' ? 'name/description indicates hill workout' : `high climb ratio ${(elevationRatio * 1000).toFixed(0)}m/km with repeated short reps`);
    return {
      workoutType: 'hill',
      workoutTypeConfidence: keywordType === 'hill' ? 'high' : 'medium',
      workoutTypeEvidence: evidence,
      intensity: 'hard',
    };
  }

  if (
    structure.lapCount >= 4 &&
    structure.shortRepCount >= 3 &&
    (structure.fastRepCount >= 2 || structure.recoveryRepCount >= 2) &&
    (structure.splitPattern === 'interval' || (structure.paceVariability ?? 0) >= 0.12)
  ) {
    evidence.push(`${structure.lapCount} laps with ${structure.shortRepCount} short reps`);
    if (structure.fastRepCount > 0 || structure.recoveryRepCount > 0) {
      evidence.push(`${structure.fastRepCount} faster reps and ${structure.recoveryRepCount} recovery reps`);
    }
    if (structure.hasWarmup || structure.hasCooldown) {
      evidence.push('warmup/cooldown pattern detected');
    }
    return {
      workoutType: structure.medianLapDistance && structure.medianLapDistance <= 1200 ? 'interval' : 'fartlek',
      workoutTypeConfidence: 'high',
      workoutTypeEvidence: evidence,
      intensity: 'hard',
    };
  }

  if (keywordType === 'interval' || keywordType === 'fartlek') {
    evidence.push(`keyword match: ${keywordType}`);
    if (structure.splitPattern !== 'unknown') {
      evidence.push(`split pattern ${structure.splitPattern}`);
    }
    return {
      workoutType: keywordType,
      workoutTypeConfidence: structure.splitPattern === 'interval' ? 'high' : 'medium',
      workoutTypeEvidence: evidence,
      intensity: 'hard',
    };
  }

  if (keywordType === 'progression' || structure.splitPattern === 'progression') {
    evidence.push(keywordType === 'progression' ? 'keyword match: progression' : 'split pattern progression');
    return {
      workoutType: 'progression',
      workoutTypeConfidence: keywordType === 'progression' ? 'high' : 'medium',
      workoutTypeEvidence: evidence,
      intensity: paceZone === 'T' || paceZone === 'I' || paceZone === 'R' ? 'hard' : 'moderate',
    };
  }

  if (
    structure.source === 'laps' &&
    structure.lapCount >= 4 &&
    structure.shortRepCount >= 4 &&
    (structure.medianLapDistance ?? Number.POSITIVE_INFINITY) <= 2000
  ) {
    evidence.push(`${structure.lapCount} lap structure with ${structure.shortRepCount} short segments`);
    if (structure.splitPattern !== 'unknown') {
      evidence.push(`split pattern ${structure.splitPattern}`);
    }
    if ((structure.paceVariability ?? 0) < 0.08) {
      evidence.push('lap structure has low pace contrast, analyze reps rather than average pace');
    }
    return {
      workoutType: 'interval',
      workoutTypeConfidence: 'medium',
      workoutTypeEvidence: evidence,
      intensity: paceZone === 'T' || paceZone === 'I' || paceZone === 'R' ? 'hard' : 'moderate',
    };
  }

  if (keywordType === 'threshold' || keywordType === 'tempo') {
    evidence.push(`keyword match: ${keywordType}`);
    return {
      workoutType: keywordType,
      workoutTypeConfidence: 'high',
      workoutTypeEvidence: evidence,
      intensity: 'hard',
    };
  }

  if (isExplicitWorkout) {
    if (structure.splitPattern !== 'unknown') {
      evidence.push(`split pattern ${structure.splitPattern}`);
    }
    return {
      workoutType: 'workout',
      workoutTypeConfidence: 'high',
      workoutTypeEvidence: evidence,
      intensity: paceZone === 'T' || paceZone === 'I' || paceZone === 'R' ? 'hard' : 'moderate',
    };
  }

  if (distanceKm >= 15) {
    evidence.push(`distance ${distanceKm.toFixed(1)}km`);
    return {
      workoutType: 'long-run',
      workoutTypeConfidence: 'medium',
      workoutTypeEvidence: evidence,
      intensity: paceZone === 'T' ? 'hard' : 'moderate',
    };
  }

  if (keywordType === 'recovery') {
    return {
      workoutType: 'recovery',
      workoutTypeConfidence: 'high',
      workoutTypeEvidence: ['keyword match: recovery'],
      intensity: 'easy',
    };
  }

  if (keywordType === 'easy') {
    return {
      workoutType: 'easy',
      workoutTypeConfidence: 'high',
      workoutTypeEvidence: ['keyword match: easy'],
      intensity: 'easy',
    };
  }

  if (
    hrAssessment.avgZone === 'z4' &&
    structure.splitPattern === 'steady' &&
    distanceKm >= 4 &&
    distanceKm <= 16 &&
    (paceZone === 'M' || paceZone === 'T')
  ) {
    evidence.push(`average HR sits in threshold zone (${Math.round(hrAssessment.average ?? 0)} bpm)`);
    if (paceAssessment.evidence.length > 0) {
      evidence.push(...paceAssessment.evidence);
    }
    return {
      workoutType: 'threshold',
      workoutTypeConfidence: paceAssessment.exactMatch ? 'high' : 'medium',
      workoutTypeEvidence: evidence,
      intensity: 'hard',
    };
  }

  if (
    (hrAssessment.avgZone === 'z1' || hrAssessment.avgZone === 'z2') &&
    structure.splitPattern === 'steady' &&
    distanceKm <= 12 &&
    (
      paceZone === 'M'
      || paceZone === 'T'
      || (paceZone === 'I' && paceAssessment.confidence === 'low')
    )
  ) {
    evidence.push(`average HR stayed in low aerobic zone (${Math.round(hrAssessment.average ?? 0)} bpm)`);
    if (paceAssessment.evidence.length > 0) {
      evidence.push(...paceAssessment.evidence);
    }

    const shortLowCostRecovery =
      hrAssessment.avgZone === 'z1' &&
      distanceKm <= 8 &&
      durationMinutes <= 55 &&
      (hrAssessment.maxZone === 'z1' || hrAssessment.maxZone === 'z2' || hrAssessment.maxZone === 'unknown');

    const aerobicVolumeWithoutRecoveryProfile =
      distanceKm >= 9 ||
      durationMinutes >= 50 ||
      hrAssessment.maxZone === 'z3' ||
      paceZone === 'M';

    if (shortLowCostRecovery) {
      evidence.push('short duration with very low cardiac cost');
      return {
        workoutType: 'recovery',
        workoutTypeConfidence: 'medium',
        workoutTypeEvidence: evidence,
        intensity: 'easy',
      };
    }

    if (hrAssessment.avgZone === 'z1' && aerobicVolumeWithoutRecoveryProfile) {
      evidence.push('aerobic volume with low heart-rate cost');
      return {
        workoutType: 'easy',
        workoutTypeConfidence: 'medium',
        workoutTypeEvidence: evidence,
        intensity: 'easy',
      };
    }

    if (hrAssessment.avgZone === 'z2') {
      evidence.push('steady aerobic effort without recovery-only profile');
      return {
        workoutType: 'easy',
        workoutTypeConfidence: paceAssessment.exactMatch ? 'medium' : 'low',
        workoutTypeEvidence: evidence,
        intensity: 'easy',
      };
    }

    return {
      workoutType: 'recovery',
      workoutTypeConfidence: 'medium',
      workoutTypeEvidence: evidence,
      intensity: 'easy',
    };
  }

  if (paceZone === 'T' && paceAssessment.exactMatch) {
    evidence.push(...paceAssessment.evidence);
    if (hrAssessment.avgZone !== 'unknown' && hrAssessment.avgZone !== 'z4' && hrAssessment.avgZone !== 'z5') {
      evidence.push(`average HR stayed below threshold zone (${Math.round(hrAssessment.average ?? 0)} bpm)`);
    }
    return {
      workoutType: 'threshold',
      workoutTypeConfidence: 'medium',
      workoutTypeEvidence: evidence,
      intensity: 'hard',
    };
  }

  if (paceZone === 'T' && !paceAssessment.exactMatch) {
    evidence.push(...paceAssessment.evidence);
    return {
      workoutType: 'tempo',
      workoutTypeConfidence: 'low',
      workoutTypeEvidence: evidence,
      intensity: 'moderate',
    };
  }

  if (paceZone === 'I' || paceZone === 'R') {
    evidence.push(...paceAssessment.evidence);
    if (structure.splitPattern === 'mixed' || structure.splitPattern === 'unknown') {
      evidence.push('no clear repeat structure, possibly steady hard effort');
    }
    return {
      workoutType: 'tempo',
      workoutTypeConfidence: 'low',
      workoutTypeEvidence: evidence,
      intensity: 'hard',
    };
  }

  if (paceZone === 'M') {
    evidence.push(...paceAssessment.evidence);
    return {
      workoutType: 'tempo',
      workoutTypeConfidence: 'low',
      workoutTypeEvidence: evidence,
      intensity: 'moderate',
    };
  }

  if (paceZone === 'E') {
    const avgHeartrate = activity.average_heartrate ?? 0;
    if (avgHeartrate > 0 && distanceKm <= 10 && avgHeartrate <= 145) {
      evidence.push(...paceAssessment.evidence);
      evidence.push('easy pace with low aerobic heart rate');
      return {
        workoutType: 'recovery',
        workoutTypeConfidence: 'low',
        workoutTypeEvidence: evidence,
        intensity: 'easy',
      };
    }
    evidence.push(...paceAssessment.evidence);
    evidence.push('easy-zone pace without workout structure');
    return {
      workoutType: 'easy',
      workoutTypeConfidence: 'medium',
      workoutTypeEvidence: evidence,
      intensity: 'easy',
    };
  }

  return {
    workoutType: keywordType ?? 'unknown',
    workoutTypeConfidence: keywordType ? 'medium' : 'low',
    workoutTypeEvidence: keywordType ? [`keyword match: ${keywordType}`] : ['insufficient workout-structure evidence'],
    intensity: 'moderate',
  };
}

function areWorkoutTypesComparable(left: WorkoutType, right: WorkoutType): boolean {
  if (left === right) return true;
  const groups: WorkoutType[][] = [
    ['easy', 'recovery'],
    ['threshold', 'tempo'],
    ['interval', 'fartlek'],
    ['workout', 'interval', 'fartlek', 'threshold', 'tempo', 'progression', 'hill'],
    ['treadmill', 'easy', 'recovery'],
  ];
  return groups.some((group) => group.includes(left) && group.includes(right));
}

function shouldCountWorkoutMix(classification: ActivityClassification): boolean {
  if (classification.isRace) return false;
  if (classification.workoutType === 'unknown') return false;
  return classification.workoutTypeConfidence !== 'low';
}

/**
 * Check if activity is a race based on workout_type or name
 */
export function classifyActivity(
  activity: StravaActivity,
  paceZones?: PaceZones | null,
  paceZoneModelReliability: EstimatedPBs['reliability'] = 'medium',
  lthr?: number | null
): ActivityClassification {
  // Check workout_type - 1 = Race in Strava API
  const isWorkoutRace = activity.workout_type === 1;
  
  // Check name for race indicators
  const raceKeywords = ['比赛', '马拉松', '半马', '全马', 'marathon', 'half marathon', 'race', '10k', '5k'];
  const nameLower = activity.name.toLowerCase();
  const hasRaceInName = raceKeywords.some(kw => nameLower.includes(kw.toLowerCase()));
  
  const isRace = isWorkoutRace || hasRaceInName;
  
  // Determine race type from distance
  let raceType = null;
  const distKm = activity.distance / 1000;
  if (isRace) {
    if (distKm >= 40) raceType = '马拉松';
    else if (distKm >= 21) raceType = '半程马拉松';
    else if (distKm >= 9.5 && distKm <= 10.5) raceType = '10公里';
    else if (distKm >= 4.8 && distKm <= 5.3) raceType = '5公里';
    else raceType = '比赛';
  }

  const structure = summarizeActivityStructure(activity);
  const paceAssessment: PaceZoneAssessment = assessPaceZoneForActivity(activity, paceZones, paceZoneModelReliability);
  const paceZone = paceAssessment.zone;

  if (isRace) {
    return {
      isRace,
      raceType,
      intensity: 'extreme',
      paceZone,
      paceZoneConfidence: paceAssessment.confidence,
      paceZoneExactMatch: paceAssessment.exactMatch,
      paceZoneGapSeconds: paceAssessment.gapSeconds,
      workoutType: 'race',
      workoutTypeConfidence: 'high',
      workoutTypeEvidence: isWorkoutRace ? ['Strava workout_type=1'] : ['activity name matches race keywords'],
      structure,
    };
  }

  const workoutInfo = inferWorkoutType(activity, structure, paceAssessment, lthr);
  
  return {
    isRace,
    raceType,
    intensity: workoutInfo.intensity,
    paceZone,
    paceZoneConfidence: paceAssessment.confidence,
    paceZoneExactMatch: paceAssessment.exactMatch,
    paceZoneGapSeconds: paceAssessment.gapSeconds,
    workoutType: workoutInfo.workoutType,
    workoutTypeConfidence: workoutInfo.workoutTypeConfidence,
    workoutTypeEvidence: workoutInfo.workoutTypeEvidence,
    structure,
  };
}

/**
 * Analyze user's activity history to build training profile
 */
export function analyzeTrainingHistory(
  activities: StravaActivity[],
  currentActivity: StravaActivity,
  officialPBs?: Record<string, number> | null,
  lthr?: number | null
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
    (a, b) => getActivityTimestamp(b) - getActivityTimestamp(a)
  );

  // Estimate PBs from best efforts and actual race results
  // Include current activity (which has splits_metric) and official PBs in the analysis
  const estimatedPBs = estimatePBs(sortedRuns, currentActivity, officialPBs);
  
  // Calculate pace zones from estimated 5k PB
  const paceZones = calculatePaceZones(estimatedPBs['5k']);
  
  // Calculate physiology metrics (VO2max, LT, Running Economy)
  const physiologyMetrics = calculatePhysiologyMetrics(estimatedPBs);
  
  // Detect training patterns
  const patterns = detectTrainingPatterns(sortedRuns, paceZones, estimatedPBs.reliability, lthr);
  
  // Calculate weekly load (last 8 weeks)
  const recentLoad = calculateWeeklyLoad(sortedRuns, 8);
  
  // Compare with similar activities
  const similarStats = compareSimilarActivities(sortedRuns, currentActivity, paceZones, estimatedPBs.reliability, lthr);
  const thermalStats = compareSimilarTemperatureActivities(
    sortedRuns,
    currentActivity,
    paceZones,
    estimatedPBs.reliability,
    lthr
  );

  return {
    estimatedPBs,
    paceZones,
    patterns,
    physiologyMetrics,
    recentLoad,
    similarStats,
    thermalStats,
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
function estimatePBs(runs: StravaActivity[], currentActivity?: StravaActivity, officialPBs?: Record<string, number> | null): EstimatedPBs {
  const pbs: Record<string, number> = {};
  const sources: Record<string, 'actual' | 'estimated'> = {};
  
  // Priority 0: Use official PBs from Strava if available (most reliable)
  if (officialPBs) {
    // Map official PBs to our format
    const pbMapping: Record<string, string> = {
      '1k': '1k',
      '5k': '5k',
      '10k': '10k',
      '15k': '15k',
      '20k': '20k',
      '21k': '21k',
      '30k': '30k',
      '42k': '42k',
    };
    
    for (const [key, value] of Object.entries(officialPBs)) {
      const mappedKey = pbMapping[key];
      if (mappedKey && value > 0) {
        pbs[mappedKey] = value;
        sources[mappedKey] = 'actual';
      }
    }
    
    // If we have official PBs, fill missing distances using Riegel formula
    if (Object.keys(pbs).length >= 1) {
      // Find the best reference PB (prefer middle distances: 10k > 5k > 21k > 42k)
      let refDist = 0;
      let refTime = 0;
      
      if (pbs['10k'] && pbs['10k'] > 0) {
        refDist = 10; refTime = pbs['10k'];
      } else if (pbs['5k'] && pbs['5k'] > 0) {
        refDist = 5; refTime = pbs['5k'];
      } else if (pbs['21k'] && pbs['21k'] > 0) {
        refDist = 21.0975; refTime = pbs['21k'];
      } else if (pbs['42k'] && pbs['42k'] > 0) {
        refDist = 42.195; refTime = pbs['42k'];
      }
      
      if (refDist > 0 && refTime > 0) {
        // Fill missing distances using Riegel projection from reference
        if (!pbs['1k'] || pbs['1k'] === 0) {
          pbs['1k'] = Math.round(refTime * Math.pow(1 / refDist, RIEGEL_EXPONENT));
          sources['1k'] = 'estimated';
        }
        if (!pbs['3k'] || pbs['3k'] === 0) {
          pbs['3k'] = Math.round(refTime * Math.pow(3 / refDist, RIEGEL_EXPONENT));
          sources['3k'] = 'estimated';
        }
        if (!pbs['5k'] || pbs['5k'] === 0) {
          pbs['5k'] = Math.round(refTime * Math.pow(5 / refDist, RIEGEL_EXPONENT));
          sources['5k'] = 'estimated';
        }
        if (!pbs['10k'] || pbs['10k'] === 0) {
          pbs['10k'] = Math.round(refTime * Math.pow(10 / refDist, RIEGEL_EXPONENT));
          sources['10k'] = 'estimated';
        }
        if (!pbs['21k'] || pbs['21k'] === 0) {
          pbs['21k'] = Math.round(refTime * Math.pow(21.0975 / refDist, RIEGEL_EXPONENT));
          sources['21k'] = 'estimated';
        }
        if (!pbs['42k'] || pbs['42k'] === 0) {
          pbs['42k'] = Math.round(refTime * Math.pow(42.195 / refDist, RIEGEL_EXPONENT));
          sources['42k'] = 'estimated';
        }
      }
      
      return {
        '1k': pbs['1k'] || 0,
        '3k': pbs['3k'] || 0,
        '5k': pbs['5k'] || 0,
        '10k': pbs['10k'] || 0,
        '21k': pbs['21k'] || 0,
        '42k': pbs['42k'] || 0,
        reliability: 'high',
        sources,
      };
    }
  }
  
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
 * Prioritizes actual races (workout_type = 1)
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
         (r.workout_type === 1 || classifyActivity(r).isRace)
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
  return calculateSemanticPaceZones(pb5kSeconds);
}

/**
 * Detect training patterns and deficiencies
 */
function detectTrainingPatterns(
  runs: StravaActivity[],
  paceZones: PaceZones,
  paceZoneModelReliability: EstimatedPBs['reliability'] = 'medium',
  lthr?: number | null
): TrainingPatterns {
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
      workoutTypeCounts: {},
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
    const date = getActivityDate(run);
    const week = getISOWeek(date);
    const weekKey = `${week.year}-W${week.week}`;
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
  const { hasIntervalWorkouts, hasTempoWorkouts, workoutTypeCounts } = detectWorkoutTypes(
    runs,
    paceZones,
    paceZoneModelReliability,
    lthr
  );
  
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
    workoutTypeCounts,
    trainingDeficiencies: deficiencies,
  };
}

function detectWorkoutTypes(
  runs: StravaActivity[],
  paceZones: PaceZones,
  paceZoneModelReliability: EstimatedPBs['reliability'] = 'medium',
  lthr?: number | null
) {
  let hasIntervalWorkouts = false;
  let hasTempoWorkouts = false;
  const workoutTypeCounts: Partial<Record<WorkoutType, number>> = {};

  const recentRuns = runs.slice(0, 30);
  
  for (const run of recentRuns) {
    const classification = classifyActivity(run, paceZones, paceZoneModelReliability, lthr);
    if (shouldCountWorkoutMix(classification)) {
      workoutTypeCounts[classification.workoutType] = (workoutTypeCounts[classification.workoutType] || 0) + 1;
    }
    
    // Skip races for workout type detection
    if (classification.isRace) continue;
    
    if (
      classification.workoutTypeConfidence !== 'low' &&
      (
        classification.workoutType === 'interval' ||
        classification.workoutType === 'fartlek' ||
        classification.workoutType === 'hill'
      )
    ) {
      hasIntervalWorkouts = true;
    }
    
    if (
      classification.workoutTypeConfidence !== 'low' &&
      (
        classification.workoutType === 'tempo' ||
        classification.workoutType === 'threshold' ||
        classification.workoutType === 'progression'
      )
    ) {
      hasTempoWorkouts = true;
    }
  }

  return { hasIntervalWorkouts, hasTempoWorkouts, workoutTypeCounts };
}

function calculateWeeklyLoad(runs: StravaActivity[], weeks: number): WeeklyLoad[] {
  const result: WeeklyLoad[] = [];
  const now = new Date();
  
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const weekRuns = runs.filter(r => {
      const runDate = getActivityDate(r);
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
      week: formatLocalDateKey(weekStart),
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
  currentActivity: StravaActivity,
  paceZones: PaceZones,
  paceZoneModelReliability: EstimatedPBs['reliability'] = 'medium',
  lthr?: number | null
): SimilarActivityStats | null {
  const currentDistance = currentActivity.distance;
  const currentPace = currentActivity.moving_time / currentDistance * 1000 / 60;
  
  // For long runs (>=15km), use a tighter ±12% match to avoid mixing
  // different distances (e.g., 21k half-marathon race vs 27k LSD).
  // For shorter runs, keep the looser ±20% match.
  const distanceThreshold = currentDistance >= 15000 ? 0.12 : 0.2;
  
  // Find similar runs (within distance threshold), excluding races when comparing to easy runs
  const currentClassification = classifyActivity(currentActivity, paceZones, paceZoneModelReliability, lthr);
  const currentIsRace = currentClassification.isRace;
  
  const strictSimilarRuns = runs.filter(r => {
    if (r.id === currentActivity.id) return false;
    if (Math.abs(r.distance - currentDistance) / currentDistance >= distanceThreshold) return false;
    if (r.distance <= 1000) return false;
    
    // If current is race, compare to other races
    // If current is easy run, compare to other easy runs
    const runClassification = classifyActivity(r, paceZones, paceZoneModelReliability, lthr);
    if (currentIsRace !== runClassification.isRace) return false;

    if (
      currentClassification.workoutTypeConfidence === 'low' ||
      runClassification.workoutTypeConfidence === 'low'
    ) {
      return false;
    }

    const comparableByType =
      areWorkoutTypesComparable(currentClassification.workoutType, runClassification.workoutType);

    return comparableByType;
  });
  
  const fallbackSimilarRuns = runs.filter(r => 
    r.id !== currentActivity.id &&
    Math.abs(r.distance - currentDistance) / currentDistance < distanceThreshold &&
    r.distance > 1000 &&
    classifyActivity(r, paceZones, paceZoneModelReliability, lthr).isRace === currentIsRace
  );

  if (strictSimilarRuns.length === 0 && fallbackSimilarRuns.length === 0) {
    return null;
  }

  const useRuns = strictSimilarRuns.length > 0 ? strictSimilarRuns : fallbackSimilarRuns;
  const comparisonMode: SimilarActivityStats['comparisonMode'] = strictSimilarRuns.length > 0 ? 'strict' : 'fallback';
  
  const paces = useRuns.map(r => r.moving_time / r.distance * 1000 / 60);
  const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
  const bestPace = Math.min(...paces);
  const avgDistance = useRuns.reduce((sum, r) => sum + r.distance, 0) / useRuns.length;
  
  const sortedPaces = [...paces].sort((a, b) => a - b);
  const slowerCount = sortedPaces.filter(p => p > currentPace).length;
  const yourPaceRank = Math.round((slowerCount / sortedPaces.length) * 100);
  
  const recentSimilar = useRuns.slice(0, 5);
  const recentPaces = recentSimilar.map(r => r.moving_time / r.distance * 1000 / 60);
  const olderPaces = useRuns.slice(5, 10).map(r => r.moving_time / r.distance * 1000 / 60);
  
  let trendDirection: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentPaces.length >= 3 && olderPaces.length >= 3) {
    const recentAvg = recentPaces.reduce((a, b) => a + b, 0) / recentPaces.length;
    const olderAvg = olderPaces.reduce((a, b) => a + b, 0) / olderPaces.length;
    // Use 5% threshold to avoid noise from easy/recovery runs in recent sessions
    if (recentAvg < olderAvg * 0.95) {
      trendDirection = 'improving';
    } else if (recentAvg > olderAvg * 1.05) {
      trendDirection = 'declining';
    }
  }
  
  const recentAvgPace = recentPaces.length > 0 ? recentPaces.reduce((a, b) => a + b, 0) / recentPaces.length : avgPace;
  const olderAvgPace = olderPaces.length > 0 ? olderPaces.reduce((a, b) => a + b, 0) / olderPaces.length : avgPace;

  const sampleConfidence: SimilarActivityStats['sampleConfidence'] =
    comparisonMode === 'fallback'
      ? 'low'
      : useRuns.length >= 8
        ? 'high'
        : useRuns.length >= 4
          ? 'medium'
          : 'low';

  return {
    count: useRuns.length,
    strictCount: strictSimilarRuns.length,
    avgPace,
    bestPace,
    avgDistance,
    yourPaceRank,
    trendDirection,
    recentAvgPace,
    olderAvgPace,
    comparisonMode,
    sampleConfidence,
  };
}

function compareSimilarTemperatureActivities(
  runs: StravaActivity[],
  currentActivity: StravaActivity,
  paceZones: PaceZones,
  paceZoneModelReliability: EstimatedPBs['reliability'] = 'medium',
  lthr?: number | null
): ThermalComparisonStats | null {
  const currentTemperature = currentActivity.average_temp;
  if (!Number.isFinite(currentTemperature) || currentTemperature! < 10 || currentTemperature! > 50) return null;

  const currentDistance = currentActivity.distance;
  const currentPaceSeconds = currentActivity.moving_time / (currentDistance / 1000);
  const currentClimbPerKm = currentActivity.total_elevation_gain / Math.max(1, currentDistance / 1000);
  const currentClassification = classifyActivity(
    currentActivity,
    paceZones,
    paceZoneModelReliability,
    lthr
  );
  const distanceThreshold = currentDistance >= 15000 ? 0.12 : 0.2;

  const comparableRuns = runs.filter((run) => {
    if (run.id === currentActivity.id || run.distance <= 1000) return false;
    if (!Number.isFinite(run.average_temp) || Math.abs(run.average_temp! - currentTemperature!) > 3) return false;
    if (Math.abs(run.distance - currentDistance) / currentDistance >= distanceThreshold) return false;

    const runClimbPerKm = run.total_elevation_gain / Math.max(1, run.distance / 1000);
    if (Math.abs(runClimbPerKm - currentClimbPerKm) > 15) return false;

    const runClassification = classifyActivity(run, paceZones, paceZoneModelReliability, lthr);
    if (runClassification.isRace !== currentClassification.isRace) return false;
    if (
      currentClassification.workoutTypeConfidence !== 'low'
      && runClassification.workoutTypeConfidence !== 'low'
      && !areWorkoutTypesComparable(currentClassification.workoutType, runClassification.workoutType)
    ) return false;

    return true;
  });

  if (comparableRuns.length < 2) return null;

  const averageTemperature = comparableRuns.reduce((sum, run) => sum + run.average_temp!, 0) / comparableRuns.length;
  const averagePaceSeconds = comparableRuns.reduce(
    (sum, run) => sum + run.moving_time / (run.distance / 1000),
    0
  ) / comparableRuns.length;
  const heartRateRuns = comparableRuns.filter(
    (run) => Number.isFinite(run.average_heartrate) && run.average_heartrate! > 0
  );
  const averageHeartRate = heartRateRuns.length > 0
    ? heartRateRuns.reduce((sum, run) => sum + run.average_heartrate!, 0) / heartRateRuns.length
    : null;
  const sampleConfidence: ClassificationConfidence = comparableRuns.length >= 8
    ? 'high'
    : comparableRuns.length >= 4
      ? 'medium'
      : 'low';

  return {
    count: comparableRuns.length,
    currentTemperature: Math.round(currentTemperature! * 10) / 10,
    averageTemperature: Math.round(averageTemperature * 10) / 10,
    averagePaceSeconds: Math.round(averagePaceSeconds),
    paceDifferenceSeconds: Math.round(currentPaceSeconds - averagePaceSeconds),
    averageHeartRate: averageHeartRate === null ? null : Math.round(averageHeartRate),
    heartRateDifference: averageHeartRate === null || !currentActivity.average_heartrate
      ? null
      : Math.round(currentActivity.average_heartrate - averageHeartRate),
    sampleConfidence,
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
  const total = Math.round(secondsPerKm);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
}
