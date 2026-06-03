// V2 AI Analysis - Professional coach-level insights
export interface AIAnalysis {
  summary: string;
  intensity: 'easy' | 'moderate' | 'hard' | 'extreme';
  recoveryHours: number;
  comparisonToAverage: string;
  suggestions: string[];
  generatedAt: number;

  // V2 additions
  paceZoneAnalysis: {
    zone: string;
    description: string;
    appropriateness: 'appropriate' | 'too-fast' | 'too-slow';
  } | null;
  trainingLoadContext: string;
  similarActivitiesInsight: string;
  nextWorkoutSuggestion: string;
  warnings: string[];

  /** True when the analysis was generated locally as a fallback (AI API unavailable). */
  isFallback?: boolean;
}

export interface UserProfile {
  avgPace: number;
  avgHeartRate: number;
  avgDistance: number;
  avgDuration: number;
  totalRuns: number;
  weeklyDistance: number;
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'unknown';
  lastUpdated: number;
}

export interface UserPhysique {
  height?: number | null; // cm
  weight?: number | null; // kg
}
