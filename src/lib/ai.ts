import { StravaActivity } from '@/types';
import {
  TrainingProfile,
  ActivityClassification,
  classifyActivity,
  analyzeTrainingHistory,
  formatTime,
  formatPace,
} from './trainingAnalysis';
import type { RaceDistance, TrainingPlan, WeeklyPlan } from './trainingPlan';
import { calculatePaceZones, generateFallbackTrainingPlan } from './trainingPlan';

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

function formatPaceSec(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
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
 * Build accurate comparison text from similarStats to avoid AI hallucinations
 * like "significantly improved by 2+ minutes total time"
 */
function buildAccurateComparison(
  activity: StravaActivity,
  similarStats: NonNullable<TrainingProfile['similarStats']>,
  locale: string = 'zh'
): { comparisonToAverage: string; similarActivitiesInsight: string } {
  const en = locale.startsWith('en');
  const currentPaceSecKm = activity.moving_time / activity.distance * 1000;
  const avgPaceSecKm = similarStats.avgPace * 60;
  const diffSec = Math.round(currentPaceSecKm - avgPaceSecKm);
  const diffAbs = Math.abs(diffSec);
  const diffText = diffSec < 0
    ? (en ? 'faster' : '快')
    : diffSec > 0
      ? (en ? 'slower' : '慢')
      : (en ? 'same as' : '持平');

  const comparison = diffSec === 0
    ? (en ? `Same as historical average, faster than ${similarStats.yourPaceRank}% of similar workouts` : `与历史平均持平，超过 ${similarStats.yourPaceRank}% 的同类训练`)
    : (en ? `${diffAbs}s/km ${diffText} than historical average, faster than ${similarStats.yourPaceRank}% of similar workouts` : `比历史平均${diffText} ${diffAbs} 秒/km，超过 ${similarStats.yourPaceRank}% 的同类训练`);

  let insight = en
    ? `Faster than ${similarStats.yourPaceRank}% in ${similarStats.count} similar workouts. `
    : `在 ${similarStats.count} 次同类训练中超过 ${similarStats.yourPaceRank}%。`;
  if (diffSec === 0) {
    insight += en ? 'This pace is basically the same as the historical average' : '本次配速与历史平均基本持平';
  } else {
    insight += en
      ? `This pace is ${diffAbs}s/km ${diffText} than the historical average`
      : `本次配速比历史平均${diffText} ${diffAbs} 秒/km`;
  }
  const trendText = similarStats.trendDirection === 'improving'
    ? (en ? ', showing an improving trend recently' : '，近期呈进步趋势')
    : similarStats.trendDirection === 'declining'
      ? (en ? ', recent state has declined' : '，近期状态有所下滑')
      : (en ? ', recent state remains stable' : '，近期状态保持稳定');
  insight += trendText;

  return { comparisonToAverage: comparison, similarActivitiesInsight: insight };
}

/**
 * Build professional coaching prompt using training profile
 */
export function buildProfessionalPrompt(
  activity: StravaActivity,
  streams: Record<string, any> | null,
  trainingProfile: TrainingProfile,
  classification: ActivityClassification,
  locale: string = 'zh'
): string {
  const en = locale.startsWith('en');
  const distanceKm = (activity.distance / 1000).toFixed(2);
  const durationFormatted = formatDuration(activity.moving_time); // HH:MM:SS
  const paceSecKm = (activity.moving_time / activity.distance * 1000);
  const paceStr = formatPace(paceSecKm);
  
  const { estimatedPBs, paceZones, patterns, recentLoad, similarStats } = trainingProfile;

  // Build the comprehensive prompt
  let prompt = en
    ? `You are a national-level professional running coach, skilled at providing precise, actionable training analysis based on the athlete's historical data.`
    : `你是一位国家级专业跑步教练，擅长根据运动员的历史数据提供精准、可执行的训练分析。`;

  // CRITICAL: Identify if this is a race
  if (classification.isRace) {
    prompt += en
      ? `\n\n⚠️ Important: This is a ${classification.raceType || 'race'}, not a regular training run!`
      : `\n\n⚠️ 重要：这是一次${classification.raceType || '比赛'}，不是日常训练！`;
  }

  prompt += en ? `\n\n## Workout Data` : `\n\n## 本次训练数据`;
  if (classification.isRace) {
    prompt += en ? ` [Race]` : ` [比赛]`;
  }
  prompt += en
    ? `\n- Distance: ${distanceKm} km`
    : `\n- 距离: ${distanceKm} km`;
  prompt += en
    ? `\n- Time: ${durationFormatted} (use this exact time, do not round)`
    : `\n- 用时: ${durationFormatted}（必须严格使用此时间，不要四舍五入）`;
  prompt += en
    ? `\n- Avg Pace: ${paceStr} /km`
    : `\n- 平均配速: ${paceStr} /km`;
  prompt += en
    ? `\n- Elevation: ${Math.round(activity.total_elevation_gain)} m`
    : `\n- 爬升: ${Math.round(activity.total_elevation_gain)} m`;
  prompt += en
    ? `\n- Raw Seconds: ${activity.moving_time}s (for precise calculation)`
    : `\n- 原始秒数: ${activity.moving_time}秒（用于精确计算）`;

  if (activity.average_heartrate) {
    prompt += en
      ? `\n- Avg HR: ${Math.round(activity.average_heartrate)} bpm`
      : `\n- 平均心率: ${Math.round(activity.average_heartrate)} bpm`;
  }
  if (activity.max_heartrate) {
    prompt += en
      ? `\n- Max HR: ${Math.round(activity.max_heartrate)} bpm`
      : `\n- 最大心率: ${Math.round(activity.max_heartrate)} bpm`;
  }

  // Simple pace zone guide based on absolute pace (not requiring accurate PB estimates)
  const paceMin = paceSecKm / 60;
  let zoneDesc = '';
  if (paceMin < 3.5) zoneDesc = en ? 'R (Repetition) - speed workout' : 'R区(重复跑) - 速度训练';
  else if (paceMin < 4.0) zoneDesc = en ? 'I (Interval) - VO2max workout' : 'I区(间歇跑) - VO2max训练';
  else if (paceMin < 4.5) zoneDesc = en ? 'T (Threshold) - lactate threshold workout' : 'T区(阈值跑) - 乳酸阈值训练';
  else if (paceMin < 5.3) zoneDesc = en ? 'M (Marathon pace) - race rhythm workout' : 'M区(马拉松配速) - 比赛节奏训练';
  else if (paceMin < 6.2) zoneDesc = en ? 'E (Easy) - aerobic base workout' : 'E区(轻松跑) - 有氧基础训练';
  else zoneDesc = en ? 'E (Recovery) - recovery jog' : 'E区(恢复跑) - 恢复放松';

  prompt += en ? `\n\n## Pace Zone Reference` : `\n\n## 配速区间参考`;
  prompt += en
    ? `\nCurrent pace ${paceStr}/km ≈ ${paceMin.toFixed(1)} min/km`
    : `\n本次配速 ${paceStr}/km 约等于 ${paceMin.toFixed(1)} min/km`;
  prompt += en
    ? `\nCorresponds to Daniels 5-zone: ${zoneDesc}`
    : `\n对应 Daniels 五区间中的: ${zoneDesc}`;

  // Weekly load trend
  if (recentLoad.length > 0) {
    const recentWeeks = recentLoad.slice(-4);
    const avgWeeklyDistance = recentWeeks.reduce((sum, w) => sum + w.totalDistance, 0) / recentWeeks.length;
    const recentRuns = recentWeeks.reduce((sum, w) => sum + w.runs, 0);
    prompt += en ? `\n\nRecent 4-Week Load:` : `\n\n近4周负荷:`;
    prompt += en
      ? `\n- Avg weekly distance: ${(avgWeeklyDistance / 1000).toFixed(1)}km`
      : `\n- 平均周跑量: ${(avgWeeklyDistance / 1000).toFixed(1)}km`;
    prompt += en
      ? `\n- Total runs: ${recentRuns}`
      : `\n- 总次数: ${recentRuns}次`;
  }

  // Similar activities comparison
  if (similarStats) {
    prompt += en
      ? `\n\nSimilar Workouts Comparison (${similarStats.count} similar distances):`
      : `\n\n同类型训练对比（${similarStats.count}次类似距离）:`;
    prompt += en
      ? `\n- Historical avg pace: ${formatPace(similarStats.avgPace * 60)}/km`
      : `\n- 历史平均配速: ${formatPace(similarStats.avgPace * 60)}/km`;
    prompt += en
      ? `\n- Historical best pace: ${formatPace(similarStats.bestPace * 60)}/km`
      : `\n- 历史最佳配速: ${formatPace(similarStats.bestPace * 60)}/km`;
    prompt += en
      ? `\n- This workout: faster than ${similarStats.yourPaceRank}% of similar workouts`
      : `\n- 本次表现: 超过${similarStats.yourPaceRank}%的同类型训练`;
    const trendText = similarStats.trendDirection === 'improving'
      ? (en ? 'improving trend' : '进步中')
      : similarStats.trendDirection === 'declining'
        ? (en ? 'declining trend' : '有所下滑')
        : (en ? 'stable trend' : '保持稳定');
    prompt += en
      ? `\n- Trend: ${trendText}`
      : `\n- 趋势: ${trendText}`;
  }

  // Instructions for analysis
  prompt += en ? `\n\n## Analysis Requirements` : `\n\n## 分析要求`;

  if (classification.isRace) {
    // Special instructions for races
    prompt += en ? `\n\nThis is a race analysis. Please note:` : `\n\n这是比赛分析，请注意:`;
    prompt += en
      ? `\n1. Intensity MUST be "extreme" - this is a race, the athlete should go all-out.`
      : `\n1. 强度必须判为 "extreme"（极限）- 这是比赛，运动员应该全力以赴`;
    prompt += en
      ? `\n2. Recovery: half marathon 48-72h, marathon 7-14 days.`
      : `\n2. 恢复时间建议：半马比赛48-72小时，全马比赛7-14天`;
    prompt += en
      ? `\n3. Do NOT suggest increasing speed workouts - the race itself is the highest intensity!`
      : `\n3. 不要建议"增加速度训练" - 比赛本身就是最高强度！`;
    prompt += en
      ? `\n4. Focus on: performance vs potential, pacing strategy, recovery advice.`
      : `\n4. 重点分析：比赛表现vs能力预期、配速策略、恢复建议`;
    prompt += en
      ? `\n5. Next workout: easy recovery runs or rest after the race, NOT intensity workouts.`
      : `\n5. 下次训练建议：比赛后应该安排轻松恢复跑，不是强度训练`;
  } else {
    // Normal training analysis - focused on THIS specific workout
    prompt += en ? `\n\nWorkout-specific analysis:` : `\n\n本次训练针对性分析:`;
    prompt += en
      ? `\n1. Pace zone: This workout ${paceStr}/km falls into ${zoneDesc}.`
      : `\n1. 配速区间: 本次配速${paceStr}/km 属于 ${zoneDesc}。`;
    prompt += en
      ? `\n2. Training purpose: Based on pace and distance, clearly state the main purpose (aerobic recovery / aerobic base / threshold / VO2max / speed).`
      : `\n2. 训练目的: 基于本次配速和距离，明确说明这次训练主要目的是什么（有氧恢复/有氧基础/阈值提升/VO2max/速度训练）。`;
    prompt += en
      ? `\n3. Load assessment: Combine with recent 4-week load to judge if this volume is appropriate.`
      : `\n3. 负荷评估: 结合近4周负荷，判断本次训练量是否合适。`;
    if (similarStats) {
      prompt += en
        ? `\n4. Historical comparison: this pace ${paceStr}/km vs historical avg ${formatPace(similarStats.avgPace * 60)}/km and best ${formatPace(similarStats.bestPace * 60)}/km. Faster than ${similarStats.yourPaceRank}% of similar workouts.`
        : `\n4. 历史对比: 本次配速${paceStr}/km，历史平均${formatPace(similarStats.avgPace * 60)}/km，最佳${formatPace(similarStats.bestPace * 60)}/km。超过${similarStats.yourPaceRank}%的同类训练。`;
    } else {
      prompt += en ? `\n4. Historical comparison: no comparable historical data yet.` : `\n4. 历史对比: 暂无可比历史数据。`;
    }
    prompt += en
      ? `\n5. Next workout suggestion: Give specific next-session recommendations from the three-components perspective, clearly stating the main goal (improve VO2max / lactate threshold / running economy).`
      : `\n5. 下次训练建议: 从三要素角度给出具体的训练安排，明确说明主要训练目的（提升VO2max/乳酸阈值/跑步经济性）。`;
  }

  prompt += en ? `\n\n## Output Format (JSON)` : `\n\n## 输出格式（JSON）`;

  if (classification.isRace) {
    prompt += en
      ? `\n{\n  "summary": "Race performance analysis (include PB comparison and pacing strategy evaluation)",`
      : `\n{\n  "summary": "比赛表现分析（包含与PB对比、配速策略评价）",`;
    prompt += `\n  "intensity": "extreme",`;
    prompt += `\n  "recoveryHours": ${activity.distance > 40000 ? 168 : 48},`;
    prompt += en
      ? `\n  "comparisonToAverage": "system-generated, can be empty",`
      : `\n  "comparisonToAverage": "系统生成，可留空",`;
    prompt += en
      ? `\n  "suggestions": ["post-race recovery tip 1", "avoid intensity workouts immediately", "next race preparation advice"],`
      : `\n  "suggestions": ["赛后恢复建议1", "避免立即进行强度训练", "下次比赛准备建议"],`;
  } else {
    prompt += en
      ? `\n{\n  "summary": "Overall evaluation (within 60 words, professional coach tone)",`
      : `\n{\n  "summary": "总体评价（60字以内，专业教练口吻）",`;
    prompt += `\n  "intensity": "easy|moderate|hard|extreme",`;
    prompt += en ? `\n  "recoveryHours": number,` : `\n  "recoveryHours": 数字,`;
    prompt += en
      ? `\n  "comparisonToAverage": "system-generated, can be empty",`
      : `\n  "comparisonToAverage": "系统生成，可留空",`;
    prompt += en
      ? `\n  "suggestions": ["actionable tip 1", "actionable tip 2", "actionable tip 3"],`
      : `\n  "suggestions": ["具体建议1（可操作）", "具体建议2", "具体建议3"],`;
  }

  prompt += `\n  "paceZoneAnalysis": {`;
  prompt += `\n    "zone": "E|M|T|I|R|unknown",`;
  prompt += en
    ? `\n    "description": "pace zone description",`
    : `\n    "description": "配速区间描述",`;
  prompt += `\n    "appropriateness": "appropriate|too-fast|too-slow"`;
  prompt += `\n  },`;
  prompt += en
    ? `\n  "trainingLoadContext": "load assessment explanation",`
    : `\n  "trainingLoadContext": "负荷评估说明",`;
  prompt += en
    ? `\n  "similarActivitiesInsight": "similar workout comparison insight",`
    : `\n  "similarActivitiesInsight": "同类型对比洞察",`;
  prompt += en
    ? `\n  "nextWorkoutSuggestion": "${classification.isRace ? 'post-race recovery advice' : 'specific next workout plan'}",`
    : `\n  "nextWorkoutSuggestion": "${classification.isRace ? '赛后恢复建议' : '下次训练具体安排'}",`;
  prompt += en
    ? `\n  "warnings": [${classification.isRace ? '"Ensure adequate recovery after the race"' : ''}]`
    : `\n  "warnings": [${classification.isRace ? '"赛后注意充分恢复"' : ''}]`;
  prompt += `\n}`;

  prompt += en ? `\n\nImportant reminders:` : `\n\n重要提醒:`;
  prompt += en
    ? `\n- Avoid generic advice like "get more rest" or "drink more water".`
    : `\n- 避免使用"注意休息"、"多喝水"这类泛泛之谈`;
  prompt += en
    ? `\n- ${classification.isRace ? 'This is a race analysis; do not suggest increasing speed workouts.' : 'Provide professional coach-level insights and specific actionable advice.'}`
    : `\n- ${classification.isRace ? '这是比赛分析，不要建议增加速度训练' : '提供教练级别的专业洞察和具体可执行的建议'}`;
  prompt += en
    ? `\n- "comparisonToAverage" and "similarActivitiesInsight" should only describe pace differences and percentile ranking. Do NOT mention total time differences (e.g., "2 minutes faster") or unrelated descriptions.`
    : `\n- "comparisonToAverage" 和 "similarActivitiesInsight" 只需描述配速差异和百分比排名，不要提及总用时差异（如"快2分钟"）或与此无关的描述。`;
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
 * Call Kimi API for professional analysis
 */
export async function analyzeActivity(
  activity: StravaActivity,
  streams: Record<string, any> | null,
  trainingProfile: TrainingProfile,
  locale: string = 'zh'
): Promise<AIAnalysis> {
  const apiKey = process.env.KIMI_API_KEY;

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }

  const en = locale.startsWith('en');

  // Classify the activity
  const classification = classifyActivity(activity);

  const prompt = buildProfessionalPrompt(activity, streams, trainingProfile, classification, locale);

  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'kimi-k2.5',
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
      temperature: 0.6,
      thinking: {
        type: 'disabled'
      }
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
 * Build training plan prompt
 */
export function buildTrainingPlanPrompt(
  distance: RaceDistance,
  targetTimeSeconds: number,
  weeks: number,
  pb5kSec: number,
  weeklyVolume: number,
  raceDate?: string
): string {
  const zones = calculatePaceZones(pb5kSec);
  const targetPace = (() => {
    const d = distance === '5k' ? 5 : distance === '10k' ? 10 : distance === '21k' ? 21.0975 : 42.195;
    return targetTimeSeconds / d;
  })();

  let prompt = `你是一位国家级马拉松教练，拥有周期化训练设计经验。`;
  prompt += `\n请根据以下运动员信息，生成一份科学的训练计划。`;
  prompt += `\n\n## 运动员信息`;
  prompt += `\n- 目标赛事：${distance === '5k' ? '5公里' : distance === '10k' ? '10公里' : distance === '21k' ? '半程马拉松' : '全程马拉松'}`;
  prompt += `\n- 目标成绩：${formatDuration(targetTimeSeconds)}`;
  prompt += `\n- 目标配速：${formatPaceSec(targetPace)}/km`;
  prompt += `\n- 计划周期：${weeks} 周`;
  if (raceDate) {
    prompt += `\n- 比赛日期：${raceDate}`;
  }
  prompt += `\n- 当前5K PB：${formatDuration(pb5kSec)} → 对应 Daniels 配速区间：`;
  prompt += `\n  - E（轻松跑）：${formatPaceSec(zones.E.min)} ~ ${formatPaceSec(zones.E.max)}/km`;
  prompt += `\n  - M（马拉松配速）：${formatPaceSec(zones.M.min)} ~ ${formatPaceSec(zones.M.max)}/km`;
  prompt += `\n  - T（乳酸阈值）：${formatPaceSec(zones.T.min)} ~ ${formatPaceSec(zones.T.max)}/km`;
  prompt += `\n  - I（间歇跑）：${formatPaceSec(zones.I.min)} ~ ${formatPaceSec(zones.I.max)}/km`;
  prompt += `\n  - R（重复跑）：${formatPaceSec(zones.R.min)} ~ ${formatPaceSec(zones.R.max)}/km`;
  prompt += `\n- 近4周平均周跑量：${Math.round(weeklyVolume)} km`;
  prompt += `\n- 当前能力评估：5K PB配速${formatPaceSec(pb5kSec / 5)}，目标配速${formatPaceSec(targetPace)}`;

  prompt += `\n\n## 训练计划结构要求（非常重要，且必须根据目标赛事差异定制）`;
  prompt += `\n1. 周期划分：基础期(base，前25%周数)→建立期(build，25%-65%周数)→巅峰期(peak，66%-85%周数)→减量期(taper，最后15%周数)。`;
  prompt += `\n2. 每周至少安排1天完全休息(type=rest)，建议放在周六。`;
  prompt += `\n3. 周日有氧跑安排（day=6），根据目标赛事差异定制：`;
  if (distance === '42k') {
    prompt += `\n   - 全程马拉松：长距离慢跑，逐步增加到30km以上，至少包含2-3次30km+的长距离。建立期和巅峰期的长距离中加入马拉松配速(M配速 ${formatPaceSec(targetPace)}) 段落。`;
    prompt += `\n   - 强度安排：周二安排一堂大强度课（阈值跑和间歇跑轮换），周四必须是轻松跑，不要再安排大强度课。全马一周只有两堂大课。`;
  } else if (distance === '21k') {
    prompt += `\n   - 半程马拉松：长距离慢跑，最高到18-20km。巅峰期/减量期长距离中可加入部分M配速 ${formatPaceSec(targetPace)} 段落。`;
    prompt += `\n   - 强度安排：半马非常依赖乳酸阈值能力。建立期和巅峰期每周安排两堂强度课：周二间歇或速度训练，周四阈值跑。`;
  } else if (distance === '10k') {
    prompt += `\n   - 10公里：周日安排较长有氧跑（10-12km即可），不需要像半马/全马那样跑长距离慢跑。重点是速度耐力和乳酸阈值。`;
    prompt += `\n   - 强度安排：10k以速度为主。周二固定间歇训练（600m/800m/1000m），周四安排法特莱克或阈值跑。每周两堂强度课。`;
  } else {
    prompt += `\n   - 5公里：周日安排较长有氧跑（8-10km即可），重点是 raw speed（速度）和短间歇。`;
    prompt += `\n   - 强度安排：周二短间歇（400m）或重复跑（200m），周四短阈值跑（3-4km）。每周两堂强度课。`;
  }
  prompt += `\n4. 具体配速要求：`;
  prompt += `\n   - 阈值跑(T)配速范围：${formatPaceSec(zones.T.min)} ~ ${formatPaceSec(zones.T.max)}/km`;
  prompt += `\n   - 间歇跑(I)配速范围：${formatPaceSec(zones.I.min)} ~ ${formatPaceSec(zones.I.max)}/km`;
  prompt += `\n   - 重复跑(R)配速范围：${formatPaceSec(zones.R.min)} ~ ${formatPaceSec(zones.R.max)}/km`;
  prompt += `\n   - 所有阈值跑和间歇跑的 description 必须写清楚"组数×距离 @ 具体配速"，且要体现进阶。`;
  prompt += `\n5. 跑量设计：按能力和目标赛事合理设计跑量。全马巅峰期周跑量可达初始跑量的1.4-1.5倍；半马约1.3-1.35倍；10公里约1.15-1.2倍（peak周跑量通常24-30km）；5公里约1.1-1.15倍（peak周跑量通常17-22km）。不要给5k/10k套用马拉松的大跑量结构。`;
  prompt += `\n6. 轻松跑要求：每次轻松跑至少5km且不应大于15km。`;
  prompt += `\n7. 力量训练：基础期和减量期负荷较低时，周三可以安排一次力量训练（type=recovery），内容以下肢力量和核心训练为主，替换掉当天的跑步。`;
  prompt += `\n8. 所有 distance 数值请使用整数（km），不要出现小数点后多位的情况。`;
  prompt += `\n9. 减量期安排：比赛前2-3周完成最后一次长距离，之后只保留轻松跑和周二轻速度激活。`;

  prompt += `\n\n## 输出要求`;
  prompt += `\n1. 每周必须包含：周数(week)、训练阶段(phase: base/build/peak/taper)、总目标跑量(totalDistance, km)、本周备注(notes)、每日训练安排(sessions)`;
  prompt += `\n2. 每日训练必须标注：星期几(day: 0=周一~6=周日)、类型(type: easy/long/tempo/interval/recovery/rest/race)、标题(title)、内容描述(description)、目标距离(distance, km)、目标配速区间(paceZone: E/M/T/I/R，可选)`;
  prompt += `\n3. notes 字段要求：不要重复 PB 和目标配速，不要以"建立期/巅峰期/减量期/基础期"这几个字开头（因为前端已经会显示阶段名），而是直接写本周训练重点提示。例如：基础期写"以有氧积累为主，轻松跑保持对话配速"；建立期写"周二强度课注意控制配速，长距离可前慢后快"；巅峰期写"跑量与强度均达峰值，长距离中加入马配段落"；减量期写"逐步降低跑量，保持肌肉弹性"`;
  prompt += `\n4. 全马/半马在建立期后期、巅峰期和减量期（比赛前2-3周）的长距离中，必须加入马拉松配速(M配速)段落。例如：32km 长距离慢跑（前24km E + 后8km @ M配速 ${formatPaceSec(targetPace)}）；16km 长距离慢跑（前10km E + 后6km @ M配速 ${formatPaceSec(targetPace)}）。`;
  prompt += `\n5. 输出严格JSON格式，不要包含任何markdown标记或额外解释`;

  prompt += `\n\nJSON Schema:`;
  prompt += `\n{\n  "weeks": [`;
  prompt += `\n    {\n      "week": 1,\n      "phase": "base",\n      "totalDistance": 35,\n      "notes": "基础期：以有氧积累为主，轻松跑保持对话配速，周三进行力量训练。",`;
  prompt += `\n      "sessions": [`;
  prompt += `\n        { "day": 0, "type": "easy", "title": "轻松跑", "description": "6km 放松跑", "distance": 6, "paceZone": "E" },`;
  prompt += `\n        { "day": 1, "type": "interval", "title": "速度激活", "description": "8组 200m 轻快跑+200m 慢跑恢复", "distance": 6, "paceZone": "R" },`;
  prompt += `\n        { "day": 2, "type": "recovery", "title": "力量训练", "description": "下肢力量 + 核心训练（约45分钟）", "distance": 0 },`;
  prompt += `\n        { "day": 3, "type": "easy", "title": "轻松跑", "description": "6km 放松跑", "distance": 6, "paceZone": "E" },`;
  prompt += `\n        { "day": 4, "type": "easy", "title": "轻松跑", "description": "6km 放松跑", "distance": 6, "paceZone": "E" },`;
  prompt += `\n        { "day": 5, "type": "rest", "title": "休息", "description": "完全休息", "distance": 0 },`;
  prompt += `\n        { "day": 6, "type": "long", "title": "长距离", "description": "12km 全程匀速 E 配速", "distance": 12, "paceZone": "E" }`;
  prompt += `\n      ]\n    }\n  ]\n}`;

  return prompt;
}

/**
 * Generate training plan via AI
 */
export async function generateTrainingPlan(
  distance: RaceDistance,
  targetTimeSeconds: number,
  weeks: number,
  pb5kSec: number,
  weeklyVolume: number,
  raceDate?: string,
  locale?: string
): Promise<TrainingPlan> {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }

  const prompt = buildTrainingPlanPrompt(distance, targetTimeSeconds, weeks, pb5kSec, weeklyVolume, raceDate);

  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'kimi-k2.5',
      messages: [
        {
          role: 'system',
          content: '你是一位国家级马拉松教练，精通运动科学和训练周期化理论。你擅长根据运动员的目标和能力，设计科学、可执行的周期化训练计划。你的计划风格专业、数据驱动、注重安全（跑量渐进、充分恢复）。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.6,
      thinking: {
        type: 'disabled'
      }
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

  try {
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
                      content.match(/```\n?([\s\S]*?)\n?```/) ||
                      [null, content];
    const jsonStr = jsonMatch[1].trim();
    const result = JSON.parse(jsonStr);
    const weeksData: WeeklyPlan[] = (result.weeks || []).map((w: any, idx: number) => ({
      week: w.week || idx + 1,
      phase: w.phase || 'base',
      totalDistance: w.totalDistance || 0,
      notes: w.notes || '',
      sessions: (w.sessions || []).map((s: any) => ({
        day: s.day ?? 0,
        type: s.type || 'rest',
        title: s.title || '',
        description: s.description || '',
        distance: s.distance ?? 0,
        paceZone: s.paceZone,
      })),
    }));

    return {
      id: `plan_${Date.now()}`,
      createdAt: new Date().toISOString(),
      goal: { distance, targetTimeSeconds, raceDate },
      currentAbility: { pb5k: pb5kSec, weeklyVolume },
      weeks: weeksData,
    };
  } catch (e) {
    console.error('Failed to parse AI training plan:', content);
    // Fallback to local template
    return generateFallbackTrainingPlan(distance, targetTimeSeconds, weeks, pb5kSec, weeklyVolume, locale);
  }
}

/**
 * Generate fallback analysis when AI fails
 */
function generateFallbackAnalysis(
  activity: StravaActivity,
  profile: TrainingProfile,
  classification: ActivityClassification,
  locale: string = 'zh'
): AIAnalysis {
  const en = locale.startsWith('en');
  const paceSecKm = activity.moving_time / activity.distance * 1000;
  const paceMin = paceSecKm / 60;
  const paceStr = formatPace(paceSecKm);

  // Determine pace zone based on absolute pace thresholds
  let zone = 'E';
  let zoneDesc = en ? 'Easy zone' : '轻松跑区间';

  if (paceMin < 3.5) {
    zone = 'R';
    zoneDesc = en ? 'Repetition zone' : '重复跑区间';
  } else if (paceMin < 4.0) {
    zone = 'I';
    zoneDesc = en ? 'Interval zone' : '间歇跑区间';
  } else if (paceMin < 4.5) {
    zone = 'T';
    zoneDesc = en ? 'Threshold zone' : '乳酸阈值区间';
  } else if (paceMin < 5.3) {
    zone = 'M';
    zoneDesc = en ? 'Marathon pace zone' : '马拉松配速区间';
  } else if (paceMin < 6.2) {
    zone = 'E';
    zoneDesc = en ? 'Easy zone' : '轻松跑区间';
  } else {
    zone = 'E';
    zoneDesc = en ? 'Recovery zone' : '恢复跑区间';
  }

  // Race-specific fallback
  const fallbackComparison = profile.similarStats
    ? buildAccurateComparison(activity, profile.similarStats, locale)
    : null;

  if (classification.isRace) {
    return {
      summary: en
        ? `${classification.raceType || 'Race'} completed! Pace ${paceStr}/km. Great performance.`
        : `${classification.raceType || '比赛'}完成！配速${paceStr}/km，表现出色。`,
      intensity: 'extreme',
      recoveryHours: activity.distance > 40000 ? 168 : 48,
      comparisonToAverage: fallbackComparison?.comparisonToAverage || (en ? 'Excellent race performance' : '比赛表现优异'),
      suggestions: en
        ? [
            'Avoid high-intensity activities within 24 hours post-race.',
            'Replenish protein and carbs to accelerate recovery.',
            'Monitor muscle soreness and consider massage if needed.',
          ]
        : [
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
      trainingLoadContext: en ? 'Race is extreme intensity; full recovery needed.' : '比赛为极限强度，需要充分恢复',
      similarActivitiesInsight: fallbackComparison?.similarActivitiesInsight || (en ? 'Race completed' : '比赛完成'),
      nextWorkoutSuggestion: en
        ? 'Do only easy recovery runs or rest for the first 3 days post-race.'
        : '建议赛后3天内仅进行轻松恢复跑或休息',
      warnings: [en ? 'Ensure full recovery after a high-intensity race; avoid speed workouts immediately.' : '高强度比赛后需充分恢复，避免立即进行速度训练'],
    };
  }

  // Normal training fallback
  const suggestions = [...profile.patterns.trainingDeficiencies];
  if (!profile.patterns.hasLongRuns && activity.distance < 15000) {
    suggestions.push(en ? 'Try to schedule a 15km+ long run this week.' : '建议本周安排一次15km+的长距离训练');
  }
  if (!profile.patterns.hasIntervalWorkouts) {
    suggestions.push(en ? 'Try 400m x 6 interval workout once a week, keep pace in I zone.' : '可尝试每周一次400m×6间歇训练，配速控制在I区');
  }

  // Build comparison text based on accurate data
  let comparisonText = fallbackComparison?.comparisonToAverage || (en ? 'No historical comparison data yet' : '暂无历史对比数据');

  return {
    summary: en
      ? `Completed ${(activity.distance / 1000).toFixed(1)}km workout at ${paceStr}/km, in the ${zoneDesc}.`
      : `本次${(activity.distance / 1000).toFixed(1)}km训练完成，配速${paceStr}/km处于${zoneDesc}。`,
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
    trainingLoadContext: en
      ? `Avg weekly distance over past 4 weeks: ${(profile.patterns.typicalWeekDistance / 1000).toFixed(1)}km`
      : `近4周平均周跑量${(profile.patterns.typicalWeekDistance / 1000).toFixed(1)}km`,
    similarActivitiesInsight: fallbackComparison?.similarActivitiesInsight || (en ? 'No similar workout data yet' : '暂无类似训练数据'),
    nextWorkoutSuggestion: profile.patterns.hasLongRuns
      ? (en ? 'Next session: easy recovery run.' : '建议下次进行轻松跑恢复')
      : (en ? 'Next session: schedule a long aerobic run.' : '建议下次安排长距离有氧训练'),
    warnings: [],
  };
}
