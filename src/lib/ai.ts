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
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
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
  physique?: UserPhysique,
  lthr?: number | null,
  streamAnalysis?: string,
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
  // Trail run detection: significant elevation gain relative to distance
  const elevationRatio = activity.total_elevation_gain / activity.distance;
  const isTrailRun = activity.sport_type === 'TrailRun' || activity.type === 'TrailRun' || elevationRatio > 0.05;
  const equivalentDistance = isTrailRun
    ? activity.distance + activity.total_elevation_gain * 10 // 100m climb ≈ 1km equivalent
    : activity.distance;
  const equivalentPaceSecKm = activity.moving_time / equivalentDistance * 1000;
  const equivalentPaceStr = formatPace(equivalentPaceSecKm);

  if (isTrailRun) {
    prompt += en
      ? `\n- ⚠️ Trail/ mountain run detected. Elevation gain: ${Math.round(activity.total_elevation_gain)}m (ratio ${(elevationRatio * 1000).toFixed(0)}m/km)`
      : `\n- ⚠️ 检测到越野跑/山地跑。爬升: ${Math.round(activity.total_elevation_gain)}米（每公里爬升${(elevationRatio * 1000).toFixed(0)}米）`;
    prompt += en
      ? `\n- Equivalent distance (flat-ground equivalent): ${(equivalentDistance / 1000).toFixed(2)} km (actual ${distanceKm}km + climb equivalent)`
      : `\n- 等效平路距离: ${(equivalentDistance / 1000).toFixed(2)} km（实际${distanceKm}km + 爬升等效）`;
    prompt += en
      ? `\n- Equivalent pace (flat-ground equivalent): ${equivalentPaceStr}/km — USE THIS for performance evaluation, NOT raw pace`
      : `\n- 等效平路配速: ${equivalentPaceStr}/km — 评估表现时必须使用等效配速，禁止直接用原始配速`;
  }

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

  // LTHR-based heart rate zones (Joe Friel / TrainingPeaks method)
  if (lthr && lthr > 0) {
    prompt += en
      ? `\n\n## Heart Rate Zones (LTHR-based, Joe Friel method)`
      : `\n\n## 心率区间（基于 LTHR，Joe Friel 法）`;
    prompt += en
      ? `\n- LTHR (lactate threshold heart rate): ${lthr} bpm`
      : `\n- 乳酸阈值心率(LTHR): ${lthr} bpm`;
    prompt += en
      ? `\n- Z1 Recovery: < ${Math.round(lthr * 0.85)} bpm`
      : `\n- Z1 恢复: < ${Math.round(lthr * 0.85)} bpm`;
    prompt += en
      ? `\n- Z2 Aerobic Base: ${Math.round(lthr * 0.85)}-${Math.round(lthr * 0.89)} bpm`
      : `\n- Z2 有氧基础: ${Math.round(lthr * 0.85)}-${Math.round(lthr * 0.89)} bpm`;
    prompt += en
      ? `\n- Z3 Marathon Pace: ${Math.round(lthr * 0.90)}-${Math.round(lthr * 0.94)} bpm`
      : `\n- Z3 马拉松配速: ${Math.round(lthr * 0.90)}-${Math.round(lthr * 0.94)} bpm`;
    prompt += en
      ? `\n- Z4 Threshold: ${Math.round(lthr * 0.95)}-${Math.round(lthr * 0.99)} bpm`
      : `\n- Z4 阈值: ${Math.round(lthr * 0.95)}-${Math.round(lthr * 0.99)} bpm`;
    prompt += en
      ? `\n- Z5 VO2max: ≥ ${lthr} bpm`
      : `\n- Z5 VO2max: ≥ ${lthr} bpm`;
    prompt += en
      ? `\n- CRITICAL: When evaluating heart rate changes, you MUST compare against these LTHR zones, NOT absolute numbers or generic max-heart-rate formulas.`
      : `\n- 关键：评估心率变化时必须对照以上 LTHR 区间，禁止用绝对数字或通用最大心率公式。`;
  }

  // Stream-based segment analysis (HR + pace per km)
  if (streamAnalysis) {
    prompt += streamAnalysis;
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
    if (isTrailRun) {
      prompt += en
        ? `\n\n⚠️ TRAIL RACE SPECIAL RULES:`
        : `\n\n⚠️ 越野跑/山地赛特别规则:`;
      prompt += en
        ? `\n- This is a trail race with significant elevation gain. You MUST use the EQUIVALENT PACE (${equivalentPaceStr}/km) for performance evaluation, NOT the raw pace (${paceStr}/km). Comparing raw trail pace to flat-road pace is MEANINGLESS and will produce absurd conclusions.`
        : `\n- 这是一场有明显爬升的越野赛/山地赛。评估表现时必须使用等效平路配速（${equivalentPaceStr}/km），严禁使用原始配速（${paceStr}/km）直接对比平路成绩。用原始越野配速对比平路配速会得出荒谬结论。`;
      prompt += en
        ? `\n- When comparing to historical data, use the equivalent pace. If there are no comparable trail races in history, explicitly state this and avoid making false "slower than average" claims.`
        : `\n- 与历史数据对比时必须使用等效配速。如果历史中没有可比的越野赛记录，请明确说明，不要错误地下"比平均慢"的结论。`;
      prompt += en
        ? `\n- Climbing ability IS a core performance metric in trail running. Acknowledge the athlete's climbing strength. Do NOT label a strong trail performance as "poor" just because the raw pace looks slow on paper.`
        : `\n- 爬升能力是越野跑的核心竞技指标之一。应认可运动员的爬坡能力。绝不能仅因为原始配速数字看起来慢就把优秀的越野表现判定为"表现差"。`;
      prompt += en
        ? `\n- Heart rate in trail races is naturally lower at the same effort level due to running economy differences on varied terrain. Do NOT interpret a lower HR vs flat-road races as "not trying hard enough".`
        : `\n- 越野跑在同样努力程度下心率天然比平路低（多变地形导致跑步经济性不同）。不要把比平路赛低的心率解读为"没有拼尽全力"。`;
    }
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
        ? `\n- Long run pace is NATURALLY slower than short easy runs. DO NOT judge it as "poor performance" just because the pace is slower than shorter workouts. The key metrics for long runs are: (a) overall pace stability, (b) heart rate drift assessment (see rules below), (c) energy distribution strategy.`
        : `\n- 长距离配速天然比短距离慢跑慢。绝对不能因为配速比短距离训练慢就判定为"表现差"。长距离的核心评估指标是：(a)整体配速稳定性，(b)心率漂移评估（见下方规则），(c)能量分配策略。`;
      prompt += en
        ? `\n- If pace is stable within E zone throughout: PRAISE the aerobic endurance base. If the second half is slightly faster than the first (negative split or marathon-pace segments): PRAISE the progression run strategy. Only criticize if there is a significant collapse (>20s/km slowdown) in the final 1/3 without intentional cause.`
        : `\n- 如果全程E区配速稳定：表扬有氧耐力基础扎实。如果后半程比前半程略快（负分割或穿插马配）：表扬progression run执行策略。只有当最后1/3出现非主动的明显掉速（>20秒/km）时才批评。`;
      prompt += en
        ? `\n- When writing "similarActivitiesInsight", NEVER label a long run as "historical worst" solely based on pace. Consider the execution quality (pace consistency, HR drift) instead of raw speed. If similarStats count is low (<5), explicitly note that the sample size is small and avoid strong conclusions.`
        : `\n- 写"similarActivitiesInsight"时，绝对不能仅因配速就把长距离标记为"历史最差"。应关注执行质量（配速稳定性、心率漂移）而非绝对速度。如果similarStats样本数较少（<5次），请明确说明样本不足，避免下强烈结论。`;
      prompt += en
        ? `\n- Heart Rate Drift Rules (CRITICAL): When assessing "cardiac drift" during long runs, you MUST consider BOTH heart rate AND pace changes together. If a segment's heart rate rises but its pace is also significantly faster (>15% above average), this is a NORMAL acceleration segment (fartlek, marathon-pace insert, or progression run) — NOT drift. Only label it as "cardiac drift" when heart rate rises WITHOUT a corresponding pace increase. If the per-km breakdown shows pace surges, explicitly acknowledge them and do NOT mislabel them as drift.`
        : `\n- 心率漂移判定规则（关键）：评估长距离训练中的"心率漂移"时，必须同时考虑心率和配速变化。如果某段心率上升但配速也明显加快（比平均配速快15%以上），这是正常的加速段（法特莱克、穿插马配或渐进跑）—— NOT 漂移。只有当心率上升而配速没有对应加快时，才判定为"心率漂移"。如果每公里分段数据显示有配速加速段，请明确承认并禁止将其误标为漂移。`;
      prompt += en
        ? `\n- In "suggestions", focus on: fueling/hydration for future long runs, pacing strategy refinements, and recovery needs. Do NOT suggest "increase speed" for a long run.`
        : `\n- "suggestions"中应聚焦：未来长距离的补给策略、配速策略优化、恢复需求。严禁对长距离训练建议"提升速度"。`;
    }
  }

  // 鼓励加油的情绪价值要求
  prompt += en ? `\n\n## Emotional Support & Encouragement` : `\n\n## 情绪价值与鼓励`;
  prompt += en
    ? `\nWhen the workout was well-executed (pace consistency, HR control, or ranking top 30% in similar workouts), include genuine praise and encouragement. Examples: "Excellent execution — your pacing was spot on!" / "Strong workout! You're clearly building fitness." / "Great job holding steady — this shows real progress." Avoid generic "good job" — be specific about what was done well.`
    : `\n当训练执行良好时（配速稳定、心率控制得当、或在同类训练中排名前30%），请给予真诚的表扬和鼓励。例如："执行得很棒——配速控制非常精准！" / "扎实的训练！你的体能明显在提升。" / "保持得很好——这说明你确实在进步。" 避免泛泛的"不错"，要具体指出哪里做得好。`;
  prompt += en
    ? `\nEven when pointing out areas for improvement, maintain a supportive, coach-like tone. Frame suggestions as opportunities: "Next time, try..." rather than "You failed to...".` 
    : `\n即使指出需要改进的地方，也要保持支持性的教练口吻。把建议包装成机会："下次可以尝试..." 而不是 "你没有做到..."`;

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
  physique?: UserPhysique,
  lthr?: number | null,
  streamAnalysis?: string,
): Promise<AIAnalysis> {
  const apiKey = process.env.KIMI_API_KEY;

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }

  const en = locale.startsWith('en');
  const classification = classifyActivity(activity);
  const prompt = buildProfessionalPrompt(activity, streams, trainingProfile, classification, locale, physique, lthr, streamAnalysis);

  // Retry on JSON parse failure (common on cold-start / network hiccup)
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: controller.signal,
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
          max_tokens: 16384,
          thinking: {
            type: 'disabled'
          }
        }),
      });

      clearTimeout(timeoutId);
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
 * Riegel formula: predict equivalent performance at another distance
 * T2 = T1 * (D2/D1)^1.06
 */
function predictTimeFrom5K(pb5kSec: number, targetDistanceKm: number): number {
  const ratio = targetDistanceKm / 5;
  return pb5kSec * Math.pow(ratio, 1.06);
}

interface GoalAssessment {
  realistic: boolean;
  profile: 'elite' | 'maintain' | 'breakthrough' | 'mass_completion' | 'too_conservative';
  profileLabel: string;
  equivalentTime: number;
  gapPercent: number;
  message: string;
}

function assessGoal(
  distance: RaceDistance,
  targetTimeSeconds: number,
  pb5kSec: number,
  locale: string = 'zh'
): GoalAssessment {
  const en = locale.startsWith('en');
  const d = distance === '5k' ? 5 : distance === '10k' ? 10 : distance === '21k' ? 21.0975 : 42.195;
  const equiv = predictTimeFrom5K(pb5kSec, d);
  const gap = ((targetTimeSeconds - equiv) / equiv) * 100;

  let profile: GoalAssessment['profile'];
  let label: string;
  let msg: string;

  if (gap < -5) {
    profile = 'elite';
    label = en ? 'Elite-level goal' : '精英级目标';
    msg = en
      ? `Your goal is faster than your 5K PB equivalency. This is extremely ambitious and likely unrealistic unless your 5K PB is outdated.`
      : `你的目标比 5K PB 推算的等效成绩还快，这个目标极具挑战性。除非你的 5K PB 已经过时，否则不太现实。`;
  } else if (gap <= 5) {
    profile = 'maintain';
    label = en ? 'Maintain / sharpen' : '维持/精进型';
    msg = en
      ? `Your goal is close to your 5K PB equivalency. Focus on pace familiarity, race-specific workouts, and fine-tuning.`
      : `你的目标接近 5K PB 推算的等效成绩，课表侧重配速熟练度、比赛模拟和细节调整。`;
  } else if (gap <= 15) {
    profile = 'breakthrough';
    label = en ? 'Breakthrough' : '突破型';
    msg = en
      ? `Your goal is 5-15% slower than equivalency — a solid, achievable target. The plan emphasizes aerobic base, threshold development, and progressive overload.`
      : `你的目标比等效成绩慢 5-15%，是一个合理且有挑战的目标。课表侧重有氧积累、阈值提升和渐进超负荷。`;
  } else if (gap <= 30) {
    profile = 'mass_completion';
    label = en ? 'Completion focused' : '完赛型';
    msg = en
      ? `Your goal is 15-30% slower than equivalency — a conservative, completion-focused target. The plan emphasizes endurance, long runs, and injury prevention.`
      : `你的目标比等效成绩慢 15-30%，是一个偏保守、以完赛为导向的目标。课表侧重耐力、长距离和防伤。`;
  } else {
    profile = 'too_conservative';
    label = en ? 'Very conservative' : '过于保守';
    msg = en
      ? `Your goal is >30% slower than equivalency. You are likely capable of a much faster time. Consider setting a more challenging goal.`
      : `你的目标比等效成绩慢超过 30%，你完全有能力跑得更快。建议设定一个更有挑战性的目标。`;
  }

  return {
    realistic: gap < 30 && gap > -10,
    profile,
    profileLabel: label,
    equivalentTime: Math.round(equiv),
    gapPercent: Math.round(gap * 10) / 10,
    message: msg,
  };
}

/**
 * Build training plan prompt — bilingual, with progression tables & recovery weeks
 */
export function buildTrainingPlanPrompt(
  distance: RaceDistance,
  targetTimeSeconds: number,
  weeks: number,
  pb5kSec: number,
  weeklyVolume: number,
  raceDate?: string,
  locale?: string
): string {
  const en = (locale || 'zh').startsWith('en');
  const zones = calculatePaceZones(pb5kSec);
  const targetPace = (() => {
    const d = distance === '5k' ? 5 : distance === '10k' ? 10 : distance === '21k' ? 21.0975 : 42.195;
    return targetTimeSeconds / d;
  })();
  const assessment = assessGoal(distance, targetTimeSeconds, pb5kSec, locale);

  const raceName = en
    ? (distance === '5k' ? '5K' : distance === '10k' ? '10K' : distance === '21k' ? 'Half Marathon' : 'Marathon')
    : (distance === '5k' ? '5公里' : distance === '10k' ? '10公里' : distance === '21k' ? '半程马拉松' : '全程马拉松');

  // ── Progression tables tailored to distance ──
  const intervalProgression: Record<string, string[]> = {
    '5k':  ['8×200m @ R', '6×400m @ I', '5×400m @ I', '4×600m @ I', '3×800m @ I', '5×400m @ I', '3×1000m @ I', '4×600m @ I'],
    '10k': ['6×400m @ I', '5×600m @ I', '4×800m @ I', '5×800m @ I', '4×1000m @ I', '3×1200m @ I', '5×800m @ I', '3×1600m @ I'],
    '21k': ['6×400m @ I', '5×800m @ I', '4×1000m @ I', '3×1200m @ I', '4×1000m @ I', '3×1600m @ I', '2×3km @ T', '3×2km @ T'],
    '42k': ['6×400m @ I', '5×800m @ I', '4×1000m @ I', '3×1200m @ I', '4×1000m @ I', '3×1600m @ I', '2×3km @ T', '3×2km @ T'],
  };
  const tempoProgression: Record<string, string[]> = {
    '5k':  ['3×1km @ T', '2×1.5km @ T', '1×3km @ T', '2×2km @ T', '1×4km @ T', '2×1.5km @ T', '1×3km @ T', '3×1km @ T'],
    '10k': ['3×1km @ T', '2×2km @ T', '1×4km @ T', '2×3km @ T', '1×5km @ T', '2×2km @ T', '1×6km @ T', '3×2km @ T'],
    '21k': ['3×1.5km @ T', '2×3km @ T', '1×5km @ T', '1×6km @ T', '1×8km @ T', '2×4km @ T', '1×10km @ T', '1×6km @ T'],
    '42k': ['3×1.5km @ T', '2×3km @ T', '1×5km @ T', '1×6km @ T', '1×8km @ T', '2×4km @ T', '1×10km @ T', '1×6km @ T'],
  };
  const longProgression: Record<string, string[]> = {
    '5k':  ['8km E', '10km E', '8km E', '10km E', '8km E', '10km E', '8km E', '6km E'],
    '10k': ['10km E', '12km E', '10km E', '12km E', '10km E', '12km E', '10km E', '8km E'],
    '21k': ['12km E', '14km E', '16km(E+2km@M)', '14km E', '18km(E+3km@M)', '16km(E+4km@M)', '14km(E+3km@M)', '10km E'],
    '42k': ['14km E', '18km E', '22km(E+3km@M)', '26km(E+4km@M)', '30km(E+5km@M)', '32km(E+6km@M)', '22km(E+4km@M)', '12km E'],
  };

  const ip = intervalProgression[distance];
  const tp = tempoProgression[distance];
  const lp = longProgression[distance];

  let prompt = en
    ? `You are a national-level running coach with deep expertise in periodization and exercise physiology.`
    : `你是一位国家级跑步教练，精通运动科学和训练周期化理论。`;

  prompt += en
    ? `\n\nDesign a personalized training plan for this athlete. Do NOT use a fixed weekly template (e.g. Mon easy / Tue hard / Wed strength / Thu easy / Fri easy / Sat rest / Sun long). Instead, the weekly structure should EVOLVE across phases — base phase has fewer hard days, build phase adds a second quality day, peak phase specializes, taper strips volume but keeps neuromuscular sharpness.`
    : `\n\n为这位运动员设计一份个性化的训练计划。禁止使用固定的周模板（如周一轻松/周二强度/周三力量/周四轻松/周五轻松/周六休息/周日长距离）。相反，周结构应该随着周期**进化**——基础期强度课少，建立期增加第二堂强度课，巅峰期专项化，减量期砍掉跑量但保留神经募集。`;

  // ── Athlete info ──
  prompt += en ? `\n\n## Athlete Profile` : `\n\n## 运动员画像`;
  prompt += `\n- ${en ? 'Goal race' : '目标赛事'}: ${raceName}`;
  prompt += `\n- ${en ? 'Target time' : '目标成绩'}: ${formatDuration(targetTimeSeconds)}`;
  prompt += `\n- ${en ? 'Target pace' : '目标配速'}: ${formatPaceSec(targetPace)}/km`;
  prompt += `\n- ${en ? 'Plan duration' : '计划周期'}: ${weeks} ${en ? 'weeks' : '周'}`;
  if (raceDate) {
    prompt += `\n- ${en ? 'Race date' : '比赛日期'}: ${raceDate}`;
  }
  prompt += `\n- 5K PB: ${formatDuration(pb5kSec)}`;
  prompt += `\n  - E: ${formatPaceSec(zones.E.min)}-${formatPaceSec(zones.E.max)}/km`;
  prompt += `\n  - M: ${formatPaceSec(zones.M.min)}-${formatPaceSec(zones.M.max)}/km`;
  prompt += `\n  - T: ${formatPaceSec(zones.T.min)}-${formatPaceSec(zones.T.max)}/km`;
  prompt += `\n  - I: ${formatPaceSec(zones.I.min)}-${formatPaceSec(zones.I.max)}/km`;
  prompt += `\n  - R: ${formatPaceSec(zones.R.min)}-${formatPaceSec(zones.R.max)}/km`;
  prompt += `\n- ${en ? 'Recent weekly volume' : '近4周平均周跑量'}: ${Math.round(weeklyVolume)} km`;
  prompt += `\n- ${en ? 'Goal assessment' : '目标评估'}: ${assessment.profileLabel} (${en ? 'equivalent' : '等效成绩'} ${formatDuration(assessment.equivalentTime)}, ${en ? 'goal is' : '目标比等效成绩'} ${assessment.gapPercent > 0 ? '+' : ''}${assessment.gapPercent}%)`;
  prompt += `\n  → ${assessment.message}`;

  // ── Periodization (concise) ──
  prompt += en
    ? `\n\n## Periodization Rules (MANDATORY)`
    : `\n\n## 周期化规则（必须遵守）`;
  prompt += en
    ? `\n- Base: 1 quality day/week (Tue only). Thu EASY. Sun long = pure E pace. Volume +5-10%/wk.`
    : `\n- 基础期：每周1堂强度课（仅周二）。周四轻松跑。周日长距离纯E配速。跑量每周+5-10%。`;
  prompt += en
    ? `\n- Build: 2 quality days/week (Tue intervals + Thu tempo). Sun long adds M-pace segments in later weeks. Recovery week every 3rd week (vol ~75%).`
    : `\n- 建立期：每周2堂强度课（周二间歇 + 周四阈值）。后半段周日长距离加入M配速段落。每第3周恢复周（跑量~75%）。`;
  prompt += en
    ? `\n- Peak: 2 quality days + Sun long with SIGNIFICANT M blocks. Volume max. Recovery every 3rd week.`
    : `\n- 巅峰期：2堂强度课 + 周日长距离有显著M配速段落。跑量峰值。每第3周恢复周。`;
  prompt += en
    ? `\n- Taper: Vol -30-40%. Tue light speed only. NO long runs in final week.`
    : `\n- 减量期：跑量-30-40%。仅周二轻速度。最后一周取消长距离。`;

  // ── Distance-specific emphasis (concise) ──
  prompt += en ? `\n\n## Race Focus` : `\n\n## 赛事重点`;
  if (distance === '42k') {
    prompt += en
      ? `\nMarathon: Long runs are #1 priority. Include 2-3 runs of 30km+. M-pace blocks in long runs build from 3km to 8-10km.`
      : `\n全马：长距离是最高优先级。安排2-3次30km+。长距离M配速段落从3km逐步增加到8-10km。`;
  } else if (distance === '21k') {
    prompt += en
      ? `\nHalf marathon: Threshold is king. Long runs peak at 18-20km. M-pace blocks in peak-phase long runs.`
      : `\n半马：阈值能力为王。长距离峰值18-20km。巅峰期长距离加入M配速段落。`;
  } else if (distance === '10k') {
    prompt += en
      ? `\n10K: Speed endurance. No marathon long runs. Sun "long" = 10-12km easy. Focus on 800m-1600m intervals + 4-6km tempo.`
      : `\n10K：速度耐力。不需要马拉松式长距离。周日"长距离"=10-12km轻松。重点800m-1600m间歇+4-6km阈值。`;
  } else {
    prompt += en
      ? `\n5K: Raw speed. Sun run = 8-10km easy. Focus on 200m-400m intervals + 2-3km tempo.`
      : `\n5K：速度为主。周日跑=8-10km轻松。重点200m-400m间歇+2-3km阈值。`;
  }

  // ── Output requirements ──
  prompt += en ? `\n\n## Output Rules` : `\n\n## 输出规则`;
  prompt += en
    ? `\n1. Generate ALL ${weeks} weeks in ONE JSON array. Base → Build → Peak → Taper.`
    : `\n1. 生成全部${weeks}周，放在一个JSON数组中。基础期→建立期→巅峰期→减量期。`;
  prompt += en
    ? `\n2. Week structure MUST differ by phase. Thu MUST be tempo in Build/Peak.`
    : `\n2. 周结构必须随周期变化。建立期/巅峰期的周四必须是阈值跑。`;
  prompt += en
    ? `\n3. Recovery weeks every 3rd week in Build/Peak: vol ~75%, shorten quality.`
    : `\n3. 建立期/巅峰期每第3周为恢复周：跑量约75%，缩短强度课。`;
  prompt += en
    ? `\n4. Keep descriptions SHORT: "10km E", "6×800m I 4:00/km", "3×1.5km T 4:25/km", "20km (16E+4M)".`
    : `\n4. description 尽量简短："10km E"、"6×800m I 4:00/km"、"3×1.5km T 4:25/km"、"20km(16E+4M)"。`;
  prompt += en
    ? `\n5. Distances INTEGER km. Return pure JSON array, no markdown, no explanation.`
    : `\n5. 距离整数公里。返回纯JSON数组，不要markdown，不要解释。`;
  prompt += en
    ? `\n6. EVERY week MUST have exactly 7 sessions (day 0=Mon to 6=Sun). NO missing days. ONLY Sat (day 5) can be rest. Max 1 rest day per week.`
    : `\n6. 每周必须有且仅有7个session（day 0=周一 到 6=周日）。不允许缺失任何一天。只有周六（day 5）可以是休息。每周最多1天休息。`;
  prompt += en
    ? `\n7. Mon (day 0) = easy run or long run. Wed (day 2) = strength training (legs & core, ~45min, distance 0).` 
    : `\n7. 周一（day 0）必须是轻松跑或长距离。周三（day 2）必须是力量训练（下肢+核心，约45分钟，distance 0）。`;
  prompt += en
    ? `\n8. EVERY session MUST have a non-empty title (e.g. "Easy", "Intervals", "Tempo", "Long", "Strength"). NEVER leave title blank.`
    : `\n8. 每个session必须有非空的title（如"轻松跑"、"间歇"、"阈值"、"长距离"、"力量"）。title绝对不允许为空。`;
  prompt += en
    ? `\n9. Keep session descriptions under 30 characters. Use "8km E", "6×800m I 4:00/km", "3×1.5km T 4:25/km", "20km(16E+4M)" format.`
    : `\n9. 每个session的description控制在30字以内。使用"8km E"、"6×800m I 4:00/km"、"3×1.5km T 4:25/km"、"20km(16E+4M)"格式。`;
  prompt += en
    ? `\n10. JSON session fields: day (integer 0-6), type (easy/long/tempo/interval/recovery/rest/race), title (string, NEVER empty), description (string), distance (integer km), paceZone (optional: E/M/T/I/R).`
    : `\n10. JSON session字段：day（整数0-6）、type（easy/long/tempo/interval/recovery/rest/race）、title（字符串，绝不为空）、description（字符串）、distance（整数公里）、paceZone（可选：E/M/T/I/R）。`;

  prompt += en
    ? `\n\nJSON format: [{"week":1,"phase":"base","totalDistance":50,"notes":"...","sessions":[...]}, ...]`
    : `\n\nJSON格式：[{"week":1,"phase":"base","totalDistance":50,"notes":"...","sessions":[...]}, ...]`;

  return prompt;
}

/**
 * Generate training plan using algorithmic template (professional grade)
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
  // Goal realism check
  const assessment = assessGoal(distance, targetTimeSeconds, pb5kSec, locale);
  if (!assessment.realistic) {
    const en = (locale || 'zh').startsWith('en');
    throw new Error(
      en
        ? `Goal seems unrealistic. Your 5K PB (${formatDuration(pb5kSec)}) suggests an equivalent ${distance === '42k' ? 'marathon' : distance === '21k' ? 'half marathon' : distance === '10k' ? '10K' : '5K'} time of ~${formatDuration(assessment.equivalentTime)}, but your target is ${formatDuration(targetTimeSeconds)} (${assessment.gapPercent > 0 ? '+' : ''}${assessment.gapPercent}%). Consider adjusting your goal or updating your PB in profile.`
        : `目标不太现实。你的 5K PB（${formatDuration(pb5kSec)}）推算的等效${distance === '42k' ? '全马' : distance === '21k' ? '半马' : distance === '10k' ? '10公里' : '5公里'}成绩约为 ${formatDuration(assessment.equivalentTime)}，但你的目标是 ${formatDuration(targetTimeSeconds)}（${assessment.gapPercent > 0 ? '+' : ''}${assessment.gapPercent}%）。建议调整目标或在跑者档案中更新 PB。`
    );
  }

  console.log('[Plan] 🏃 Generating professional training plan via algorithmic template');
  const plan = generateFallbackTrainingPlan(distance, targetTimeSeconds, weeks, pb5kSec, weeklyVolume, locale);
  if (raceDate) {
    plan.goal.raceDate = raceDate;
  }
  console.log(`[Plan] ✅ Generated ${plan.weeks.length} weeks, total ${plan.weeks.reduce((s, w) => s + w.totalDistance, 0)}km`);
  return plan;
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
        ? `🎉 ${classification.raceType || 'Race'} completed! Pace ${paceStr}/km — fantastic effort out there! You pushed through and got it done. Be proud of this performance.`
        : `🎉 ${classification.raceType || '比赛'}完成！配速${paceStr}/km——太棒了！你坚持了下来并完成了挑战，为这份努力感到骄傲！`,
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

  // Add encouragement based on performance
  const encouragement = (() => {
    if (fallbackComparison?.similarActivitiesInsight?.includes('top 10%') || fallbackComparison?.similarActivitiesInsight?.includes('超过 90%')) {
      return en
        ? " 💪 This was a standout session — excellent execution!"
        : " 💪 这是一次出色的训练——执行得非常棒！";
    }
    if (fallbackComparison?.similarActivitiesInsight?.includes('improving') || fallbackComparison?.similarActivitiesInsight?.includes('进步')) {
      return en
        ? " 📈 Nice progress — you're clearly building fitness!"
        : " 📈 进步明显——你的体能正在稳步提升！";
    }
    return en
      ? " 👍 Solid workout — consistency is key!"
      : " 👍 扎实的训练——坚持就是胜利！";
  })();

  return {
    summary: en
      ? `Completed ${(activity.distance / 1000).toFixed(1)}km workout at ${paceStr}/km, in the ${zoneDesc}.${encouragement}`
      : `本次${(activity.distance / 1000).toFixed(1)}km训练完成，配速${paceStr}/km处于${zoneDesc}。${encouragement}`,
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
