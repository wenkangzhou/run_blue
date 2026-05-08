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

// ── Weather parsing ──────────────────────────────────────────────

interface ParsedWeather {
  temperature?: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  source: 'description' | 'device' | 'both';
}

/**
 * Extract weather info from activity.description (commonly injected by
 * COROS / Garmin / etc.) and/or the device-reported average_temp.
 */
function parseWeatherFromDescription(
  description?: string,
  averageTemp?: number
): ParsedWeather | null {
  const result: ParsedWeather = { source: 'description' };

  // 1. Device-reported average temperature
  if (averageTemp !== undefined && averageTemp !== null) {
    result.temperature = Math.round(averageTemp);
    result.source = 'device';
  }

  if (!description) {
    return result.temperature !== undefined ? result : null;
  }

  // 2. Temperature from description emoji/text
  const tempPatterns = [
    /🌡️?\s*([\d.]+)\s*[°℃]?\s*C/i,
    /气温[:\s]*([\d.]+)\s*[°℃]?\s*C?/i,
    /Temp(?:erature)?[:\s]*([\d.]+)\s*[°℃]?\s*C?/i,
  ];
  for (const p of tempPatterns) {
    const m = description.match(p);
    if (m) {
      result.temperature = parseFloat(m[1]);
      result.source = result.source === 'device' ? 'both' : 'description';
      break;
    }
  }

  // 3. Feels-like / apparent temperature
  const feelsPatterns = [
    /Feels like\s+([\d.]+)\s*[°℃]?\s*C?/i,
    /体感[温度]*[:\s]*([\d.]+)\s*[°℃]?\s*C?/i,
  ];
  for (const p of feelsPatterns) {
    const m = description.match(p);
    if (m) {
      result.feelsLike = parseFloat(m[1]);
      break;
    }
  }

  // 4. Humidity
  const humPatterns = [
    /💧?\s*([\d]+)\s*%/,
    /湿度[:\s]*([\d]+)\s*%?/i,
    /Humidity[:\s]*([\d]+)\s*%?/i,
  ];
  for (const p of humPatterns) {
    const m = description.match(p);
    if (m) {
      result.humidity = parseInt(m[1], 10);
      break;
    }
  }

  // 5. Wind speed
  const windPatterns = [
    /💨?\s*([\d.]+)\s*km\/h/i,
    /风速[:\s]*([\d.]+)\s*km\/h/i,
    /Wind[:\s]*([\d.]+)\s*km\/h/i,
  ];
  for (const p of windPatterns) {
    const m = description.match(p);
    if (m) {
      result.windSpeed = parseFloat(m[1]);
      break;
    }
  }

  const hasAny =
    result.temperature !== undefined ||
    result.feelsLike !== undefined ||
    result.humidity !== undefined ||
    result.windSpeed !== undefined;

  return hasAny ? result : null;
}

function getDistanceLabel(distanceMeters: number, en: boolean): string {
  const km = distanceMeters / 1000;
  if (en) {
    if (km < 3) return `short (~${Math.round(km)}km)`;
    if (km < 7) return `mid (~${Math.round(km)}km)`;
    return `long (~${Math.round(km)}km)`;
  }
  if (km < 3) return `短距离(~${Math.round(km)}km)`;
  if (km < 7) return `中距离(~${Math.round(km)}km)`;
  return `长距离(~${Math.round(km)}km)`;
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

  const distanceLabel = getDistanceLabel(activity.distance, en);
  let insight = en
    ? `Faster than ${similarStats.yourPaceRank}% among ${similarStats.count} comparable ${distanceLabel} workouts. `
    : `在 ${similarStats.count} 次同类${distanceLabel}训练中超过 ${similarStats.yourPaceRank}%。`;
  if (diffSec === 0) {
    insight += en ? 'This pace is basically the same as the historical average' : '本次配速与历史平均基本持平';
  } else {
    insight += en
      ? `This pace is ${diffAbs}s/km ${diffText} than the historical average`
      : `本次配速比历史平均${diffText} ${diffAbs} 秒/km`;
  }
  const trendText = (() => {
    // If this workout is significantly better than average, praise it regardless of short-term trend
    if (similarStats.yourPaceRank >= 80 && diffSec <= 0) {
      return en ? ', an excellent performance in this session' : '，本次训练表现优异';
    }
    if (similarStats.trendDirection === 'improving') {
      return en ? ', showing an improving trend recently' : '，近期呈进步趋势';
    }
    if (similarStats.trendDirection === 'declining') {
      return en ? ', recent state has declined' : '，近期状态有所下滑';
    }
    return en ? ', recent state remains stable' : '，近期状态保持稳定';
  })();
  insight += trendText;

  return { comparisonToAverage: comparison, similarActivitiesInsight: insight };
}

/**
 * Build professional coaching prompt using training profile
 */
export interface UserPhysique {
  height?: number | null; // cm
  weight?: number | null; // kg
}

export function buildProfessionalPrompt(
  activity: StravaActivity,
  streams: Record<string, any> | null,
  trainingProfile: TrainingProfile,
  classification: ActivityClassification,
  locale: string = 'zh',
  physique?: UserPhysique
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

  // Athlete physique info
  if (physique?.height || physique?.weight) {
    prompt += en ? `\n\n## Athlete Profile` : `\n\n## 运动员资料`;
    if (physique.height) {
      prompt += en
        ? `\n- Height: ${physique.height} cm`
        : `\n- 身高: ${physique.height} cm`;
    }
    if (physique.weight) {
      prompt += en
        ? `\n- Weight: ${physique.weight} kg`
        : `\n- 体重: ${physique.weight} kg`;
    }
    if (physique.height && physique.weight) {
      const bmi = (physique.weight / ((physique.height / 100) ** 2)).toFixed(1);
      prompt += en
        ? `\n- BMI: ${bmi}`
        : `\n- BMI: ${bmi}`;
      prompt += en
        ? `\n- When analyzing, consider the athlete's body composition: a lower BMI may indicate better running economy for distance events, while a higher BMI suggests more muscle mass which can benefit power-based efforts. Tailor injury prevention and nutrition advice accordingly.`
        : `\n- 分析时请结合运动员身体构成：较低BMI通常意味着更好的长跑经济性，较高BMI可能代表更多肌肉量有利于力量型训练。据此调整受伤预防和营养建议。`;
    }
  }

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

  // Weekly load trend: show current week, last week, and 4-week average
  if (recentLoad.length > 0) {
    const currentWeek = recentLoad[recentLoad.length - 1];
    const lastWeek = recentLoad.length > 1 ? recentLoad[recentLoad.length - 2] : null;
    const recent4Weeks = recentLoad.slice(-4);
    const avg4WeekDistance = recent4Weeks.reduce((sum, w) => sum + w.totalDistance, 0) / recent4Weeks.length;
    prompt += en ? `\n\nWeekly Load (last 4 weeks):` : `\n\n周跑量趋势（近4周）:`;
    prompt += en
      ? `\n- Current week: ${(currentWeek.totalDistance / 1000).toFixed(1)}km (${currentWeek.runs} runs)`
      : `\n- 本周: ${(currentWeek.totalDistance / 1000).toFixed(1)}km (${currentWeek.runs}次)`;
    if (lastWeek) {
      const changePct = lastWeek.totalDistance > 0
        ? ((currentWeek.totalDistance - lastWeek.totalDistance) / lastWeek.totalDistance * 100).toFixed(1)
        : '0';
      prompt += en
        ? `, ${changePct > '0' ? '+' : ''}${changePct}% vs last week`
        : `，环比上周${changePct > '0' ? '+' : ''}${changePct}%`;
    }
    prompt += en
      ? `\n- 4-week avg: ${(avg4WeekDistance / 1000).toFixed(1)}km`
      : `\n- 近4周平均: ${(avg4WeekDistance / 1000).toFixed(1)}km`;
  }

  // Weather conditions
  const weatherInfo = parseWeatherFromDescription(activity.description, activity.average_temp);
  if (weatherInfo) {
    prompt += en ? `\n\n## Weather Conditions` : `\n\n## 天气条件`;
    if (weatherInfo.temperature !== undefined) {
      prompt += en ? `\n- Temperature: ${weatherInfo.temperature}°C` : `\n- 气温: ${weatherInfo.temperature}°C`;
    }
    if (weatherInfo.feelsLike !== undefined) {
      prompt += en ? `\n- Feels like: ${weatherInfo.feelsLike}°C` : `\n- 体感温度: ${weatherInfo.feelsLike}°C`;
    }
    if (weatherInfo.humidity !== undefined) {
      prompt += en ? `\n- Humidity: ${weatherInfo.humidity}%` : `\n- 湿度: ${weatherInfo.humidity}%`;
    }
    if (weatherInfo.windSpeed !== undefined) {
      prompt += en ? `\n- Wind: ${weatherInfo.windSpeed} km/h` : `\n- 风速: ${weatherInfo.windSpeed} km/h`;
    }
    prompt += en
      ? `\n\nWhen analyzing, consider thermal stress: elevated temperature and humidity increase heart rate and RPE at the same pace. In hot/humid conditions (temp > 26°C or humidity > 70%), do NOT judge performance solely by raw pace or heart rate. Account for heat stress when comparing to cooler-weather runs.`
      : `\n\n分析时请考虑热应激因素：高温高湿环境下，同样配速的心率和主观疲劳感会显著上升。当气温超过26°C或湿度超过70%时，不要仅凭原始配速或心率判定表现好坏，应将热应激因素纳入历史对比的考量。`;
  }

  // Similar activities comparison
  const distanceLabel = getDistanceLabel(activity.distance, en);
  if (similarStats) {
    prompt += en
      ? `\n\nComparable Workouts Comparison (${similarStats.count} ${distanceLabel} workouts):`
      : `\n\n同类训练对比（${similarStats.count}次${distanceLabel}）:`;
    prompt += en
      ? `\n- Historical avg pace: ${formatPace(similarStats.avgPace * 60)}/km`
      : `\n- 历史平均配速: ${formatPace(similarStats.avgPace * 60)}/km`;
    prompt += en
      ? `\n- Fastest comparable pace: ${formatPace(similarStats.bestPace * 60)}/km`
      : `\n- 同类训练最快配速: ${formatPace(similarStats.bestPace * 60)}/km`;
    prompt += en
      ? `\n- This workout: faster than ${similarStats.yourPaceRank}% of comparable ${distanceLabel} workouts`
      : `\n- 本次表现: 超过${similarStats.yourPaceRank}%的同类${distanceLabel}训练`;
    prompt += en
      ? `\n- Recent 5 comparable avg pace: ${formatPace(similarStats.recentAvgPace * 60)}/km`
      : `\n- 最近5次同类平均配速: ${formatPace(similarStats.recentAvgPace * 60)}/km`;
    prompt += en
      ? `\n- Next 5 older comparable avg pace: ${formatPace(similarStats.olderAvgPace * 60)}/km`
      : `\n- 再早5次同类平均配速: ${formatPace(similarStats.olderAvgPace * 60)}/km`;
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
      ? `\n3. Load assessment: Judge based on (a) this workout's intensity and distance ratio to current week volume, (b) week-over-week change. If current week volume jumped >15% vs last week, FLAG it as "volume increase too fast, injury risk". If the workout itself is hard (T/I/R zone) and >15% of weekly volume, FLAG it as "high single-session load". Do NOT mechanically say "volume is too low" when weekly volume is actually rising.`
      : `\n3. 负荷评估: 基于以下两点判断：(a)本次训练强度及占本周跑量比例，(b)本周 vs 上周跑量环比变化。如果本周跑量环比上周增长>15%，必须标记为"跑量增加过快，注意受伤风险"。如果单次高强度训练（T/I/R区）占本周跑量>15%，标记为"单次负荷较大"。不要在周跑量实际处于上升期时机械地说"跑量偏低"。`;
    if (similarStats) {
      prompt += en
        ? `\n4. Comparable workout comparison (${similarStats.count} ${distanceLabel}): this pace ${paceStr}/km vs historical avg ${formatPace(similarStats.avgPace * 60)}/km and fastest comparable ${formatPace(similarStats.bestPace * 60)}/km. You outpaced ${similarStats.yourPaceRank}% of them.`
        : `\n4. 同类训练对比（${similarStats.count}次${distanceLabel}）：本次配速${paceStr}/km，历史平均${formatPace(similarStats.avgPace * 60)}/km，同类最快${formatPace(similarStats.bestPace * 60)}/km。超过${similarStats.yourPaceRank}%的同类训练。`;
    } else {
      prompt += en ? `\n4. Comparable workout comparison: no comparable historical data yet.` : `\n4. 同类训练对比: 暂无可比历史数据。`;
    }
    prompt += en
      ? `\n5. Next workout suggestion: CRITICAL RULE — If this workout intensity is "hard"/"extreme" OR pace zone is T/I/R, the next session MUST be an easy recovery run (E zone, 5-8km, 30-60s/km slower than marathon pace), with the goal of active recovery. NO intensity workouts (tempo, interval, or repetition) should be suggested after a hard session. Only if this was an easy/moderate aerobic run, you may suggest a specific quality session from the three-components perspective.`
      : `\n5. 下次训练建议: 关键规则 — 如果本次强度为"hard"/"extreme"或配速区间落在T/I/R，下次训练必须是轻松恢复跑（E区，5-8km，比马拉松配速慢30-60秒/km），目的是促进恢复。严禁在高强度训练后建议乳酸阈值跑、间歇跑或重复跑。只有本次是有氧轻松跑时，才可以从三要素角度建议具体质量课。`;

    // Extra guidance for long runs (>= 15km)
    if (activity.distance >= 15000) {
      prompt += en
        ? `\n\n⚠️ LONG RUN SPECIAL GUIDANCE (this workout is ${distanceKm}km, a long run):`
        : `\n\n⚠️ 长距离训练特别指引（本次${distanceKm}km，属于长距离训练）:`;
      prompt += en
        ? `\n- Long run pace is NATURALLY slower than short easy runs. DO NOT judge it as "poor performance" just because the pace is slower than shorter workouts. The key metrics for long runs are: (a) overall pace stability, (b) heart rate drift control, (c) energy distribution strategy.`
        : `\n- 长距离配速天然比短距离慢跑慢。绝对不能因为配速比短距离训练慢就判定为"表现差"。长距离的核心评估指标是：(a)整体配速稳定性，(b)心率漂移控制，(c)能量分配策略。`;
      prompt += en
        ? `\n- If pace is stable within E zone throughout: PRAISE the aerobic endurance base. If the second half is slightly faster than the first (negative split or marathon-pace segments): PRAISE the progression run strategy. Only criticize if there is a significant collapse (>20s/km slowdown) in the final 1/3 without intentional cause.`
        : `\n- 如果全程E区配速稳定：表扬有氧耐力基础扎实。如果后半程比前半程略快（负分割或穿插马配）：表扬progression run执行策略。只有当最后1/3出现非主动的明显掉速（>20秒/km）时才批评。`;
      prompt += en
        ? `\n- When writing "similarActivitiesInsight", NEVER label a long run as "historical worst" solely based on pace. Consider the execution quality (pace consistency, HR drift) instead of raw speed. If similarStats count is low (<5), explicitly note that the sample size is small and avoid strong conclusions.`
        : `\n- 写"similarActivitiesInsight"时，绝对不能仅因配速就把长距离标记为"历史最差"。应关注执行质量（配速稳定性、心率漂移）而非绝对速度。如果similarStats样本数较少（<5次），请明确说明样本不足，避免下强烈结论。`;
      prompt += en
        ? `\n- In "suggestions", focus on: fueling/hydration for future long runs, pacing strategy refinements, and recovery needs. Do NOT suggest "increase speed" for a long run.`
        : `\n- "suggestions"中应聚焦：未来长距离的补给策略、配速策略优化、恢复需求。严禁对长距离训练建议"提升速度"。`;
    }
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
      ? `\n{\n  "summary": "Overall evaluation (80-200 words, professional coach tone). Must include: (1) what type of workout this was and why, (2) a sentence of performance assessment with specific data reference, (3) one concrete highlight or area to watch, (4) brief context from weekly load trend. Do NOT just list numbers—explain what they mean.",`
      : `\n{\n  "summary": "总体评价（80-200字，专业教练口吻）。必须包含：(1)本次训练类型判定及原因，(2)结合具体数据的一句话表现点评，(3)一个具体亮点或注意点，(4)结合周跑量趋势的简要上下文。不要简单罗列数字——要解释数字背后的意义。",`;
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
    ? `\n    "description": "Describe what this pace zone means for the athlete in one sentence.",`
    : `\n    "description": "用一句话说明该配速区间对这位运动员的意义。",`;
  prompt += `\n    "appropriateness": "appropriate|too-fast|too-slow"`;
  prompt += `\n  },`;
  prompt += en
    ? `\n  "trainingLoadContext": "Load assessment: combine single-session intensity + weekly volume trend. Do NOT just report numbers. Give a coach-style conclusion like 'This tempo run accounts for 23% of weekly volume, load is moderate; weekly volume up 12% WoW, within safe range.'",`
    : `\n  "trainingLoadContext": "负荷评估：结合单次强度+周跑量趋势给出教练式结论。不要只报数字。例如'本次节奏跑占本周跑量23%，单次负荷适中；本周跑量环比+12%，处于安全上升区间'。",`;
  prompt += en
    ? `\n  "similarActivitiesInsight": "Based on the historical comparison data provided in the prompt, write an insightful observation about THIS workout's standing. If it ranks top 10%, praise the execution quality. If pace was inconsistent, note that. Do NOT just repeat numbers.",`
    : `\n  "similarActivitiesInsight": "基于prompt中提供的历史对比数据，写出对本次训练站位的一句有洞察的评价。如果排名前10%，表扬执行质量。如果配速波动大，指出这一点。不要简单重复数字。",`;
  prompt += en
    ? `\n  "nextWorkoutSuggestion": "Give SPECIFIC details: exact distance, pace zone, and 1 recovery tip. Example: 'Easy run 6km @ E pace (5:30/km), focus on relaxed stride and sleep early.'",`
    : `\n  "nextWorkoutSuggestion": "给出具体方案：精确距离、配速区间、1条恢复注意点。例如'轻松跑6km，E区配速5分30秒，注意放松步频、早睡'。",`;
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
  prompt += en
    ? `\n- In "suggestions", do NOT mechanically recommend "increase weekly volume to X km". Instead, focus on: (1) if weekly volume spiked, warn about injury risk and recommend rest; (2) if this was a hard session, recommend recovery; (3) give 1-2 specific, actionable technique or pacing tips relevant to THIS workout.`
    : `\n- "suggestions" 中不要机械建议"把周跑量提升到XXkm"。应聚焦：(1)如果本周跑量环比大增，提醒受伤风险并建议休息；(2)如果本次是高强度训练，建议恢复；(3)给出1-2条与本次训练直接相关的技术或配速建议。`;
  prompt += en
    ? `\n- Each field must be substantive (at least 30 words for summary, at least 20 words for trainingLoadContext/similarActivitiesInsight/nextWorkoutSuggestion). Empty or one-sentence responses are NOT acceptable.`
    : `\n- 每个字段必须有实质内容（summary 至少30字，trainingLoadContext/similarActivitiesInsight/nextWorkoutSuggestion 至少20字）。空值或一句话敷衍 unacceptable。`;
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
  locale: string = 'zh',
  physique?: UserPhysique
): Promise<AIAnalysis> {
  const apiKey = process.env.KIMI_API_KEY;

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }

  const en = locale.startsWith('en');
  const classification = classifyActivity(activity);
  const prompt = buildProfessionalPrompt(activity, streams, trainingProfile, classification, locale, physique);

  // Retry on JSON parse failure (common on cold-start / network hiccup)
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
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
          max_tokens: 4096,
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

      const result = parseAIResponse(content, activity, trainingProfile, classification, locale);
      console.log(`[AI] Attempt ${attempt} succeeded. Summary length: ${result.summary.length}`);
      return result;
    } catch (e) {
      console.error(`[AI] Attempt ${attempt} failed:`, e);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 1500));
      } else {
        // All attempts exhausted — fallback
        return generateFallbackAnalysis(activity, trainingProfile, classification, locale);
      }
    }
  }

  // Should never reach here, but satisfy TypeScript
  return generateFallbackAnalysis(activity, trainingProfile, classification, locale);
}

/**
 * Parse AI JSON response into AIAnalysis struct
 */
function parseAIResponse(
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
      isFallback: true,
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
    isFallback: true,
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
