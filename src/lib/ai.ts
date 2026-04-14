import { StravaActivity } from '@/types';
import {
  TrainingProfile,
  ActivityClassification,
  classifyActivity,
  analyzeTrainingHistory,
  formatTime,
  formatPace,
} from './trainingAnalysis';

// Format seconds to HH:MM:SS or MM:SS
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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

/**
 * Build professional coaching prompt using training profile
 */
export function buildProfessionalPrompt(
  activity: StravaActivity,
  streams: Record<string, any> | null,
  trainingProfile: TrainingProfile,
  classification: ActivityClassification
): string {
  const distanceKm = (activity.distance / 1000).toFixed(2);
  const durationFormatted = formatDuration(activity.moving_time); // HH:MM:SS
  const paceSecKm = (activity.moving_time / activity.distance * 1000);
  const paceStr = formatPace(paceSecKm);
  
  const { estimatedPBs, paceZones, patterns, recentLoad, similarStats } = trainingProfile;

  // Build the comprehensive prompt
  let prompt = `你是一位国家级专业跑步教练，擅长根据运动员的历史数据提供精准、可执行的训练分析。`;
  
  // CRITICAL: Identify if this is a race
  if (classification.isRace) {
    prompt += `\n\n⚠️ 重要：这是一次${classification.raceType || '比赛'}，不是日常训练！`;
  }

  prompt += `\n\n## 本次训练数据`;
  if (classification.isRace) {
    prompt += ` [比赛]`;
  }
  prompt += `\n- 距离: ${distanceKm} km`;
  prompt += `\n- 用时: ${durationFormatted}（必须严格使用此时间，不要四舍五入）`;
  prompt += `\n- 平均配速: ${paceStr} /km`;
  prompt += `\n- 爬升: ${Math.round(activity.total_elevation_gain)} m`; 
  prompt += `\n- 原始秒数: ${activity.moving_time}秒（用于精确计算）`;

  if (activity.average_heartrate) {
    prompt += `\n- 平均心率: ${Math.round(activity.average_heartrate)} bpm`;
  }
  if (activity.max_heartrate) {
    prompt += `\n- 最大心率: ${Math.round(activity.max_heartrate)} bpm`;
  }

  // Simple pace zone guide based on absolute pace (not requiring accurate PB estimates)
  const paceMin = paceSecKm / 60;
  let zoneDesc = '';
  if (paceMin < 3.5) zoneDesc = 'R区(重复跑) - 速度训练';
  else if (paceMin < 4.0) zoneDesc = 'I区(间歇跑) - VO2max训练';
  else if (paceMin < 4.5) zoneDesc = 'T区(阈值跑) - 乳酸阈值训练';
  else if (paceMin < 5.3) zoneDesc = 'M区(马拉松配速) - 比赛节奏训练';
  else if (paceMin < 6.2) zoneDesc = 'E区(轻松跑) - 有氧基础训练';
  else zoneDesc = 'E区(恢复跑) - 恢复放松';
  
  prompt += `\n\n## 配速区间参考`;
  prompt += `\n本次配速 ${paceStr}/km 约等于 ${paceMin.toFixed(1)} min/km`;
  prompt += `\n对应 Daniels 五区间中的: ${zoneDesc}`;

  // Weekly load trend
  if (recentLoad.length > 0) {
    const recentWeeks = recentLoad.slice(-4);
    const avgWeeklyDistance = recentWeeks.reduce((sum, w) => sum + w.totalDistance, 0) / recentWeeks.length;
    const recentRuns = recentWeeks.reduce((sum, w) => sum + w.runs, 0);
    prompt += `\n\n近4周负荷:`;
    prompt += `\n- 平均周跑量: ${(avgWeeklyDistance / 1000).toFixed(1)}km`;
    prompt += `\n- 总次数: ${recentRuns}次`;
  }

  // Similar activities comparison
  if (similarStats) {
    prompt += `\n\n同类型训练对比（${similarStats.count}次类似距离）:`;
    prompt += `\n- 历史平均配速: ${formatPace(similarStats.avgPace * 60)}/km`;
    prompt += `\n- 历史最佳配速: ${formatPace(similarStats.bestPace * 60)}/km`;
    prompt += `\n- 本次表现: 超过${similarStats.yourPaceRank}%的同类型训练`;
    prompt += `\n- 趋势: ${similarStats.trendDirection === 'improving' ? '进步中' : similarStats.trendDirection === 'declining' ? '有所下滑' : '保持稳定'}`;
  }

  // Instructions for analysis
  prompt += `\n\n## 分析要求`;
  
  if (classification.isRace) {
    // Special instructions for races
    prompt += `\n\n这是比赛分析，请注意:`;
    prompt += `\n1. 强度必须判为 "extreme"（极限）- 这是比赛，运动员应该全力以赴`;
    prompt += `\n2. 恢复时间建议：半马比赛48-72小时，全马比赛7-14天`;
    prompt += `\n3. 不要建议"增加速度训练" - 比赛本身就是最高强度！`;
    prompt += `\n4. 重点分析：比赛表现vs能力预期、配速策略、恢复建议`;
    prompt += `\n5. 下次训练建议：比赛后应该安排轻松恢复跑，不是强度训练`;
  } else {
    // Normal training analysis - focused on THIS specific workout
    prompt += `\n\n本次训练针对性分析:`;
    prompt += `\n1. 配速区间: 本次配速${paceStr}/km 属于 ${zoneDesc}。`;
    prompt += `\n2. 训练目的: 基于本次配速和距离，明确说明这次训练主要目的是什么（有氧恢复/有氧基础/阈值提升/VO2max/速度训练）。`;
    prompt += `\n3. 负荷评估: 结合近4周负荷，判断本次训练量是否合适。`;
    if (similarStats) {
      prompt += `\n4. 历史对比: 本次配速${paceStr}/km，历史平均${formatPace(similarStats.avgPace * 60)}/km，最佳${formatPace(similarStats.bestPace * 60)}/km。超过${similarStats.yourPaceRank}%的同类训练。`;
    } else {
      prompt += `\n4. 历史对比: 暂无可比历史数据。`;
    }
    prompt += `\n6. 下次训练建议: 从三要素角度给出具体的训练安排，明确说明主要训练目的（提升VO2max/乳酸阈值/跑步经济性）。`;
  }

  prompt += `\n\n## 输出格式（JSON）`;
  
  if (classification.isRace) {
    prompt += `\n{\n  "summary": "比赛表现分析（包含与PB对比、配速策略评价）",`;
    prompt += `\n  "intensity": "extreme",`;
    prompt += `\n  "recoveryHours": ${activity.distance > 40000 ? 168 : 48},`;
    prompt += `\n  "comparisonToAverage": "系统生成，可留空",`;
    prompt += `\n  "suggestions": ["赛后恢复建议1", "避免立即进行强度训练", "下次比赛准备建议"],`;
  } else {
    prompt += `\n{\n  "summary": "总体评价（60字以内，专业教练口吻）",`;
    prompt += `\n  "intensity": "easy|moderate|hard|extreme",`;
    prompt += `\n  "recoveryHours": 数字,`;
    prompt += `\n  "comparisonToAverage": "系统生成，可留空",`;
    prompt += `\n  "suggestions": ["具体建议1（可操作）", "具体建议2", "具体建议3"],`;
  }
  
  prompt += `\n  "paceZoneAnalysis": {`;
  prompt += `\n    "zone": "E|M|T|I|R|unknown",`;
  prompt += `\n    "description": "配速区间描述",`;
  prompt += `\n    "appropriateness": "appropriate|too-fast|too-slow"`;
  prompt += `\n  },`;
  prompt += `\n  "trainingLoadContext": "负荷评估说明",`;
  prompt += `\n  "similarActivitiesInsight": "同类型对比洞察",`;
  prompt += `\n  "nextWorkoutSuggestion": "${classification.isRace ? '赛后恢复建议' : '下次训练具体安排'}",`;
  prompt += `\n  "warnings": [${classification.isRace ? '"赛后注意充分恢复"' : ''}]`;
  prompt += `\n}`;

  prompt += `\n\n重要提醒:`;
  prompt += `\n- 避免使用"注意休息"、"多喝水"这类泛泛之谈`;
  prompt += `\n- ${classification.isRace ? '这是比赛分析，不要建议增加速度训练' : '提供教练级别的专业洞察和具体可执行的建议'}`;
  prompt += `\n- "comparisonToAverage" 和 "similarActivitiesInsight" 只需描述配速差异和百分比排名，不要提及总用时差异（如"快2分钟"）或与此无关的描述。`;
  if (estimatedPBs['5k'] > 0) {
    const calculated5k = estimatedPBs['5k'];
    const calculated10k = estimatedPBs['10k'];
    const ratio = calculated5k / calculated10k;
    if (ratio > 0.55) {
      prompt += `\n- 注意：5K(${formatTime(calculated5k)})与10K(${formatTime(calculated10k)})比例异常，请检查`;
    }
  }

  return prompt;
}

/**
 * Build accurate comparison text from similarStats to avoid AI hallucinations
 * like "significantly improved by 2+ minutes total time"
 */
function buildAccurateComparison(
  activity: StravaActivity,
  similarStats: NonNullable<TrainingProfile['similarStats']>
): { comparisonToAverage: string; similarActivitiesInsight: string } {
  const currentPaceSecKm = activity.moving_time / activity.distance * 1000;
  const avgPaceSecKm = similarStats.avgPace * 60;
  const diffSec = Math.round(currentPaceSecKm - avgPaceSecKm);
  const diffAbs = Math.abs(diffSec);
  const diffText = diffSec < 0 ? '快' : diffSec > 0 ? '慢' : '持平';

  const comparison = diffSec === 0
    ? `与历史平均持平，超过 ${similarStats.yourPaceRank}% 的同类训练`
    : `比历史平均${diffText} ${diffAbs} 秒/km，超过 ${similarStats.yourPaceRank}% 的同类训练`;

  let insight = `在 ${similarStats.count} 次同类训练中超过 ${similarStats.yourPaceRank}%。`;
  if (diffSec === 0) {
    insight += '本次配速与历史平均基本持平';
  } else {
    insight += `本次配速比历史平均${diffText} ${diffAbs} 秒/km`;
  }
  if (similarStats.trendDirection === 'improving') {
    insight += '，近期呈进步趋势';
  } else if (similarStats.trendDirection === 'declining') {
    insight += '，近期状态有所下滑';
  } else {
    insight += '，近期状态保持稳定';
  }

  return { comparisonToAverage: comparison, similarActivitiesInsight: insight };
}

/**
 * Call Kimi API for professional analysis
 */
export async function analyzeActivity(
  activity: StravaActivity,
  streams: Record<string, any> | null,
  trainingProfile: TrainingProfile
): Promise<AIAnalysis> {
  const apiKey = process.env.KIMI_API_KEY;
  
  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }

  // Classify the activity
  const classification = classifyActivity(activity);
  
  const prompt = buildProfessionalPrompt(activity, streams, trainingProfile, classification);

  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        {
          role: 'system',
          content: '你是一位国家级专业跑步教练，精通运动科学和训练周期化理论。你擅长分析训练数据，识别运动员的短板，并提供精准、可执行的训练建议。你的分析风格专业、直接、数据驱动，避免空洞的安慰性建议。' + (classification.isRace ? '特别注意：你正在分析一场比赛，不是日常训练。' : ''),
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('Empty response from AI');
  }

  // Parse JSON response
  try {
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
      ? buildAccurateComparison(activity, similarStats)
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
      similarActivitiesInsight: comparisonOverride?.similarActivitiesInsight || result.similarActivitiesInsight || '',
      nextWorkoutSuggestion: result.nextWorkoutSuggestion || (classification.isRace ? '赛后请充分休息恢复' : ''),
      warnings: result.warnings || (classification.isRace ? ['这是高强度比赛，需要充分恢复'] : []),
    };
  } catch (e) {
    console.error('Failed to parse AI response:', content);
    return generateFallbackAnalysis(activity, trainingProfile, classification);
  }
}

/**
 * Generate fallback analysis when AI fails
 */
function generateFallbackAnalysis(
  activity: StravaActivity,
  profile: TrainingProfile,
  classification: ActivityClassification
): AIAnalysis {
  const paceSecKm = activity.moving_time / activity.distance * 1000;
  const paceMin = paceSecKm / 60;
  const paceStr = formatPace(paceSecKm);
  
  // Determine pace zone based on absolute pace thresholds
  let zone = 'E';
  let zoneDesc = '轻松跑区间';
  
  if (paceMin < 3.5) {
    zone = 'R';
    zoneDesc = '重复跑区间';
  } else if (paceMin < 4.0) {
    zone = 'I';
    zoneDesc = '间歇跑区间';
  } else if (paceMin < 4.5) {
    zone = 'T';
    zoneDesc = '乳酸阈值区间';
  } else if (paceMin < 5.3) {
    zone = 'M';
    zoneDesc = '马拉松配速区间';
  } else if (paceMin < 6.2) {
    zone = 'E';
    zoneDesc = '轻松跑区间';
  } else {
    zone = 'E';
    zoneDesc = '恢复跑区间';
  }

  // Race-specific fallback
  const fallbackComparison = profile.similarStats
    ? buildAccurateComparison(activity, profile.similarStats)
    : null;

  if (classification.isRace) {
    return {
      summary: `${classification.raceType || '比赛'}完成！配速${paceStr}/km，${classification.raceType?.includes('半马') ? '半马' : ''}表现出色。`,
      intensity: 'extreme',
      recoveryHours: activity.distance > 40000 ? 168 : 48,
      comparisonToAverage: fallbackComparison?.comparisonToAverage || '比赛表现优异',
      suggestions: [
        '赛后24小时内避免高强度活动',
        '补充蛋白质和碳水化合物加速恢复',
        '关注肌肉酸痛情况，必要时安排按摩',
      ],
      generatedAt: Date.now(),
      paceZoneAnalysis: {
        zone,
        description: zoneDesc,
        appropriateness: 'appropriate',
      },
      trainingLoadContext: '比赛为极限强度，需要充分恢复',
      similarActivitiesInsight: fallbackComparison?.similarActivitiesInsight || '比赛完成',
      nextWorkoutSuggestion: '建议赛后3天内仅进行轻松恢复跑或休息',
      warnings: ['高强度比赛后需充分恢复，避免立即进行速度训练'],
    };
  }

  // Normal training fallback
  const suggestions = [...profile.patterns.trainingDeficiencies];
  if (!profile.patterns.hasLongRuns && activity.distance < 15000) {
    suggestions.push('建议本周安排一次15km+的长距离训练');
  }
  if (!profile.patterns.hasIntervalWorkouts) {
    suggestions.push('可尝试每周一次400m×6间歇训练，配速控制在I区');
  }

  // Build comparison text based on accurate data
  let comparisonText = fallbackComparison?.comparisonToAverage || '暂无历史对比数据';

  return {
    summary: `本次${(activity.distance / 1000).toFixed(1)}km训练完成，配速${paceStr}/km处于${zoneDesc}。`,
    intensity: 'moderate',
    recoveryHours: activity.distance > 10000 ? 36 : 24,
    comparisonToAverage: comparisonText,
    suggestions,
    generatedAt: Date.now(),
    paceZoneAnalysis: {
      zone,
      description: zoneDesc,
      appropriateness: 'appropriate',
    },
    trainingLoadContext: `近4周平均周跑量${(profile.patterns.typicalWeekDistance / 1000).toFixed(1)}km`,
    similarActivitiesInsight: fallbackComparison?.similarActivitiesInsight || '暂无类似训练数据',
    nextWorkoutSuggestion: profile.patterns.hasLongRuns 
      ? '建议下次进行轻松跑恢复'
      : '建议下次安排长距离有氧训练',
    warnings: [],
  };
}
