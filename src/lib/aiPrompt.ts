import { ActivityStream, StravaActivity } from '@/types';
import type { UserPhysique } from './aiTypes';
import {
  ActivityClassification,
  TrainingProfile,
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

/**
 * Build professional coaching prompt using training profile.
 */
export function buildProfessionalPrompt(
  activity: StravaActivity,
  streams: Record<string, ActivityStream> | null,
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

  const { estimatedPBs, recentLoad, similarStats } = trainingProfile;

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
