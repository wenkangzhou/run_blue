import { StravaActivity } from '@/types';
import type { AIAnalysis } from './aiTypes';
import type { ActivityClassification, TrainingProfile } from './trainingAnalysis';
import { buildAccurateComparison } from './aiComparison';
import { buildActivityWeatherContext } from './weather';
import { getPrimaryPersonalRecord } from './activityAchievements';

function formatRecordTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getWeatherFact(activity: StravaActivity, locale: string): string {
  const weather = buildActivityWeatherContext(activity);
  const en = locale.startsWith('en');
  const facts: string[] = [];
  if (weather.feelsLikeC !== undefined) {
    facts.push(en ? `feels like ${weather.feelsLikeC}°C` : `体感 ${weather.feelsLikeC}°C`);
  } else if (weather.temperatureC !== undefined) {
    facts.push(en ? `${weather.temperatureC}°C` : `${weather.temperatureC}°C`);
  }
  if (weather.humidityPercent !== undefined) {
    facts.push(en ? `${weather.humidityPercent}% humidity` : `湿度 ${weather.humidityPercent}%`);
  }
  return facts.join(en ? ' with ' : '、');
}

function ensurePrioritySummary(summary: string, activity: StravaActivity, locale: string): string {
  const en = locale.startsWith('en');
  const record = getPrimaryPersonalRecord(activity);
  const weather = buildActivityWeatherContext(activity);
  const hasMeaningfulHeat = weather.thermalSeverity === 'heat-load' || weather.thermalSeverity === 'heat-stress';
  const mentionsRecord = en
    ? /\b(?:PB|PR|personal (?:best|record))\b/i.test(summary)
    : /(?:PB|个人最佳|刷新.{0,8}(?:最佳|纪录|记录)|突破.{0,8}(?:最佳|纪录|记录))/i.test(summary);
  const recordTime = record ? formatRecordTime(record.elapsedTimeSeconds) : '';
  const mentionsRecordDetail = !record || (
    mentionsRecord &&
    summary.toLowerCase().includes(record.name.toLowerCase()) &&
    summary.includes(recordTime)
  );
  const mentionsHeat = en
    ? /(?:heat|hot|humid|humidity|temperature|feels like)/i.test(summary)
    : /(?:高温|热负荷|热应激|闷热|湿度|体感温度|体感\s*\d)/i.test(summary);
  const mentionsHeatEffect = mentionsHeat && (
    en
      ? /(?:pace|heart rate|training stimulus|physiological|recovery|cooling)/i.test(summary)
      : /(?:配速|心率|训练刺激|生理|恢复|散热|降温)/i.test(summary)
  );

  if (mentionsRecordDetail && (!hasMeaningfulHeat || mentionsHeatEffect)) return summary;

  const weatherFact = getWeatherFact(activity, locale);
  let prioritySentence = '';
  if (record && !mentionsRecordDetail && hasMeaningfulHeat && !mentionsHeatEffect) {
    prioritySentence = en
      ? `This activity set a ${record.name} personal best of ${formatRecordTime(record.elapsedTimeSeconds)} despite ${weatherFact || 'meaningful heat load'}; that makes the performance especially strong, while the conditions also raise its recovery cost.`
      : `本次在${weatherFact || '明显热负荷'}下刷新 ${record.name} 个人最佳至 ${formatRecordTime(record.elapsedTimeSeconds)}，突破含金量很高，同时高温也抬高了生理与恢复成本。`;
  } else if (record && !mentionsRecordDetail) {
    prioritySentence = en
      ? `This activity set a ${record.name} personal best of ${formatRecordTime(record.elapsedTimeSeconds)}, which is the primary outcome of the workout.`
      : `本次刷新 ${record.name} 个人最佳至 ${formatRecordTime(record.elapsedTimeSeconds)}，这是本次训练最重要的结果。`;
  } else if (hasMeaningfulHeat && !mentionsHeatEffect) {
    const severity = weather.thermalSeverity === 'heat-stress'
      ? (en ? 'clear heat stress' : '明显热应激')
      : (en ? 'meaningful heat load' : '明显热负荷');
    prioritySentence = en
      ? `${weatherFact || 'The conditions'} created ${severity}; interpret pace, heart rate, training stimulus, and recovery cost against that higher physiological load.`
      : `${weatherFact || '当前天气'}构成${severity}；配速、心率、训练刺激和恢复成本都应结合更高的生理负担解读。`;
  }

  return [prioritySentence, summary].filter(Boolean).join(en ? ' ' : '');
}

function getThermalSeverity(activity: StravaActivity): 'neutral' | 'muggy' | 'heat-load' | 'heat-stress' {
  return buildActivityWeatherContext(activity).thermalSeverity;
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

function normalizeHydrationText(text: string, activity: StravaActivity, locale: string): string {
  if (!text || locale.startsWith('en')) return text;

  const severity = getThermalSeverity(activity);
  const isLongRun = activity.distance >= 15000 || activity.moving_time >= 5400;
  let normalized = text
    .replace(/脱水后身体自我保护/g, '主动冷身、体感变化或心率设备读数')
    .replace(/身体自我保护/g, '体感变化或心率设备读数');

  if (severity !== 'heat-stress') {
    normalized = normalized
      .replace(/隐性脱水导致的/g, '补水不足带来的')
      .replace(/脱水导致的/g, '补水不足带来的')
      .replace(/隐性脱水/g, '补水不足')
      .replace(/脱水/g, '补水不足')
      .replace(/即使体感不渴/g, '并结合口渴和出汗情况调整');
  }

  if (!isLongRun || severity === 'neutral' || severity === 'muggy') {
    normalized = normalized
      .replace(/建议提前\s*\d+\s*分钟补充\s*\d+(?:\s*-\s*\d+)?\s*(?:ml|毫升)?\s*电解质水?/g, '建议训练前根据口渴和出汗情况适量补水')
      .replace(/提前\s*\d+\s*分钟补充\s*\d+(?:\s*-\s*\d+)?\s*(?:ml|毫升)?\s*电解质水?/g, '训练前根据口渴和出汗情况适量补水')
      .replace(/建议每\s*\d+(?:\s*-\s*\d+)?\s*(?:分钟|km|公里)补(?:充|给)\s*\d+(?:\s*-\s*\d+)?\s*(?:ml|毫升)?\s*电解质水?/g, '建议按体感和出汗量分段补水')
      .replace(/每\s*\d+(?:\s*-\s*\d+)?\s*(?:分钟|km|公里)补(?:充|给)\s*\d+(?:\s*-\s*\d+)?\s*(?:ml|毫升)?\s*电解质水?/g, '按体感和出汗量分段补水')
      .replace(/携带\s*\d+(?:\s*-\s*\d+)?\s*(?:ml|毫升)\s*(?:运动饮料|电解质水?|水)/g, '携带少量饮水或运动饮料')
      .replace(/\d+(?:\s*-\s*\d+)?\s*(?:ml|毫升)\s*(?:运动饮料|电解质水?|水)/g, '少量饮水或运动饮料')
      .replace(/每\s*\d+(?:\s*-\s*\d+)?\s*分钟少量补液/g, '按体感少量补液');
  }

  return normalized;
}

function normalizeWorkoutSpecificText(
  text: string,
  classification: ActivityClassification,
  locale: string
): string {
  if (!text || locale.startsWith('en')) return text;
  if (classification.workoutType === 'interval' || classification.workoutType === 'fartlek') {
    return text
      .replace(/全程平均配速(?:偏慢|太慢|不达标|慢于[^，。；]*)/g, '全程平均配速仅作参考')
      .replace(/平均配速(?:偏慢|太慢|不达标|慢于[^，。；]*)/g, '平均配速仅作参考')
      .replace(/平均配速是否慢于目标/g, '快段是否稳定')
      .replace(/恢复(?:圈|段)(?:太慢|偏慢|过慢|拖累[^，。；]*)/g, '恢复段慢是设计的一部分')
      .replace(/(?:提高|加快|提升)恢复(?:圈|段)配速/g, '保证恢复段能让下一组快段质量稳定')
      .replace(/恢复(?:圈|段)(?:也要|需要|应当)?跑快/g, '恢复段以恢复质量为先');
  }

  if (classification.workoutType === 'progression') {
    return text
      .replace(/心率-配速双降提示监控不足/g, '快段后的降速更可能是主动冷身或结构调整')
      .replace(/心率和配速双降提示监控不足/g, '快段后的降速更可能是主动冷身或结构调整')
      .replace(/心率反常(?:跌至|下降至|回落至)/g, '心率回落至')
      .replace(/主动降速冷身或主动降速或短暂疲劳/g, '主动冷身或短暂疲劳')
      .replace(/主动冷身或主动降速或短暂疲劳/g, '主动冷身或短暂疲劳')
      .replace(/主动降速冷身/g, '主动冷身')
      .replace(/配速骤降至/g, '配速回落至')
      .replace(/监控不足/g, '执行反馈需要结合训练目的复盘')
      .replace(/短暂脱力/g, '主动降速或短暂疲劳')
      .replace(/体能储备不足/g, '后程负荷变化需要结合训练结构判断')
      .replace(/执行失败/g, '执行可继续优化');
  }

  if (classification.workoutType !== 'long-run') return text;

  return text
    .replace(
      /若体感轻松可尝试最后\s*\d+\s*公里渐进加速至M区（[^）]*）[^。；]*/g,
      '如果当天本来就是质量长距离，可少量加入M区结尾；普通长距离仍优先保持E区稳定和低恢复成本'
    )
    .replace(
      /可考虑在下周长距离中尝试穿插[^。；]*M区[^。；]*/g,
      '下周长距离默认仍以E区稳定为主；若要加入M区穿插，应把它明确安排为质量长距离并保证恢复'
    );
}

function normalizeMissingDataText(text: string, activity: StravaActivity, locale: string): string {
  if (!text || locale.startsWith('en')) return text;

  const hasHeartRate = Boolean(activity.has_heartrate && activity.average_heartrate);
  if (hasHeartRate) return text;

  return text
    .replace(/心率控制(?:稳定|精准|良好|优秀|到位)/g, '缺少心率数据，强度判断需参考体感')
    .replace(/(?:没有|未出现|无)明显?心率漂移/g, '缺少心率数据，暂不判断漂移')
    .replace(/心率漂移[^，。；]*/g, '缺少心率数据，暂不判断漂移')
    .replace(/心率(?:上升|下降|回落|攀升|骤降|维持|落在|处于)[^，。；]*/g, '心率数据缺失');
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
    .replace(/建议下次同类训练尝试贴近[^，。；]*以校准能力模型/g, '建议后续用一次稳态有氧跑再校准能力模型，不必在恢复跑里追配速')
    .replace(/配速落在目标区间/g, '配速处于低强度范围')
    .replace(/略慢于目标/g, '更偏放松')
    .replace(/慢于目标/g, '更偏放松')
    .replace(/目标配速/g, '低强度参考配速')
    .replace(/目标区间/g, '低强度范围');
}

function normalizeLowIntensitySuggestion(
  text: string,
  activity: StravaActivity,
  classification: ActivityClassification,
  locale: string
): string | null {
  if (!text) return text;
  if (locale.startsWith('en')) return text;
  if (classification.workoutType !== 'easy' && classification.workoutType !== 'recovery') return text;

  const isShortLowIntensityRun = activity.distance < 15000 && activity.moving_time < 5400;
  const overSpecificNutrition = /(?:BMI|体重|身高|糖原|碳水|蛋白|g\/kg|克|香蕉|燕麦|升糖|补剂)/i.test(text);
  if (isShortLowIntensityRun && overSpecificNutrition) {
    return null;
  }

  return text;
}

function normalizeUnplannedTargetText(text: string, locale: string): string {
  if (!text || locale.startsWith('en')) return text;

  return text
    .replace(/目标配速/g, '参考配速')
    .replace(/目标区间/g, '训练区间');
}

function normalizeFinalTextPolish(text: string, locale: string): string {
  if (!text || locale.startsWith('en')) return text;

  return text
    .replace(/主动冷身或主动降速或短暂疲劳/g, '主动冷身、结构调整或短暂疲劳')
    .replace(/主动冷身或短暂疲劳/g, '主动冷身或短暂疲劳')
    .replace(/主动降速或短暂疲劳/g, '主动冷身或短暂疲劳');
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

function normalizeAnalysisText(
  text: string,
  activity: StravaActivity,
  classification: ActivityClassification,
  locale: string
): string {
  return normalizeFinalTextPolish(
    normalizeUnplannedTargetText(
      normalizeWorkoutSpecificText(
        normalizeMissingDataText(
          normalizeLowIntensityText(
            normalizeHydrationText(
              normalizeThermalText(normalizeConfidenceText(text, locale), activity, locale),
              activity,
              locale
            ),
            classification,
            locale
          ),
          activity,
          locale
        ),
        classification,
        locale
      ),
      locale
    ),
    locale
  );
}

export function normalizeAIAnalysisForDisplay(
  analysis: AIAnalysis,
  activity: StravaActivity,
  classification: ActivityClassification,
  locale: string = 'zh'
): AIAnalysis {
  const normalizeForDisplay = (text: string) => normalizeAnalysisText(text, activity, classification, locale);
  const suggestions = Array.isArray(analysis.suggestions)
    ? analysis.suggestions
        .map((suggestion) => normalizeForDisplay(suggestion))
        .map((suggestion) => normalizeLowIntensitySuggestion(suggestion, activity, classification, locale))
        .map((suggestion) => suggestion ? normalizeWorkoutSpecificText(suggestion, classification, locale) : suggestion)
        .filter((suggestion): suggestion is string => Boolean(suggestion))
    : [];

  return {
    ...analysis,
    summary: ensurePrioritySummary(normalizeForDisplay(analysis.summary || ''), activity, locale),
    trainingLoadContext: normalizeForDisplay(analysis.trainingLoadContext || ''),
    similarActivitiesInsight: normalizeForDisplay(analysis.similarActivitiesInsight || ''),
    nextWorkoutSuggestion: normalizeForDisplay(analysis.nextWorkoutSuggestion || ''),
    suggestions,
    warnings: Array.isArray(analysis.warnings)
      ? analysis.warnings.map((warning) => normalizeForDisplay(warning))
      : [],
    paceZoneAnalysis: analysis.paceZoneAnalysis
      ? {
          ...analysis.paceZoneAnalysis,
          description: normalizeForDisplay(analysis.paceZoneAnalysis.description || ''),
        }
      : null,
  };
}

function sanitizeJsonCandidate(candidate: string): string {
  return candidate
    .trim()
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(\d'\d{2})"(?=\/km)/g, '$1\\"');
}

function extractBalancedJsonObject(content: string): string | null {
  const start = content.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractAIJson(content: string): string {
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
                    content.match(/```\n?([\s\S]*?)\n?```/);
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  const looseObject =
    firstBrace >= 0 && lastBrace > firstBrace ? content.slice(firstBrace, lastBrace + 1) : null;
  const candidate = jsonMatch?.[1] ?? extractBalancedJsonObject(content) ?? looseObject ?? content;
  return sanitizeJsonCandidate(candidate);
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
  const jsonStr = extractAIJson(content);
  const result = JSON.parse(jsonStr);

  // Override intensity for races
  const finalIntensity = classification.isRace ? 'extreme' : (result.intensity || 'moderate');

  // Override comparison fields with accurate program-generated text
  const { similarStats } = trainingProfile;
  const comparisonOverride = similarStats
    ? buildAccurateComparison(activity, similarStats, locale, classification.workoutType)
    : null;
  const normalizeForDisplay = (text: string) => normalizeAnalysisText(text, activity, classification, locale);
  const normalizedSummary = ensurePrioritySummary(
    normalizeForDisplay(result.summary || '训练分析完成'),
    activity,
    locale
  );
  const normalizedTrainingLoadContext = normalizeForDisplay(result.trainingLoadContext || '');
  const normalizedNextWorkoutSuggestion = normalizeForDisplay(
    result.nextWorkoutSuggestion || (classification.isRace ? '赛后请充分休息恢复' : ''),
  );
  const normalizedSuggestions = Array.isArray(result.suggestions)
    ? result.suggestions
        .map((suggestion: string) => normalizeForDisplay(suggestion))
        .map((suggestion: string) => normalizeLowIntensitySuggestion(suggestion, activity, classification, locale))
        .map((suggestion: string | null) => suggestion ? normalizeWorkoutSpecificText(suggestion, classification, locale) : suggestion)
        .filter((suggestion: string | null): suggestion is string => Boolean(suggestion))
    : [];
  const normalizedWarnings = Array.isArray(result.warnings)
    ? result.warnings.map((warning: string) => normalizeForDisplay(warning))
    : (classification.isRace ? ['这是高强度比赛，需要充分恢复'] : []);
  const normalizedAIInsight = normalizeForDisplay(result.similarActivitiesInsight || '');
  const normalizedPaceZoneAnalysis = result.paceZoneAnalysis
    ? {
        ...result.paceZoneAnalysis,
        description: normalizeForDisplay(result.paceZoneAnalysis.description || ''),
      }
    : null;

  return {
    summary: normalizedSummary,
    intensity: finalIntensity,
    recoveryHours: result.recoveryHours || (classification.isRace ? 48 : 24),
    comparisonToAverage: comparisonOverride?.comparisonToAverage || result.comparisonToAverage || '',
    suggestions: normalizedSuggestions,
    generatedAt: Date.now(),
    paceZoneAnalysis: normalizedPaceZoneAnalysis,
    trainingLoadContext: normalizedTrainingLoadContext,
    similarActivitiesInsight: comparisonOverride && shouldUseSystemInsight(normalizedAIInsight, trainingProfile)
      ? comparisonOverride.similarActivitiesInsight
      : normalizedAIInsight || comparisonOverride?.similarActivitiesInsight || '',
    nextWorkoutSuggestion: normalizedNextWorkoutSuggestion,
    warnings: normalizedWarnings,
  };
}
