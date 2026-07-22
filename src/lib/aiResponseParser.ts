import { StravaActivity } from '@/types';
import type { AIAnalysis } from './aiTypes';
import { formatPace, type ActivityClassification, type PaceZones, type TrainingProfile } from './trainingAnalysis';
import { buildAccurateComparison } from './aiComparison';
import { buildActivityWeatherContext } from './weather';
import { getPrimaryPersonalRecord } from './activityAchievements';
import { formatSustainedEffortDistance, getKeySustainedEffort } from './activityHighlights';

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

const INTENSITY_RANK: Record<AIAnalysis['intensity'], number> = {
  easy: 0,
  moderate: 1,
  hard: 2,
  extreme: 3,
};

function getFinalIntensity(
  candidate: AIAnalysis['intensity'] | undefined,
  classification: ActivityClassification
): AIAnalysis['intensity'] {
  if (classification.isRace) return 'extreme';
  const parsed = candidate && candidate in INTENSITY_RANK ? candidate : 'moderate';
  if (!classification.loadAdjustment?.applied) return parsed;
  return INTENSITY_RANK[classification.intensity] > INTENSITY_RANK[parsed]
    ? classification.intensity
    : parsed;
}

function getTrainingLoadFact(
  adjustment: ActivityClassification['loadAdjustment'],
  locale: string
): string {
  if (!adjustment || adjustment.current7DayTrainingLoad === null) return '';
  const en = locale.startsWith('en');
  const previous = adjustment.previous7DayTrainingLoad;
  const average = adjustment.averageWeeklyTrainingLoad;
  const change = adjustment.trainingLoadChangePercent;
  const comparison = change !== null
    && previous !== null
    && adjustment.trainingLoadChangeReliable !== false
    ? (en
        ? `${change >= 0 ? '+' : ''}${change}% vs the previous 7 days`
        : `较上一个 7 天${change >= 0 ? '+' : ''}${change}%`)
    : adjustment.trainingLoadRatio !== null
      ? (en
          ? `${adjustment.trainingLoadRatio}x the prior 3-week average`
          : `为前 3 周均值的 ${adjustment.trainingLoadRatio} 倍`)
    : average !== null
      ? (en ? `prior 3-week average ${average}` : `前 3 周均值 ${average} 点`)
      : '';
  return en
    ? `rolling 7-day load ${adjustment.current7DayTrainingLoad} points${comparison ? ` (${comparison})` : ''}`
    : `近 7 天训练负荷 ${adjustment.current7DayTrainingLoad} 点${comparison ? `（${comparison}）` : ''}`;
}

function getLoadAdjustedSummary(
  summary: string,
  activity: StravaActivity,
  classification: ActivityClassification,
  locale: string,
  paceZones?: PaceZones | null
): string {
  const adjustment = classification.loadAdjustment;
  if (!adjustment) return summary;

  const en = locale.startsWith('en');
  const trainingLoadFact = getTrainingLoadFact(adjustment, locale);
  if (!adjustment.applied) {
    const summaryWithRecoveryFloor = adjustment.minimumRecoveryHours > 0
      ? en
        ? summary.replace(
            /(?:allow|recommend)\s+(?:about\s+)?(\d+)\s*h(?:ours?)?\s+(?:of\s+)?recovery/gi,
            (match, hours: string) => Number(hours) < adjustment.minimumRecoveryHours
              ? `allow at least ${adjustment.minimumRecoveryHours}h recovery`
              : match
          )
        : summary.replace(
            /建议恢复(?:约)?\s*(\d+)\s*(?:h|小时)/g,
            (match, hours: string) => Number(hours) < adjustment.minimumRecoveryHours
              ? `建议至少 ${adjustment.minimumRecoveryHours}h 恢复`
              : match
          )
      : summary;
    const summaryWithCompleteEnding = (() => {
      let value = summaryWithRecoveryFloor.trim();
      if (!en) {
        value = value.replace(/((?:配速|均配)[^。！？!?]{0,24}\d+'\d{2})$/, '$1"/km');
      }
      return /[。！？!?.]$/.test(value) ? value : `${value}${en ? '.' : '。'}`;
    })();
    const isHighLoad = adjustment.cumulativeLoadConcern === 'high';
    const alreadySeparatesSession = en
      ? /single-session effort|session itself/i.test(summaryWithCompleteEnding)
      : /本次(?:单次|本身).{0,8}(?:努力|强度|负荷)|单次训练/.test(summaryWithCompleteEnding);
    if (!isHighLoad || !trainingLoadFact || alreadySeparatesSession) return summaryWithCompleteEnding;
    const streakFact = adjustment.consecutiveRunDays > 1
      ? (en
          ? ` after ${adjustment.consecutiveRunDays} consecutive running days`
          : `，且已连续跑步 ${adjustment.consecutiveRunDays} 天`)
      : '';
    const loadConclusion = adjustment.sessionEffortControlled
      ? (en
          ? `The session itself stayed controlled; ${trainingLoadFact}${streakFact}, so cumulative recovery should be more conservative while this remains a controlled easy run.`
          : `本次单次努力保持受控；${trainingLoadFact}${streakFact}，因此累计恢复安排需要更保守，但本次仍按受控轻松跑理解。`)
      : (en
          ? `${trainingLoadFact}${streakFact} is elevated, so cumulative recovery should be more conservative than this session alone suggests.`
          : `${trainingLoadFact}${streakFact}处于偏高状态，因此累计恢复安排应比只看本次训练更保守。`);
    return [summaryWithCompleteEnding, loadConclusion].filter(Boolean).join(en ? ' ' : '');
  }

  const intensityLabel = en
    ? adjustment.adjustedIntensity
    : ({ easy: '轻松', moderate: '适中', hard: '高强度', extreme: '极限' } as const)[adjustment.adjustedIntensity];
  const pace = adjustment.paceSecondsPerKm === null
    ? ''
    : `${formatPace(adjustment.paceSecondsPerKm)}/km`;
  const weatherFact = getWeatherFact(activity, locale);
  const paceFact = adjustment.paceContext === 'upper-easy' && pace
    ? (en ? `${pace} sits on the faster side of the athlete's easy zone` : `${pace}已处于个人 E 区较快一侧`)
    : adjustment.paceContext === 'quality' && pace
      ? (en ? `${pace} is already a quality-zone pace` : `${pace}已进入质量训练配速`)
      : pace;
  const facts = [paceFact, weatherFact].filter(Boolean).join(en ? ', with ' : '，并叠加');
  const lead = en
    ? `${facts || 'The current-session evidence'} makes this session ${intensityLabel}; allow at least ${adjustment.minimumRecoveryHours}h recovery. Rolling load is a separate recovery-context conclusion.`
    : `${facts || '本次数据'}使本次单次强度应按${intensityLabel}解读；建议至少 ${adjustment.minimumRecoveryHours}h 恢复。滚动负荷只作为另一层累计恢复背景。`;

  let cleaned = summary;
  if (en) {
    cleaned = cleaned
      .replace(/\b(?:this (?:was|is) an?\s+)?(?:easy|recovery) run\b/gi, 'this heat-load aerobic run')
      .replace(/\b(?:easy|light) intensity\b/gi, `${intensityLabel} intensity`)
      .replace(/(?:allow|recommend)\s+(?:about\s+)?\d+\s*h(?:ours?)?\s+(?:of\s+)?recovery/gi, `allow at least ${adjustment.minimumRecoveryHours}h recovery`);
  } else {
    cleaned = cleaned
      .replace(/本次(?:训练)?(?:为|是|属于|识别为|判定为)\s*(?:一次)?(?:恢复跑|轻松跑)/g, '本次为高温负荷有氧跑')
      .replace(/这是\s*(?:一次)?(?:恢复跑|轻松跑)/g, '这是一次高温负荷有氧跑')
      .replace(/(?:综合)?强度(?:为|是|判断为)?\s*轻松/g, `综合强度为${intensityLabel}`)
      .replace(/建议恢复(?:约)?\s*\d+\s*(?:h|小时)/g, `建议至少 ${adjustment.minimumRecoveryHours}h 恢复`)
      .replace(/恢复(?:约)?\s*\d+\s*(?:h|小时)/g, `至少 ${adjustment.minimumRecoveryHours}h 恢复`);
  }

  if (cleaned.includes(lead) || /综合负荷应按|internal-load session/i.test(cleaned)) return cleaned;
  const hasPrimaryAchievement = Boolean(
    getPrimaryPersonalRecord(activity) ||
    getKeySustainedEffort(activity, paceZones?.marathon.max)
  );
  return hasPrimaryAchievement
    ? [cleaned, lead].filter(Boolean).join(en ? ' ' : '')
    : [lead, cleaned].filter(Boolean).join(en ? ' ' : '');
}

function getLoadAdjustedWarnings(
  warnings: string[],
  classification: ActivityClassification,
  locale: string
): string[] {
  const adjustment = classification.loadAdjustment;
  if (!adjustment) return warnings;
  const cumulativeOnlyPattern = locale.startsWith('en')
    ? /(?:rolling|weekly|7-day|cumulative) (?:training )?load|running streak|consecutive running days/i
    : /(?:滚动|近期|本周|近\s*7\s*天|累计)(?:训练)?负荷|连续跑步|连续训练/;
  const remainingWarnings = adjustment.sessionEffortControlled && !adjustment.applied
    ? warnings.filter((item) => !cumulativeOnlyPattern.test(item))
    : warnings;
  if (!adjustment.applied) return remainingWarnings;
  const warning = locale.startsWith('en')
    ? `Heat and the current pace/effort raise this session's cost beyond what the external pace-zone label alone suggests.`
    : `高温与本次配速/努力程度共同抬高了单次训练成本，不能只按外部配速区间标签解读。`;
  const dedupedWarnings = remainingWarnings.filter(
    (item) => !/单次训练成本|session's cost beyond what the external pace-zone/i.test(item)
  );
  return [warning, ...dedupedWarnings];
}

function getTrainingLoadContext(
  text: string,
  classification: ActivityClassification,
  locale: string
): string {
  const adjustment = classification.loadAdjustment;
  const loadFact = getTrainingLoadFact(adjustment, locale);
  if (!adjustment || !loadFact) return text;
  const en = locale.startsWith('en');
  const alreadyMentionsLoad = en
    ? /load points|rolling 7-day load/i.test(text)
    : /负荷点|近\s*7\s*天训练负荷/.test(text);
  if (alreadyMentionsLoad) return text;
  const stateLabel = en
    ? adjustment.trainingLoadState
    : ({
        insufficient: '数据不足',
        recover: '恢复期',
        balanced: '平衡',
        building: '增长中',
        high: '负荷偏高',
      } as const)[adjustment.trainingLoadState ?? 'insufficient'];
  const activityFact = adjustment.activityTrainingLoad === null
    ? ''
    : en
      ? `; this activity contributed ${adjustment.activityTrainingLoad} points${adjustment.activityTrainingLoadSharePercent !== null ? ` (${adjustment.activityTrainingLoadSharePercent}%)` : ''}`
      : `；本次贡献 ${adjustment.activityTrainingLoad} 点${adjustment.activityTrainingLoadSharePercent !== null ? `，占 ${adjustment.activityTrainingLoadSharePercent}%` : ''}`;
  const streakFact = adjustment.consecutiveRunDays > 1
    ? (en
        ? `; ${adjustment.consecutiveRunDays} consecutive running days`
        : `；已连续跑步 ${adjustment.consecutiveRunDays} 天`)
    : '';
  const effortFact = adjustment.relativeEffort !== null
    ? (en ? `; Relative Effort ${adjustment.relativeEffort}` : `；Relative Effort ${adjustment.relativeEffort}`)
    : '';
  const interpretation = adjustment.sessionEffortControlled
    ? (en
        ? ' The session itself was controlled; this context affects cumulative recovery, not the session-intensity label.'
        : ' 本次单次努力受控；这些数据影响的是累计恢复安排，不改写本次强度标签。')
    : '';
  const deterministic = en
    ? `${loadFact}; state ${stateLabel}${activityFact}${streakFact}${effortFact}.${interpretation}`
    : `${loadFact}，状态为${stateLabel}${activityFact}${streakFact}${effortFact}。${interpretation}`;
  return [deterministic, text].filter(Boolean).join(en ? ' ' : '');
}

function ensurePrioritySummary(
  summary: string,
  activity: StravaActivity,
  locale: string,
  paceZones?: PaceZones | null
): string {
  const en = locale.startsWith('en');
  const record = getPrimaryPersonalRecord(activity);
  const keySustainedEffort = getKeySustainedEffort(activity, paceZones?.marathon.max);
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
  const effortTime = keySustainedEffort ? formatRecordTime(keySustainedEffort.movingTimeSeconds) : '';
  const effortDistanceLabel = keySustainedEffort
    ? formatSustainedEffortDistance(keySustainedEffort.distanceMeters)
    : '';
  const effortDistancePattern = effortDistanceLabel
    ? new RegExp(`${effortDistanceLabel}(?:\\.0)?\\s*(?:K|k|公里|km)`, 'i')
    : null;
  const effortSplitRange = keySustainedEffort
    ? (keySustainedEffort.startSplit === keySustainedEffort.endSplit
        ? `${keySustainedEffort.startSplit}`
        : `${keySustainedEffort.startSplit}-${keySustainedEffort.endSplit}`)
    : '';
  const effortSplitPattern = effortSplitRange
    ? new RegExp(`(?:第\\s*)?${effortSplitRange.replace('-', '(?:-|–|—|至)')}\\s*(?:公里|km|splits?)?`, 'i')
    : null;
  const effortPace = keySustainedEffort ? formatPace(keySustainedEffort.averagePaceSecondsPerKm) : '';
  const mentionsSustainedEffort = !keySustainedEffort || (
    summary.includes(effortTime) && Boolean(effortDistancePattern?.test(summary))
  );
  const mentionsHeat = en
    ? /(?:heat|hot|humid|humidity|temperature|feels like)/i.test(summary)
    : /(?:高温|热负荷|热应激|闷热|湿度|体感温度|体感\s*\d)/i.test(summary);
  const mentionsHeatEffect = mentionsHeat && (
    en
      ? /(?:pace|heart rate|training stimulus|physiological|recovery|cooling)/i.test(summary)
      : /(?:配速|心率|训练刺激|生理|恢复|散热|降温)/i.test(summary)
  );

  if (
    mentionsRecordDetail &&
    mentionsSustainedEffort &&
    (!hasMeaningfulHeat || mentionsHeatEffect)
  ) return summary;

  const weatherFact = getWeatherFact(activity, locale);
  const prioritySentences: string[] = [];
  if (record && !mentionsRecordDetail && hasMeaningfulHeat && !mentionsHeatEffect) {
    prioritySentences.push(en
      ? `This activity set a ${record.name} personal best of ${formatRecordTime(record.elapsedTimeSeconds)} despite ${weatherFact || 'meaningful heat load'}; that makes the performance especially strong, while the conditions also raise its recovery cost.`
      : `本次在${weatherFact || '明显热负荷'}下刷新 ${record.name} 个人最佳至 ${formatRecordTime(record.elapsedTimeSeconds)}，突破含金量很高，同时高温也抬高了生理与恢复成本。`);
  } else if (record && !mentionsRecordDetail) {
    prioritySentences.push(en
      ? `This activity set a ${record.name} personal best of ${formatRecordTime(record.elapsedTimeSeconds)}, which is the primary outcome of the workout.`
      : `本次刷新 ${record.name} 个人最佳至 ${formatRecordTime(record.elapsedTimeSeconds)}，这是本次训练最重要的结果。`);
  }

  if (keySustainedEffort && !mentionsSustainedEffort) {
    const gain = Math.round(keySustainedEffort.paceGainVsActivitySeconds);
    prioritySentences.push(en
      ? `The standout result was splits ${effortSplitRange}: ${effortDistanceLabel} km in ${effortTime} moving time (${effortPace}/km), ${gain}s/km faster than the full-run average${hasMeaningfulHeat ? ` despite ${weatherFact || 'meaningful heat load'}` : ''}; this sustained block shows strong speed endurance and is the workout's main quality achievement.`
      : `本次最值得肯定的是第${effortSplitRange}公里连续 ${effortDistanceLabel} 公里移动用时 ${effortTime}（${effortPace}/km），比全程均配快 ${gain} 秒/公里${hasMeaningfulHeat ? `，且发生在${weatherFact || '明显热负荷'}下` : ''}；这段持续输出说明中段速度耐力${hasMeaningfulHeat ? '和高温下的质量课执行' : '与质量课执行'}都很出色，是本次训练的核心质量成果。`);
  }

  if (hasMeaningfulHeat && !mentionsHeatEffect && prioritySentences.length === 0) {
    const severity = weather.thermalSeverity === 'heat-stress'
      ? (en ? 'clear heat stress' : '明显热应激')
      : (en ? 'meaningful heat load' : '明显热负荷');
    prioritySentences.push(en
      ? `${weatherFact || 'The conditions'} created ${severity}; interpret pace, heart rate, training stimulus, and recovery cost against that higher physiological load.`
      : `${weatherFact || '当前天气'}构成${severity}；配速、心率、训练刺激和恢复成本都应结合更高的生理负担解读。`);
  }

  const combined = [...prioritySentences, summary].filter(Boolean).join(en ? ' ' : '');
  if (!keySustainedEffort) return combined;

  const sentences = combined.match(/[^。！？!?]+[。！？!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  let keptEffortSentence = false;
  return sentences.filter((sentence) => {
    const mentionsEffortIdentity = sentence.includes(effortTime) ||
      sentence.includes(effortPace) ||
      Boolean(effortSplitPattern?.test(sentence));
    const describesSameEffort = mentionsEffortIdentity && Boolean(effortDistancePattern?.test(sentence));
    if (!describesSameEffort) return true;
    if (keptEffortSentence) return false;
    keptEffortSentence = true;
    return true;
  }).join(en ? ' ' : '');
}

function normalizeUnsupportedQualitySegmentSummary(
  summary: string,
  activity: StravaActivity,
  classification: ActivityClassification,
  locale: string,
  paceZones?: PaceZones | null
): string {
  if (getKeySustainedEffort(activity, paceZones?.marathon.max)) return summary;

  const en = locale.startsWith('en');
  const unsupportedQualityClaim = en
    ? /(?:standout|key|main|core).{0,24}(?:quality|performance) (?:block|segment|achievement)|strong speed endurance/i
    : /(?:最值得肯定|核心亮点|核心质量段|核心质量成果|速度耐力.{0,16}(?:出色|优秀)|质量课执行.{0,16}(?:出色|优秀))/;
  const unsupportedProgressionClaim = classification.workoutType !== 'progression'
    ? (en
        ? /(?:classified|identified|recognized).{0,16}(?:progression run|progressive run)/i
        : /(?:识别|判定|分类|本次训练为|更接近|接近|可能(?:是|为)|属于).{0,16}渐进跑|渐进(?:加速)?结构/)
    : null;
  if (
    !unsupportedQualityClaim.test(summary) &&
    !unsupportedProgressionClaim?.test(summary)
  ) return summary;

  const sentences = summary.match(/[^。！？!?；;]+[。！？!?；;]?/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [summary];
  const retained = sentences.filter((sentence) => (
    !unsupportedQualityClaim.test(sentence) &&
    !unsupportedProgressionClaim?.test(sentence)
  ));
  const distanceKm = Math.round(activity.distance / 100) / 10;
  const pace = activity.distance > 0 && activity.moving_time > 0
    ? formatPace(activity.moving_time / activity.distance * 1000)
    : '';
  const heartRate = activity.average_heartrate
    ? Math.round(activity.average_heartrate)
    : null;
  const weatherFact = getWeatherFact(activity, locale);
  const neutralSummary = en
    ? `This ${distanceKm} km run averaged ${pace || 'an aerobic pace'}${heartRate ? ` at ${heartRate} bpm` : ''}${weatherFact ? ` in ${weatherFact}` : ''}; its value came from the overall aerobic completion and effort control, while the faster splits remained easy-pace variation.`
    : `本次 ${distanceKm} 公里平均配速 ${pace || '以有氧配速完成'}${heartRate ? `、平均心率 ${heartRate} bpm` : ''}${weatherFact ? `，处于${weatherFact}` : ''}；训练价值主要在整体有氧完成与强度控制，分段提速仍属于轻松配速内的节奏变化。`;

  return [neutralSummary, ...retained].filter(Boolean).join(en ? ' ' : '');
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
  if (classification.workoutType === 'workout' && classification.structure.splitPattern === 'mixed') {
    return text
      .replace(/(?:中等置信度的|高置信度的|低置信度的)?渐进跑训练/g, '包含连续质量段的混合训练')
      .replace(/配速构建能力/g, '持续输出能力');
  }

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

function normalizeUnsupportedPhysiologyText(text: string, locale: string): string {
  if (!text) return text;
  const en = locale.startsWith('en');
  const sentences = text.match(/[^。！？!?]+[。！？!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [text];
  const normalized = sentences.map((sentence) => {
    if (en) {
      if (/autonomic nervous system|soft[- ]tissue (?:damage|repair)|sleep debt/i.test(sentence)) {
        return 'Cumulative recovery is elevated, but readiness still needs to be checked against subjective fatigue.';
      }
      if (/\bice|icing\b/i.test(sentence)) {
        return 'Prioritize ordinary rest and mobility, and respond to any actual discomfort rather than assuming tissue damage.';
      }
      if (/cancel (?:all|every).{0,20}(?:quality|hard) session/i.test(sentence)) {
        return 'Make the next day rest or very easy, then decide on the next quality session from actual recovery.';
      }
      return sentence;
    }

    if (/自主神经|软组织(?:损伤|修复滞后)|睡眠债/.test(sentence)) {
      return '累计恢复压力偏高，但恢复状态仍需结合主观疲劳确认。';
    }
    if (/冰敷/.test(sentence)) {
      return '优先安排常规休息和放松，并根据实际不适决定是否进一步处理。';
    }
    if (/取消.{0,12}(?:全部|所有).{0,8}质量课|本周.{0,8}质量课.{0,8}(?:全部取消|取消)/.test(sentence)) {
      return '下一天先休息或极轻松活动，之后再根据实际恢复决定质量课。';
    }
    return sentence;
  });

  return Array.from(new Set(normalized)).join(en ? ' ' : '');
}

function getRecoveryFirstSuggestion(
  classification: ActivityClassification,
  locale: string
): string | null {
  if (classification.loadAdjustment?.cumulativeLoadConcern !== 'high') return null;
  return locale.startsWith('en')
    ? 'Next day: rest or very easy movement; resume a quality session only after subjective fatigue has settled.'
    : '下一天优先休息或极轻松活动；主观疲劳恢复后，再决定是否安排质量课。';
}

function normalizeSuggestionsForRecoveryContext(
  suggestions: string[],
  classification: ActivityClassification,
  locale: string
): string[] {
  const recoveryFirst = getRecoveryFirstSuggestion(classification, locale);
  if (!recoveryFirst) return suggestions;
  return [recoveryFirst];
}

function normalizeFinalTextPolish(text: string, locale: string): string {
  if (!text || locale.startsWith('en')) return text;

  return text
    .replace(/(\d+'\d{2})(?=本次(?:单次|本身)(?:努力|强度|负荷)|单次训练)/g, '$1"/km。')
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
    normalizeUnsupportedPhysiologyText(
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
    ),
    locale
  );
}

export function normalizeAIAnalysisForDisplay(
  analysis: AIAnalysis,
  activity: StravaActivity,
  classification: ActivityClassification,
  locale: string = 'zh',
  paceZones?: PaceZones | null
): AIAnalysis {
  const normalizeForDisplay = (text: string) => normalizeAnalysisText(text, activity, classification, locale);
  const suggestions = normalizeSuggestionsForRecoveryContext(Array.isArray(analysis.suggestions)
    ? analysis.suggestions
        .map((suggestion) => normalizeForDisplay(suggestion))
        .map((suggestion) => normalizeLowIntensitySuggestion(suggestion, activity, classification, locale))
        .map((suggestion) => suggestion ? normalizeWorkoutSpecificText(suggestion, classification, locale) : suggestion)
        .filter((suggestion): suggestion is string => Boolean(suggestion))
    : [], classification, locale);
  const recoveryFirstSuggestion = getRecoveryFirstSuggestion(classification, locale);

  const summary = getLoadAdjustedSummary(
    ensurePrioritySummary(
      normalizeUnsupportedQualitySegmentSummary(
        normalizeForDisplay(analysis.summary || ''),
        activity,
        classification,
        locale,
        paceZones
      ),
      activity,
      locale,
      paceZones
    ),
    activity,
    classification,
    locale,
    paceZones
  );
  const warnings = getLoadAdjustedWarnings(
    Array.isArray(analysis.warnings)
      ? analysis.warnings.map((warning) => normalizeForDisplay(warning))
      : [],
    classification,
    locale
  );

  return {
    ...analysis,
    summary,
    intensity: getFinalIntensity(analysis.intensity, classification),
    recoveryHours: Math.max(analysis.recoveryHours || 0, classification.loadAdjustment?.minimumRecoveryHours ?? 0),
    trainingLoadContext: getTrainingLoadContext(
      normalizeForDisplay(analysis.trainingLoadContext || ''),
      classification,
      locale
    ),
    similarActivitiesInsight: normalizeForDisplay(analysis.similarActivitiesInsight || ''),
    nextWorkoutSuggestion: recoveryFirstSuggestion
      ?? normalizeForDisplay(analysis.nextWorkoutSuggestion || ''),
    suggestions,
    warnings,
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

  const finalIntensity = getFinalIntensity(result.intensity, classification);

  // Override comparison fields with accurate program-generated text
  const { similarStats } = trainingProfile;
  const comparisonOverride = similarStats
    ? buildAccurateComparison(activity, similarStats, locale, classification.workoutType)
    : null;
  const normalizeForDisplay = (text: string) => normalizeAnalysisText(text, activity, classification, locale);
  const normalizedSummary = getLoadAdjustedSummary(
    ensurePrioritySummary(
      normalizeUnsupportedQualitySegmentSummary(
        normalizeForDisplay(result.summary || '训练分析完成'),
        activity,
        classification,
        locale,
        trainingProfile.paceZones
      ),
      activity,
      locale,
      trainingProfile.paceZones
    ),
    activity,
    classification,
    locale,
    trainingProfile.paceZones
  );
  const normalizedTrainingLoadContext = getTrainingLoadContext(
    normalizeForDisplay(result.trainingLoadContext || ''),
    classification,
    locale
  );
  const normalizedNextWorkoutSuggestion = getRecoveryFirstSuggestion(classification, locale) ?? normalizeForDisplay(
    result.nextWorkoutSuggestion || (classification.isRace ? '赛后请充分休息恢复' : ''),
  );
  const normalizedSuggestions = normalizeSuggestionsForRecoveryContext(Array.isArray(result.suggestions)
    ? result.suggestions
        .map((suggestion: string) => normalizeForDisplay(suggestion))
        .map((suggestion: string) => normalizeLowIntensitySuggestion(suggestion, activity, classification, locale))
        .map((suggestion: string | null) => suggestion ? normalizeWorkoutSpecificText(suggestion, classification, locale) : suggestion)
        .filter((suggestion: string | null): suggestion is string => Boolean(suggestion))
    : [], classification, locale);
  const normalizedWarnings = getLoadAdjustedWarnings(
    Array.isArray(result.warnings)
      ? result.warnings.map((warning: string) => normalizeForDisplay(warning))
      : (classification.isRace ? ['这是高强度比赛，需要充分恢复'] : []),
    classification,
    locale
  );
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
    recoveryHours: Math.max(
      result.recoveryHours || (classification.isRace ? 48 : 24),
      classification.loadAdjustment?.minimumRecoveryHours ?? 0
    ),
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
