import { ActivityStream, StravaActivity } from '@/types';
import type { UserPhysique } from './aiTypes';
import {
  ActivityClassification,
  TrainingProfile,
  formatTime,
  formatPace,
  getWorkoutTypeLabel,
} from './trainingAnalysis';
import { buildActivityWeatherContext, getThermalContext, getWeatherSourceLabel } from './weather';

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

function getConfidenceLabel(confidence: 'low' | 'medium' | 'high', en: boolean): string {
  if (en) return confidence;
  return {
    low: '低',
    medium: '中等',
    high: '高',
  }[confidence];
}

function getPaceZoneName(zone: ActivityClassification['paceZone'], en: boolean): string {
  const labels = en
    ? {
        E: 'E (Easy / Recovery)',
        M: 'M (Marathon pace)',
        T: 'T (Threshold)',
        I: 'I (Interval / VO2max)',
        R: 'R (Repetition / Speed)',
        unknown: 'unknown',
      }
    : {
        E: 'E区(轻松/恢复)',
        M: 'M区(马拉松配速)',
        T: 'T区(阈值)',
        I: 'I区(间歇/VO2max)',
        R: 'R区(重复跑/速度)',
        unknown: '未知',
      };
  return labels[zone];
}

function getPaceZonePurpose(zone: ActivityClassification['paceZone'], en: boolean): string {
  const purposes = en
    ? {
        E: 'recovery, aerobic base, and durability',
        M: 'race rhythm and steady aerobic strength',
        T: 'lactate-threshold development',
        I: 'VO2max intervals',
        R: 'speed, mechanics, and neuromuscular sharpness',
        unknown: 'insufficient data for pace-zone judgment',
      }
    : {
        E: '恢复、有氧基础和耐受力建设',
        M: '比赛节奏和稳定有氧力量',
        T: '乳酸阈值提升',
        I: 'VO2max 间歇刺激',
        R: '速度、跑姿和神经肌肉唤醒',
        unknown: '数据不足，无法稳定判断配速区间',
      };
  return purposes[zone];
}

function getZoneRangeText(
  paceZones: TrainingProfile['paceZones'],
  zone: ActivityClassification['paceZone'],
  en: boolean
): string | null {
  const zoneMap = {
    E: paceZones.easy,
    M: paceZones.marathon,
    T: paceZones.threshold,
    I: paceZones.interval,
    R: paceZones.repetition,
    unknown: null,
  };
  const range = zoneMap[zone];
  if (!range || !range.min || !range.max) return null;

  const label = en ? 'estimated range' : '能力估算范围';
  return `${label}: ${formatPace(range.min)}-${formatPace(range.max)}/km`;
}

function getPaceZoneDescription(
  paceZones: TrainingProfile['paceZones'],
  classification: ActivityClassification,
  en: boolean
): string {
  const name = getPaceZoneName(classification.paceZone, en);
  const purpose = getPaceZonePurpose(classification.paceZone, en);
  const range = getZoneRangeText(paceZones, classification.paceZone, en);

  if (range) {
    return en ? `${name} - ${purpose} (${range})` : `${name} - ${purpose}（${range}）`;
  }

  return en ? `${name} - ${purpose}` : `${name} - ${purpose}`;
}

function getWorkoutSpecificGuidance(
  classification: ActivityClassification,
  en: boolean
): string {
  const type = classification.workoutType;
  const lines: string[] = [];

  if (en) {
    if (type === 'interval' || type === 'fartlek') {
      lines.push('For interval/fartlek workouts, average pace is a secondary metric. Focus on fast-rep consistency, recovery contrast, and whether warmup/cooldown explain slow segments.');
      lines.push('Do not criticize recovery laps for being slow. Evaluate whether the hard reps stayed controlled or faded, and recommend recovery for the next session.');
    } else if (type === 'threshold' || type === 'tempo') {
      lines.push('For tempo/threshold workouts, judge whether the effort sat in the correct sustained hard range, not whether it looked like race pace.');
      lines.push('If HR is available, compare it to LTHR zones and watch for controlled drift rather than demanding faster running.');
    } else if (type === 'progression') {
      lines.push('For progression runs, evaluate the pace build: patient opening, smooth acceleration, and whether the final third stayed controlled.');
    } else if (type === 'long-run') {
      lines.push('For long runs, prioritize durability, fueling, hydration, stable effort, and recovery cost over raw speed.');
      lines.push('Do not infer dehydration or physiological self-protection from heart-rate changes alone. Mention hydration as a possibility only when duration, heat, humidity, or subjective evidence supports it.');
      lines.push('Do not turn an ordinary long run into an M-pace workout. Mention marathon-pace inserts only if the data clearly shows this was already a quality long run or the next-session context explicitly calls for it.');
    } else if (type === 'workout') {
      lines.push('Strava marks this as a workout, but the exact subtype is not clear. Evaluate the visible lap, split, pace, and heart-rate structure without inventing interval, tempo, or threshold targets.');
      lines.push('State which quality-session interpretation is most plausible and what evidence is missing. Keep recommendations consistent with the observed load rather than the generic workout label alone.');
    } else if (type === 'easy' || type === 'recovery') {
      lines.push('For easy/recovery runs, success means low stress and relaxed aerobic work. Do not ask the athlete to run faster unless the workout intent was misclassified.');
      lines.push('If HR seems high for an easy run, consider heat, fatigue, sleep, illness, and accumulated load before calling it poor execution.');
      lines.push('A slower-than-average percentile is not a problem by itself for easy/recovery runs. Judge success by low strain and intent match first.');
      lines.push('If the ability model seems off, suggest validating it with a separate steady aerobic run or updated PB/profile data, not by speeding up the current recovery run.');
      lines.push('Do not describe easy/recovery pace as a "target pace" unless the athlete explicitly set a workout target. Use "low-intensity range", "recovery intent", or "relaxed aerobic range" instead.');
    } else if (type === 'hill') {
      lines.push('For hill workouts, pace is terrain-limited. Focus on climb effort, form, power, recovery, and downhill control.');
    } else if (type === 'treadmill') {
      lines.push('For treadmill runs, GPS and elevation are less reliable. Treat pace, HR, duration, and perceived structure as the main evidence.');
    } else if (type === 'mixed' || type === 'unknown') {
      lines.push('Workout intent is uncertain. State the uncertainty clearly, then give the most likely interpretation from the available facts.');
    }
  } else {
    if (type === 'interval' || type === 'fartlek') {
      lines.push('如果是间歇/法特莱克，全程平均配速只是次要指标。重点看快段稳定性、恢复段对比，以及热身/冷身是否解释了慢段。');
      lines.push('不要批评恢复圈太慢。应判断强度段是否均匀、是否后程掉速，并把下次训练建议优先放在恢复上。');
    } else if (type === 'threshold' || type === 'tempo') {
      lines.push('如果是节奏跑/阈值跑，重点判断是否处在可持续的高强度区间，而不是要求它跑成比赛配速。');
      lines.push('如果有心率，必须结合 LTHR 区间看是否可控漂移，不要机械要求更快。');
    } else if (type === 'progression') {
      lines.push('如果是渐进跑，重点评估配速构建：前段是否克制、中段是否平顺加速、最后三分之一是否仍可控。');
    } else if (type === 'long-run') {
      lines.push('如果是长距离，优先评估耐受力、补给补水、努力程度稳定性和恢复成本，不要只看绝对速度。');
      lines.push('不要仅凭心率变化推断脱水或“身体自我保护”。只有时长、温度、湿度或主观证据支持时，才把补水作为可能因素提出。');
      lines.push('不要把普通长距离自动改造成 M 配速质量课。只有数据明确显示这本来就是质量长距离，或下次训练上下文明示需要时，才提马配穿插。');
    } else if (type === 'workout') {
      lines.push('Strava 已将本次标记为“训练”，但具体子类型尚不明确。请依据圈数、分段、配速和心率结构判断，不要凭空编造间歇、节奏或阈值目标。');
      lines.push('说明最可能的质量课解释及当前缺少的证据；建议必须与实际负荷一致，不能只根据“训练”标签下结论。');
    } else if (type === 'easy' || type === 'recovery') {
      lines.push('如果是轻松跑/恢复跑，成功标准是低压力和放松的有氧刺激。除非训练意图识别明显错误，否则不要建议跑更快。');
      lines.push('如果轻松跑心率偏高，先考虑高温、疲劳、睡眠、疾病或累计负荷，再判断是否执行不佳。');
      lines.push('对轻松跑/恢复跑来说，配速排名靠后本身不是问题，优先看负荷是否低、训练意图是否匹配。');
      lines.push('如果怀疑能力模型偏了，应建议用一次单独的稳态有氧跑或更新 PB/档案来校准，而不是要求这次恢复跑主动提速。');
      lines.push('除非用户明确设置了训练目标，否则不要把轻松/恢复跑配速写成“目标配速”或“慢于目标”，应改用“低强度范围”“恢复意图”“放松有氧范围”。');
    } else if (type === 'hill') {
      lines.push('如果是坡跑，配速受地形限制。重点看爬坡努力程度、跑姿、力量输出、恢复和下坡控制。');
    } else if (type === 'treadmill') {
      lines.push('如果是跑步机训练，GPS 和海拔可信度较低。主要依据配速、心率、时长和训练结构。');
    } else if (type === 'mixed' || type === 'unknown') {
      lines.push('训练意图不确定时，请明确说明不确定性，再基于可见事实给出最可能解释。');
    }
  }

  if (lines.length === 0) return '';
  const heading = en ? `\n\n## Workout-Type Coaching Rules` : `\n\n## 训练类型专项规则`;
  return `${heading}${lines.map((line) => `\n- ${line}`).join('')}`;
}

function getDataConfidenceGuidance(
  activity: StravaActivity,
  streams: Record<string, ActivityStream> | null,
  lthr: number | null | undefined,
  en: boolean
): string {
  const facts: string[] = [];
  const cautions: string[] = [];

  if (activity.laps?.length) facts.push(en ? `${activity.laps.length} laps available` : `有 ${activity.laps.length} 圈数据`);
  else cautions.push(en ? 'no lap data' : '无圈数据');

  if (activity.splits_metric?.length) facts.push(en ? `${activity.splits_metric.length} metric splits available` : `有 ${activity.splits_metric.length} 个公里分段`);
  else cautions.push(en ? 'no metric splits' : '无公里分段');

  if (streams && Object.keys(streams).length > 0) facts.push(en ? 'stream data available' : '有 stream 轨迹/运动流数据');
  else cautions.push(en ? 'no stream data' : '无 stream 数据');

  if (activity.has_heartrate && activity.average_heartrate) {
    facts.push(lthr ? (en ? 'heart-rate data with LTHR profile' : '有心率数据且配置了 LTHR') : (en ? 'heart-rate data without LTHR profile' : '有心率数据但未配置 LTHR'));
  } else {
    cautions.push(en ? 'no heart-rate data' : '无心率数据');
  }

  let text = en ? `\n\n## Data Confidence` : `\n\n## 数据置信度`;
  if (facts.length > 0) {
    text += en ? `\n- Available evidence: ${facts.join(', ')}.` : `\n- 可用证据: ${facts.join('，')}。`;
  }
  if (cautions.length > 0) {
    text += en ? `\n- Missing evidence: ${cautions.join(', ')}.` : `\n- 缺失证据: ${cautions.join('，')}。`;
    text += en
      ? `\n- If a conclusion depends on missing evidence, phrase it as a cautious inference rather than a fact.`
      : `\n- 如果某个结论依赖缺失数据，请把它表述为谨慎推断，不要写成确定事实。`;
  }
  return text;
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

  const { estimatedPBs, recentLoad, similarStats, thermalStats, patterns } = trainingProfile;

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

  prompt += en ? `\n\n## Workout Classification` : `\n\n## 训练类型识别`;
  prompt += en
    ? `\n- Primary workout type: ${getWorkoutTypeLabel(classification.workoutType, 'en')} (confidence: ${classification.workoutTypeConfidence})`
    : `\n- 主训练类型: ${getWorkoutTypeLabel(classification.workoutType, locale)}（置信度: ${getConfidenceLabel(classification.workoutTypeConfidence, false)}）`;
  prompt += en
    ? `\n- Workout structure source: ${classification.structure.source}`
    : `\n- 结构识别来源: ${classification.structure.source}`;
  prompt += en
    ? `\n- Pace-zone hint from estimated ability: ${classification.paceZone}`
    : `\n- 基于能力估算的配速区间提示: ${classification.paceZone}`;
  prompt += en
    ? `\n- Pace-zone confidence: ${classification.paceZoneConfidence}`
    : `\n- 配速区间置信度: ${getConfidenceLabel(classification.paceZoneConfidence, false)}`;
  if (!classification.paceZoneExactMatch && classification.paceZoneGapSeconds !== null) {
    prompt += en
      ? `\n- IMPORTANT: Current pace does NOT sit inside the estimated zone. It is only a nearest-zone hint, with a ${classification.paceZoneGapSeconds}s/km gap.`
      : `\n- 重要：本次配速并不真正落在该区间内，这只是最近区间提示，仍有 ${classification.paceZoneGapSeconds} 秒/公里的偏差。`;
  }
  if (classification.paceZoneConfidence === 'low') {
    prompt += en
      ? `\n- IMPORTANT: The current ability model is low-confidence. Treat pace-zone labels as soft hints, not hard truth.`
      : `\n- 重要：当前能力模型置信度较低，请把配速区间标签视为软提示，而不是硬结论。`;
  }
  if (classification.structure.lapCount > 0) {
    prompt += en
      ? `\n- Laps: ${classification.structure.lapCount}, median lap distance ${classification.structure.medianLapDistance ? `${Math.round(classification.structure.medianLapDistance)}m` : 'n/a'}`
      : `\n- 圈数: ${classification.structure.lapCount}，中位圈距${classification.structure.medianLapDistance ? `${Math.round(classification.structure.medianLapDistance)}米` : '未知'}`;
  }
  if (classification.structure.shortRepCount > 0) {
    prompt += en
      ? `\n- Short reps: ${classification.structure.shortRepCount}, faster reps ${classification.structure.fastRepCount}, recovery reps ${classification.structure.recoveryRepCount}`
      : `\n- 短重复段: ${classification.structure.shortRepCount}个，快段${classification.structure.fastRepCount}个，恢复段${classification.structure.recoveryRepCount}个`;
  }
  if (classification.structure.splitPattern !== 'unknown') {
    prompt += en
      ? `\n- Split pattern: ${classification.structure.splitPattern}`
      : `\n- 分段模式: ${classification.structure.splitPattern}`;
  }
  if (classification.structure.hasWarmup || classification.structure.hasCooldown) {
    prompt += en
      ? `\n- Warmup/Cooldown detected: ${classification.structure.hasWarmup ? 'warmup ' : ''}${classification.structure.hasCooldown ? 'cooldown' : ''}`.trim()
      : `\n- 检测到热身/冷身: ${classification.structure.hasWarmup ? '热身' : ''}${classification.structure.hasCooldown ? ' 冷身' : ''}`.trim();
  }
  classification.workoutTypeEvidence.forEach((evidence) => {
    prompt += en ? `\n- Evidence: ${evidence}` : `\n- 识别依据: ${evidence}`;
  });
  prompt += en
    ? `\n- IMPORTANT: Treat this supplied workout-type classification as the primary anchor. Do NOT override it based only on average pace unless the rest of the evidence clearly contradicts it.`
    : `\n- 重要：优先使用这里给出的训练类型识别结果，不要仅凭平均配速推翻它，除非其余证据明显矛盾。`;

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
        ? `\n- Use physique only as light context for load tolerance and injury risk. Do NOT derive BMI-based performance claims or gram-level nutrition prescriptions unless this is a long run, hard session, race, or there is explicit fueling evidence.`
        : `\n- 身体数据只作为负荷耐受和伤病风险的轻量背景。除非这是长距离、高强度、比赛，或有明确补给问题证据，否则不要根据 BMI 推导表现结论，也不要给出精确到克数的营养处方。`;
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

  const zoneDesc = getPaceZoneDescription(trainingProfile.paceZones, classification, en);
  const paceMin = paceSecKm / 60;

  prompt += en ? `\n\n## Pace Zone Reference` : `\n\n## 配速区间参考`;
  prompt += en
    ? `\nCurrent pace ${paceStr}/km ≈ ${paceMin.toFixed(1)} min/km`
    : `\n本次配速 ${paceStr}/km 约等于 ${paceMin.toFixed(1)} min/km`;
  prompt += en
    ? `\nAbility-based zone from the athlete profile: ${zoneDesc}`
    : `\n基于当前能力模型对应区间: ${zoneDesc}`;
  prompt += en
    ? `\n- Do NOT use generic absolute pace cutoffs for zone judgment; use the supplied ability-based zone and workout classification.`
    : `\n- 判断配速区间时禁止使用通用绝对配速阈值，请以这里的能力模型区间和训练类型识别为准。`;
  if (!classification.paceZoneExactMatch && classification.paceZoneGapSeconds !== null) {
    prompt += en
      ? `\n- Because the pace missed the estimated zone by ${classification.paceZoneGapSeconds}s/km, do not call it “inside the zone”. Use “near”, “slower than”, or “faster than” instead.`
      : `\n- 由于本次配速与该区间仍有 ${classification.paceZoneGapSeconds} 秒/公里的偏差，禁止表述为“落在该区间”，应改写为“接近”“偏慢”或“偏快”。`;
  }

  prompt += getWorkoutSpecificGuidance(classification, en);
  prompt += getDataConfidenceGuidance(activity, streams, lthr, en);
  if (classification.workoutTypeConfidence === 'low') {
    prompt += en
      ? `\n- Because workout-type confidence is low, explicitly say this is a best-effort interpretation rather than a definitive judgment.`
      : `\n- 由于训练类型识别置信度较低，请明确写出这只是当前证据下的最佳判断，而不是确定结论。`;
  }

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

  const workoutTypeCounts = Object.entries(patterns.workoutTypeCounts || {})
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5);

  if (workoutTypeCounts.length > 0) {
    prompt += en ? `\n\n## Recent Confirmed Workout Mix` : `\n\n## 近期较确定的训练结构`;
    workoutTypeCounts.forEach(([type, count]) => {
      prompt += en
        ? `\n- ${getWorkoutTypeLabel(type as ActivityClassification['workoutType'], 'en')}: ${count}`
        : `\n- ${getWorkoutTypeLabel(type as ActivityClassification['workoutType'], locale)}: ${count}`;
    });
    prompt += en
      ? `\n- These counts exclude low-confidence classifications. Use them as structure hints, not exact truth.`
      : `\n- 以上计数已排除低置信度分类，请把它理解为训练结构提示，而不是绝对精确的事实。`;
  }

  // Weather conditions
  const weatherInfo = buildActivityWeatherContext(activity, streams);
  if (weatherInfo.hasWeather) {
    const thermalContext = getThermalContext(weatherInfo, locale);
    prompt += en ? `\n\n## Weather Conditions` : `\n\n## 天气条件`;
    if (weatherInfo.condition) {
      prompt += en ? `\n- Condition: ${weatherInfo.condition}` : `\n- 天气: ${weatherInfo.condition}`;
    }
    if (weatherInfo.temperatureC !== undefined) {
      prompt += en ? `\n- Temperature: ${weatherInfo.temperatureC}°C` : `\n- 气温: ${weatherInfo.temperatureC}°C`;
    }
    if (weatherInfo.feelsLikeC !== undefined) {
      prompt += en ? `\n- Feels like: ${weatherInfo.feelsLikeC}°C` : `\n- 体感温度: ${weatherInfo.feelsLikeC}°C`;
    }
    if (weatherInfo.humidityPercent !== undefined) {
      prompt += en ? `\n- Humidity: ${weatherInfo.humidityPercent}%` : `\n- 湿度: ${weatherInfo.humidityPercent}%`;
    }
    if (weatherInfo.windSpeedKmh !== undefined) {
      prompt += en ? `\n- Wind: ${weatherInfo.windSpeedKmh} km/h` : `\n- 风速: ${weatherInfo.windSpeedKmh} km/h`;
    }
    prompt += en ? `\n- Thermal context: ${thermalContext.label}` : `\n- 热环境判断: ${thermalContext.label}`;
    prompt += en
      ? `\n- Weather source: ${getWeatherSourceLabel(weatherInfo, locale)}`
      : `\n- 天气来源: ${getWeatherSourceLabel(weatherInfo, locale)}`;
    prompt += en
      ? `\n\n${thermalContext.guidance}`
      : `\n\n${thermalContext.guidance}`;
  }

  if (thermalStats) {
    const paceDelta = Math.abs(thermalStats.paceDifferenceSeconds);
    const paceComparison = thermalStats.paceDifferenceSeconds > 0
      ? (en ? `${paceDelta}s/km slower` : `慢 ${paceDelta} 秒/公里`)
      : thermalStats.paceDifferenceSeconds < 0
        ? (en ? `${paceDelta}s/km faster` : `快 ${paceDelta} 秒/公里`)
        : (en ? 'the same pace' : '配速持平');
    const heartRateComparison = thermalStats.heartRateDifference === null
      ? null
      : thermalStats.heartRateDifference > 0
        ? (en ? `${thermalStats.heartRateDifference} bpm higher` : `高 ${thermalStats.heartRateDifference} bpm`)
        : thermalStats.heartRateDifference < 0
          ? (en ? `${Math.abs(thermalStats.heartRateDifference)} bpm lower` : `低 ${Math.abs(thermalStats.heartRateDifference)} bpm`)
          : (en ? 'the same heart rate' : '心率持平');

    prompt += en ? `\n\n## Personal Same-Temperature Baseline` : `\n\n## 个人同温训练基线`;
    prompt += en
      ? `\n- ${thermalStats.count} comparable workouts around ${thermalStats.averageTemperature}°C (confidence ${thermalStats.sampleConfidence})`
      : `\n- ${thermalStats.count} 次相近训练，平均温度 ${thermalStats.averageTemperature}°C（置信度${getConfidenceLabel(thermalStats.sampleConfidence, false)}）`;
    prompt += en
      ? `\n- Same-temperature average pace: ${formatPace(thermalStats.averagePaceSeconds)}/km; this workout is ${paceComparison}`
      : `\n- 同温历史平均配速: ${formatPace(thermalStats.averagePaceSeconds)}/km；本次${paceComparison}`;
    if (thermalStats.averageHeartRate !== null && heartRateComparison) {
      prompt += en
        ? `\n- Same-temperature average HR: ${thermalStats.averageHeartRate} bpm; this workout is ${heartRateComparison}`
        : `\n- 同温历史平均心率: ${thermalStats.averageHeartRate} bpm；本次${heartRateComparison}`;
    }
    prompt += en
      ? `\n- IMPORTANT: Use this athlete-specific same-temperature baseline before all-weather pace comparisons. If pace and HR are close to this baseline, treat the result as normal heat-adjusted performance rather than fitness decline. With low confidence, describe it only as directional context.`
      : `\n- 重要：判断夏季表现时，应优先使用这组个人同温基线，再参考跨季节配速。如果本次配速和心率接近同温基线，应视为高温下的正常表现，不要写成能力下降。低置信度样本只能作为方向提示。`;
  }

  // Similar activities comparison
  const distanceLabel = getDistanceLabel(activity.distance, en);
  if (similarStats) {
    prompt += en
      ? `\n\nComparable Workouts Comparison (${similarStats.count} ${distanceLabel} workouts, ${similarStats.comparisonMode === 'strict' ? 'strict same-type match' : 'distance-matched fallback'}, confidence ${similarStats.sampleConfidence}):`
      : `\n\n同类训练对比（${similarStats.count}次${distanceLabel}，${similarStats.comparisonMode === 'strict' ? '严格同类型匹配' : '仅距离相近兜底样本'}，置信度${getConfidenceLabel(similarStats.sampleConfidence, false)}）:`;
    prompt += en
      ? `\n- Historical avg pace: ${formatPace(similarStats.avgPace * 60)}/km`
      : `\n- 历史平均配速: ${formatPace(similarStats.avgPace * 60)}/km`;
    prompt += en
      ? `\n- Fastest comparable pace: ${formatPace(similarStats.bestPace * 60)}/km`
      : `\n- 同类训练最快配速: ${formatPace(similarStats.bestPace * 60)}/km`;
    prompt += en
      ? `\n- This workout: faster than ${similarStats.yourPaceRank}% of comparable ${distanceLabel} workouts`
      : `\n- 本次表现: 超过${similarStats.yourPaceRank}%的同类${distanceLabel}训练`;
    if (similarStats.comparisonMode === 'strict') {
      prompt += en
        ? `\n- Strict same-type matches available: ${similarStats.strictCount}`
        : `\n- 严格同类型样本数: ${similarStats.strictCount}`;
    }
    prompt += en
      ? `\n- Recent 5 comparable avg pace: ${formatPace(similarStats.recentAvgPace * 60)}/km`
      : `\n- 最近5次同类平均配速: ${formatPace(similarStats.recentAvgPace * 60)}/km`;
    prompt += en
      ? `\n- Next 5 older comparable avg pace: ${formatPace(similarStats.olderAvgPace * 60)}/km`
      : `\n- 再早5次同类平均配速: ${formatPace(similarStats.olderAvgPace * 60)}/km`;
    if (similarStats.count < 5) {
      prompt += en
        ? `\n- Sample size is small. Avoid strong trend claims from this comparison.`
        : `\n- 可比样本较少，请避免基于这组对比下过强结论。`;
    }
    if (similarStats.comparisonMode === 'fallback' || similarStats.sampleConfidence === 'low') {
      prompt += en
        ? `\n- IMPORTANT: This comparison is weak. Do NOT write phrases like "very high share", "best ever", "top 1%" or other strong claims from it.`
        : `\n- 重要：这组对比证据较弱。禁止据此写出“占比极高”“历史最佳”“前1%”这类强结论。`;
    }
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
      ? `\n2a. Respect the supplied workout type. If it is interval/fartlek, analyze rep quality, recovery contrast, and execution consistency instead of judging the whole run by average pace. If it is progression, focus on pacing build. If it is recovery/easy but heart rate looks high, discuss heat/fatigue possibilities before calling it underperformance. If it is the generic Workout type, infer a subtype only when laps/splits/pace/HR provide evidence. If confidence is low, explicitly acknowledge uncertainty.`
      : `\n2a. 请尊重上面给出的训练类型。如果是间歇/法特莱克，要重点分析重复段质量、恢复段对比和执行一致性，不要只拿全程平均配速下结论。如果是渐进跑，重点看配速构建。如果是恢复跑/轻松跑但心率偏高，先讨论高温或疲劳可能，再决定是否表现不佳。如果只是泛化“训练”类型，只有圈数、分段、配速或心率提供证据时才能继续推断子类型。如果识别置信度低，要明确说明不确定性。`;
    prompt += en
      ? `\n2b. For progression or warmup/cooldown structures, a slower final segment after a fast segment is usually cooldown or a deliberate structure change. Do NOT write overconfident phrases like "monitoring failure", "poor execution", or "insufficient reserves" solely because pace and heart rate dropped together.`
      : `\n2b. 对渐进跑或热身/冷身结构，快段之后的末段降速通常是主动冷身或结构调整。不要仅因为配速和心率同时下降，就写出“监控不足”“执行失败”“体能储备不足”等过度笃定结论。`;
    prompt += en
      ? `\n3. Load assessment: Judge based on (a) this workout's intensity and distance ratio to current week volume, (b) week-over-week change. If current week volume jumped >15% vs last week, FLAG it as "volume increase too fast, injury risk". If the workout itself is hard (T/I/R zone) and >15% of weekly volume, FLAG it as "high single-session load". Do NOT mechanically say "volume is too low" when weekly volume is actually rising.`
      : `\n3. 负荷评估: 基于以下两点判断：(a)本次训练强度及占本周跑量比例，(b)本周 vs 上周跑量环比变化。如果本周跑量环比上周增长>15%，必须标记为"跑量增加过快，注意受伤风险"。如果单次高强度训练（T/I/R区）占本周跑量>15%，标记为"单次负荷较大"。不要在周跑量实际处于上升期时机械地说"跑量偏低"。`;
    if (similarStats) {
      prompt += en
        ? `\n4. Comparable workout comparison (${similarStats.count} ${distanceLabel}, ${similarStats.comparisonMode === 'strict' ? 'strict same-type' : 'distance-matched fallback'}, confidence ${similarStats.sampleConfidence}): this pace ${paceStr}/km vs historical avg ${formatPace(similarStats.avgPace * 60)}/km and fastest comparable ${formatPace(similarStats.bestPace * 60)}/km. You outpaced ${similarStats.yourPaceRank}% of them.`
        : `\n4. 同类训练对比（${similarStats.count}次${distanceLabel}，${similarStats.comparisonMode === 'strict' ? '严格同类型' : '仅距离相近兜底'}，置信度${getConfidenceLabel(similarStats.sampleConfidence, false)}）：本次配速${paceStr}/km，历史平均${formatPace(similarStats.avgPace * 60)}/km，同类最快${formatPace(similarStats.bestPace * 60)}/km。超过${similarStats.yourPaceRank}%的同类训练。`;
    } else {
      prompt += en ? `\n4. Comparable workout comparison: no comparable historical data yet.` : `\n4. 同类训练对比: 暂无可比历史数据。`;
    }
    prompt += en
      ? `\n5. Next workout suggestion: CRITICAL RULE — If this workout intensity is "hard"/"extreme" OR pace zone is T/I/R, the next session MUST be an easy recovery run (E zone, 5-8km, 30-60s/km slower than marathon pace), with the goal of active recovery. NO intensity workouts (tempo, interval, or repetition) should be suggested after a hard session. Only if this was an easy/moderate aerobic run, you may suggest a specific quality session from the three-components perspective.`
      : `\n5. 下次训练建议: 关键规则 — 如果本次强度为"hard"/"extreme"或配速区间落在T/I/R，下次训练必须是轻松恢复跑（E区，5-8km，比马拉松配速慢30-60秒/km），目的是促进恢复。严禁在高强度训练后建议乳酸阈值跑、间歇跑或重复跑。只有本次是有氧轻松跑时，才可以从三要素角度建议具体质量课。`;

    if (classification.workoutType === 'easy' || classification.workoutType === 'recovery') {
      prompt += en
        ? `\n5a. Easy/recovery suggestions must stay focused on effort control, freshness checks, and readiness for the next session. Avoid target-pace chasing, BMI-based nutrition prescriptions, and gram-level carb/protein advice for short low-intensity runs.`
        : `\n5a. 轻松/恢复跑的建议必须聚焦在强度控制、疲劳观察和下一次训练准备。短时间低强度训练不要追“目标配速”，不要根据 BMI 写营养处方，也不要给出精确到克数的碳水/蛋白建议。`;
    }

    prompt += en
      ? `\n5b. Hydration/dehydration rule: do NOT diagnose dehydration or "body protection" from heart-rate changes alone. If the run is under 90 minutes or there is no clear heat-stress evidence, keep hydration advice qualitative instead of giving exact electrolyte/fluid volumes.`
      : `\n5b. 补水/脱水规则：不要仅凭心率变化诊断脱水或“身体自我保护”。如果训练少于90分钟，或没有明确热应激证据，补水建议保持定性，不要给出精确电解质/饮水量。`;

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
      prompt += en
        ? `\n- Exact fluid/electrolyte amounts are optional, not mandatory. If weather is only muggy rather than heat-stress, phrase hydration as a practical check instead of a dehydration diagnosis.`
        : `\n- 精确饮水/电解质量不是必须项。如果天气只是闷湿而非热应激，应把补水写成执行检查，而不是脱水诊断。`;
      prompt += en
        ? `\n- For ordinary long runs, do NOT recommend M-pace finishes or M-pace inserts as the default next step. If you mention them, explicitly frame them as a separate quality long run with recovery planned around it.`
        : `\n- 对普通长距离，不要默认建议 M 配速结尾或 M 配速穿插。如果提到它，必须明确这是单独的质量长距离安排，并需要配套恢复。`;
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
      ? `\n{\n  "summary": "Race performance analysis in 2-3 complete sentences: result, pacing execution, and recovery priority.",`
      : `\n{\n  "summary": "用2-3个完整句子总结比赛：结果、配速执行、恢复重点。",`;
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
      ? `\n{\n  "summary": "A concise but complete coach summary (35-70 words, 2-3 complete sentences). Cover: workout type with confidence, execution quality using one key data point, and the main recovery/load implication. Do NOT duplicate detailed suggestions or simply list numbers.",`
      : `\n{\n  "summary": "简要但完整的教练总结（60-120字，2-3个完整句子）。包含：训练类型与置信度、结合一个关键数据点说明执行质量、主要恢复/负荷含义。不要重复详细建议，也不要简单罗列数字。",`;
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
  prompt += `\n    "zone": "E|M|T|I|R",`;
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
    ? `\n- Separate hard facts from inference. For example: lap structure, split pattern, weather, and heart-rate zones are facts; workout intent is an inference that should match the supplied classification confidence.`
    : `\n- 请区分数据事实与推断。圈结构、分段模式、天气、心率区间属于事实；训练意图属于推断，且应与上面提供的训练类型置信度保持一致。`;
  prompt += en
    ? `\n- Unless the activity data explicitly contains a planned workout target, say "reference pace" or "estimated zone" instead of "target pace".`
    : `\n- 除非活动数据明确包含计划训练目标，否则不要写“目标配速”，应写“参考配速”或“能力估算区间”。`;
  prompt += en
    ? `\n- If confidence is low or evidence is missing, you MUST say so directly in the summary instead of writing overconfident prose.`
    : `\n- 如果识别置信度较低或关键证据缺失，必须在 summary 中直接说明，不要用很笃定的口吻掩盖不确定性。`;
  prompt += en
    ? `\n- If you mention confidence in Chinese output, localize it naturally as 高/中等/低 confidence instead of copying raw labels like medium or low.`
    : `\n- 如果在中文输出里提到置信度，必须写成“高/中等/低置信度”，不要直接照抄 medium / low 这类内部标签。`;
  prompt += en
    ? `\n- In "suggestions", do NOT mechanically recommend "increase weekly volume to X km". Instead, focus on: (1) if weekly volume spiked, warn about injury risk and recommend rest; (2) if this was a hard session, recommend recovery; (3) give 1-2 specific, actionable technique or pacing tips relevant to THIS workout.`
    : `\n- "suggestions" 中不要机械建议"把周跑量提升到XXkm"。应聚焦：(1)如果本周跑量环比大增，提醒受伤风险并建议休息；(2)如果本次是高强度训练，建议恢复；(3)给出1-2条与本次训练直接相关的技术或配速建议。`;
  if (classification.workoutType === 'easy' || classification.workoutType === 'recovery') {
    prompt += en
      ? `\n- For easy/recovery runs, avoid "target pace" language. If pace is slower than recent runs, frame it as relaxed execution unless HR/load evidence says otherwise.`
      : `\n- 对轻松/恢复跑，避免使用“目标配速”话术。如果配速比近期慢，除非心率或负荷证据显示异常，否则应表述为更放松的执行。`;
  }
  prompt += en
    ? `\n- Each field must be substantive. Keep summary concise (2-3 complete sentences), and keep trainingLoadContext/similarActivitiesInsight/nextWorkoutSuggestion at least 20 words. Empty, cut-off, or one-clause responses are NOT acceptable.`
    : `\n- 每个字段必须有实质内容。summary 保持简洁（2-3个完整句子），trainingLoadContext/similarActivitiesInsight/nextWorkoutSuggestion 至少20字。空值、截断句或半句话式敷衍 unacceptable。`;
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
