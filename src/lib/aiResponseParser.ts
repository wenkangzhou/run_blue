import { StravaActivity } from '@/types';
import type { AIAnalysis } from './aiTypes';
import type { ActivityClassification, TrainingProfile } from './trainingAnalysis';
import { buildAccurateComparison } from './aiComparison';

function parseWeatherContext(activity: StravaActivity): { temperature?: number; feelsLike?: number; humidity?: number } {
  const result: { temperature?: number; feelsLike?: number; humidity?: number } = {};

  if (typeof activity.average_temp === 'number' && Number.isFinite(activity.average_temp)) {
    result.temperature = Math.round(activity.average_temp);
  }

  const description = activity.description || '';
  const tempMatch = description.match(/(?:Feels like|体感[温度]*[:\s]*)([\d.]+)\s*[°℃]?\s*C?/i);
  if (tempMatch) {
    result.feelsLike = parseFloat(tempMatch[1]);
  }
  const humidityMatch = description.match(/(?:湿度|Humidity)[:\s]*([\d]+)\s*%?/i) || description.match(/💧?\s*([\d]+)\s*%/);
  if (humidityMatch) {
    result.humidity = parseInt(humidityMatch[1], 10);
  }

  return result;
}

function getThermalSeverity(activity: StravaActivity): 'neutral' | 'muggy' | 'heat-load' | 'heat-stress' {
  const weather = parseWeatherContext(activity);
  const temp = weather.feelsLike ?? weather.temperature;
  const humidity = weather.humidity;

  if (
    (temp !== undefined && temp >= 30) ||
    ((weather.feelsLike ?? 0) >= 32) ||
    (temp !== undefined && temp >= 28 && humidity !== undefined && humidity >= 80)
  ) {
    return 'heat-stress';
  }

  if (
    (temp !== undefined && temp >= 26) ||
    ((weather.feelsLike ?? 0) >= 29) ||
    (temp !== undefined && temp >= 24 && humidity !== undefined && humidity >= 78)
  ) {
    return 'heat-load';
  }

  if ((humidity !== undefined && humidity >= 70) || (temp !== undefined && temp >= 22)) {
    return 'muggy';
  }

  return 'neutral';
}

function normalizeConfidenceText(text: string, locale: string): string {
  if (!text || locale.startsWith('en')) return text;

  return text
    .replace(/（?\s*confidence\s*[:：]\s*high\s*）?/gi, '高置信度')
    .replace(/（?\s*confidence\s*[:：]\s*medium\s*）?/gi, '中等置信度')
    .replace(/（?\s*confidence\s*[:：]\s*low\s*）?/gi, '低置信度')
    .replace(/置信度\s*[:：]\s*high/gi, '置信度：高')
    .replace(/置信度\s*[:：]\s*medium/gi, '置信度：中等')
    .replace(/置信度\s*[:：]\s*low/gi, '置信度：低')
    .replace(/\bhigh confidence\b/gi, '高置信度')
    .replace(/\bmedium confidence\b/gi, '中等置信度')
    .replace(/\blow confidence\b/gi, '低置信度');
}

function normalizeThermalText(text: string, activity: StravaActivity, locale: string): string {
  if (!text || locale.startsWith('en')) return text;

  const severity = getThermalSeverity(activity);
  if (severity === 'heat-stress') return text;

  if (severity === 'heat-load') {
    return text
      .replace(/高温高湿环境/g, '偏热环境')
      .replace(/热应激环境/g, '热负荷环境')
      .replace(/热应激下/g, '热负荷下')
      .replace(/热应激/g, '热负荷');
  }

  if (severity === 'muggy') {
    return text
      .replace(/高温高湿环境/g, '偏闷湿环境')
      .replace(/热应激环境/g, '偏闷湿环境')
      .replace(/热应激下/g, '偏闷湿环境下')
      .replace(/热应激/g, '闷热负荷');
  }

  return text
    .replace(/高温高湿环境/g, '当前天气条件')
    .replace(/热应激环境/g, '当前天气条件')
    .replace(/热应激下/g, '当前天气下')
    .replace(/热应激/g, '天气因素');
}

function normalizeLowIntensityText(
  text: string,
  classification: ActivityClassification,
  locale: string
): string {
  if (!text || locale.startsWith('en')) return text;
  if (classification.workoutType !== 'easy' && classification.workoutType !== 'recovery') return text;

  return text
    .replace(/排名垫底/g, '配速位于这组样本后段')
    .replace(/需区分是主动恢复还是能力模型漂移导致配速区间失准/g, '更需要先确认这是否是一堂按恢复意图执行的低压力训练')
    .replace(/建议下次同类训练尝试贴近[^，。；]*以校准能力模型/g, '建议后续用一次稳态有氧跑再校准能力模型，不必在恢复跑里追配速');
}

function shouldUseSystemInsight(text: string, trainingProfile: TrainingProfile): boolean {
  const similarStats = trainingProfile.similarStats;
  if (!similarStats) return false;
  if (!text.trim()) return true;
  if (similarStats.sampleConfidence === 'low' || similarStats.comparisonMode === 'fallback') {
    return true;
  }
  return /(?:\btop\s*\d+%|\bbest ever\b|\bworst\b|\d+%\s+of|前\d+%|超过\s*\d+%|历史最佳|历史最差|历史最[好差佳])/i.test(text);
}

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
    ? buildAccurateComparison(activity, similarStats, locale, classification.workoutType)
    : null;
  const normalizeForDisplay = (text: string) =>
    normalizeLowIntensityText(
      normalizeThermalText(normalizeConfidenceText(text, locale), activity, locale),
      classification,
      locale
    );
  const normalizedSummary = normalizeForDisplay(result.summary || '训练分析完成');
  const normalizedTrainingLoadContext = normalizeForDisplay(result.trainingLoadContext || '');
  const normalizedNextWorkoutSuggestion = normalizeForDisplay(
    result.nextWorkoutSuggestion || (classification.isRace ? '赛后请充分休息恢复' : ''),
  );
  const normalizedSuggestions = Array.isArray(result.suggestions)
    ? result.suggestions.map((suggestion: string) => normalizeForDisplay(suggestion))
    : [];
  const normalizedWarnings = Array.isArray(result.warnings)
    ? result.warnings.map((warning: string) => normalizeForDisplay(warning))
    : (classification.isRace ? ['这是高强度比赛，需要充分恢复'] : []);
  const normalizedAIInsight = normalizeForDisplay(result.similarActivitiesInsight || '');

  return {
    summary: normalizedSummary,
    intensity: finalIntensity,
    recoveryHours: result.recoveryHours || (classification.isRace ? 48 : 24),
    comparisonToAverage: comparisonOverride?.comparisonToAverage || result.comparisonToAverage || '',
    suggestions: normalizedSuggestions,
    generatedAt: Date.now(),
    paceZoneAnalysis: result.paceZoneAnalysis || null,
    trainingLoadContext: normalizedTrainingLoadContext,
    similarActivitiesInsight: comparisonOverride && shouldUseSystemInsight(normalizedAIInsight, trainingProfile)
      ? comparisonOverride.similarActivitiesInsight
      : normalizedAIInsight || comparisonOverride?.similarActivitiesInsight || '',
    nextWorkoutSuggestion: normalizedNextWorkoutSuggestion,
    warnings: normalizedWarnings,
  };
}
