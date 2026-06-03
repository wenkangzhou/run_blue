import { StravaActivity } from '@/types';
import type { AIAnalysis } from './aiTypes';
import type { ActivityClassification, TrainingProfile } from './trainingAnalysis';
import { buildAccurateComparison } from './aiComparison';

/**
 * Parse AI JSON response into AIAnalysis struct.
 */
export function parseAIResponse(
  content: string,
  activity: StravaActivity,
  trainingProfile: TrainingProfile,
  classification: ActivityClassification,
  locale: string = 'zh'
): AIAnalysis {
  // Extract JSON if wrapped in markdown
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
                    content.match(/```\n?([\s\S]*?)\n?```/) ||
                    [null, content];
  const jsonStr = jsonMatch[1].trim();
  const result = JSON.parse(jsonStr);

  // Override intensity for races
  const finalIntensity = classification.isRace ? 'extreme' : (result.intensity || 'moderate');

  // Override comparison fields with accurate program-generated text
  const { similarStats } = trainingProfile;
  const comparisonOverride = similarStats
    ? buildAccurateComparison(activity, similarStats, locale)
    : null;

  return {
    summary: result.summary || '训练分析完成',
    intensity: finalIntensity,
    recoveryHours: result.recoveryHours || (classification.isRace ? 48 : 24),
    comparisonToAverage: comparisonOverride?.comparisonToAverage || result.comparisonToAverage || '',
    suggestions: result.suggestions || [],
    generatedAt: Date.now(),
    paceZoneAnalysis: result.paceZoneAnalysis || null,
    trainingLoadContext: result.trainingLoadContext || '',
    similarActivitiesInsight: result.similarActivitiesInsight || comparisonOverride?.similarActivitiesInsight || '',
    nextWorkoutSuggestion: result.nextWorkoutSuggestion || (classification.isRace ? '赛后请充分休息恢复' : ''),
    warnings: result.warnings || (classification.isRace ? ['这是高强度比赛，需要充分恢复'] : []),
  };
}
