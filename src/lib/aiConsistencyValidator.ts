import type { AIAnalysis } from './aiTypes';
import type { StravaActivity } from '@/types';
import type { ActivityClassification, PaceZones } from './trainingAnalysis';
import type { StreamAnalysis } from './streamAnalysis';
import { getPrimaryPersonalRecord } from './activityAchievements';
import {
  getKeySustainedEffort,
  getLongRunAssessment,
  type LongRunAssessment,
} from './activityHighlights';
import { formatRaceExecutionSummary, getRaceExecutionAssessment } from './raceExecution';

export type AIConsistencyRule =
  | 'intensity-floor'
  | 'recovery-floor'
  | 'execution-quality'
  | 'heart-rate-trend'
  | 'load-cost'
  | 'next-workout-recovery'
  | 'race-priority'
  | 'long-run-priority';

export interface AIConsistencyResult {
  analysis: AIAnalysis;
  correctedRules: AIConsistencyRule[];
}

interface AIConsistencyContext {
  classification: ActivityClassification;
  locale: string;
  activity?: StravaActivity;
  paceZones?: PaceZones | null;
  streamAnalysis?: StreamAnalysis | null;
}

const INTENSITY_RANK: Record<AIAnalysis['intensity'], number> = {
  easy: 0,
  moderate: 1,
  hard: 2,
  extreme: 3,
};

function getFinalIntensity(
  candidate: AIAnalysis['intensity'] | undefined,
  classification: ActivityClassification,
  activity?: StravaActivity
): AIAnalysis['intensity'] {
  if (classification.isRace) return 'extreme';
  const parsed = candidate && candidate in INTENSITY_RANK ? candidate : 'moderate';
  const minimum = activity && activity.distance >= 20_000
    ? 'moderate'
    : classification.loadAdjustment?.applied ? classification.intensity : 'easy';
  return INTENSITY_RANK[minimum] > INTENSITY_RANK[parsed] ? minimum : parsed;
}

function formatBlockPace(secondsPerKm: number): string {
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}'${String(rounded % 60).padStart(2, '0')}\"`;
}

function formatKm(value: number): string {
  return Math.abs(value - Math.round(value)) < 0.05
    ? String(Math.round(value))
    : value.toFixed(1);
}

function formatLongRunStructure(
  assessment: LongRunAssessment,
  locale: string
): string {
  const en = locale.startsWith('en');
  const phaseText = assessment.phases.map((phase) =>
    `${formatKm(phase.startKm)}–${formatKm(phase.endKm)} km ${formatBlockPace(phase.averagePaceSecondsPerKm)}/km${phase.averageHeartRate !== undefined ? `${en ? ', ' : '、'}${Math.round(phase.averageHeartRate)} bpm` : ''}`
  ).join(en ? '; ' : '；');
  if (assessment.analysisMethod === 'adaptive-phases' && phaseText) {
    return en
      ? `Sustained pace changes identify these phases: ${phaseText}`
      : `根据持续配速变化自动识别出这些阶段：${phaseText}`;
  }
  if (assessment.analysisMethod === 'whole-run' && assessment.averagePaceSecondsPerKm !== undefined) {
    const spread = Math.round(assessment.paceSpreadSecondsPerKm ?? 0);
    return en
      ? `No clear phase change was detected; whole-run pace averaged ${formatBlockPace(assessment.averagePaceSecondsPerKm)}/km with about ${spread}s/km of typical variation`
      : `全程没有检测到明确的配速阶段变化，均配 ${formatBlockPace(assessment.averagePaceSecondsPerKm)}/km，主体公里配速波动约 ${spread} 秒`;
  }
  if (
    assessment.analysisMethod === 'early-late'
    && assessment.comparisonWindowKm !== undefined
    && assessment.earlyPaceSecondsPerKm !== undefined
    && assessment.latePaceSecondsPerKm !== undefined
  ) {
    const window = formatKm(assessment.comparisonWindowKm);
    return en
      ? `No reliable breakpoint was forced; the opening ${window} km averaged ${formatBlockPace(assessment.earlyPaceSecondsPerKm)}/km and the closing ${window} km averaged ${formatBlockPace(assessment.latePaceSecondsPerKm)}/km`
      : `没有强行切出固定阶段；开头约 ${window} 公里均配 ${formatBlockPace(assessment.earlyPaceSecondsPerKm)}/km，末尾约 ${window} 公里均配 ${formatBlockPace(assessment.latePaceSecondsPerKm)}/km`;
  }
  return en
    ? 'Kilometer splits do not have enough continuous coverage to verify the pacing structure'
    : '逐公里分段的覆盖或连续性不足，暂不强行判断配速结构';
}

function getLongRunFact(
  activity: StravaActivity | undefined,
  classification: ActivityClassification,
  locale: string
): string {
  if (!activity || classification.isRace || activity.distance < 20_000) return '';
  const en = locale.startsWith('en');
  const assessment = getLongRunAssessment(activity);
  if (!assessment) return '';
  const { pattern, paceChangeSecondsPerKm, heartRateChange } = assessment;
  const distance = (activity.distance / 1000).toFixed(1);
  const structure = formatLongRunStructure(assessment, locale);
  const paceDelta = paceChangeSecondsPerKm !== undefined ? Math.abs(Math.round(paceChangeSecondsPerKm)) : null;
  const hrDelta = heartRateChange !== undefined ? Math.round(heartRateChange) : null;
  const trend = en
    ? ({
        'negative-split': `the later section was ${paceDelta}s/km faster, a well-executed negative split`,
        steady: 'pace stayed broadly steady across the full distance',
        'intentional-slowdown': `the later section was ${paceDelta}s/km slower while HR fell ${Math.abs(hrDelta ?? 0)} bpm, which is consistent with an intentional slowdown`,
        'fatigue-fade': `the later section was ${paceDelta}s/km slower without a matching HR drop, indicating a fatigue fade`,
        'slowing-unclear': `the later section was ${paceDelta}s/km slower, but the available HR data cannot distinguish an intentional slowdown from fatigue`,
        mixed: 'the pacing was variable without one clear direction',
        unknown: 'the pacing pattern is not verifiable',
      } as const)[pattern]
    : ({
        'negative-split': `后程比前段快 ${paceDelta} 秒/公里，属于完成出色的前慢后快`,
        steady: '全程配速基本均匀',
        'intentional-slowdown': `后程比前段慢 ${paceDelta} 秒/公里，同时心率下降 ${Math.abs(hrDelta ?? 0)} bpm，更符合主动降速`,
        'fatigue-fade': `后程比前段慢 ${paceDelta} 秒/公里，心率却没有相应下降，呈现疲劳性掉速`,
        'slowing-unclear': `后程比前段慢 ${paceDelta} 秒/公里，但现有心率数据不足以区分主动降速与疲劳掉速`,
        mixed: '全程配速有起伏，未形成单一趋势',
        unknown: '暂无法核验配速趋势',
      } as const)[pattern];
  const heartRate = activity.average_heartrate
    ? (en ? `average HR ${Math.round(activity.average_heartrate)} bpm` : `全程平均心率 ${Math.round(activity.average_heartrate)} bpm`)
    : (en ? 'HR data unavailable' : '缺少全程心率数据');
  const tier = assessment.tier === 'very-long-run'
    ? (en ? 'very long run' : '超长距离训练')
    : (en ? 'long run' : '长距离训练');
  const trendClause = pattern === 'unknown' ? '' : (en ? `; ${trend}` : `；${trend}`);
  return en
    ? `This ${distance} km ${tier} carries high total volume even if the pace was easy. ${structure}${trendClause}. Judge load using distance, pace and ${heartRate}.`
    : `本次 ${distance} 公里属于高总量负荷的${tier}，即使配速处于轻松区，也不能把整堂课评价为轻松。${structure}${trendClause}。总负荷需结合距离、配速，并参考${heartRate}来判断。`;
}

function prioritizeLongRunSummary(
  summary: string,
  activity: StravaActivity | undefined,
  classification: ActivityClassification,
  locale: string
): string {
  const fact = getLongRunFact(activity, classification, locale);
  if (!fact) return summary;
  const cleaned = locale.startsWith('en')
    ? summary.replace(/(?:this|the) (?:entire |overall )?(?:run|session) (?:was|is|remained) (?:an? )?(?:easy|low-intensity) (?:run|session)[.!]?/gi, '')
    : summary.replace(/(?:整体|本次(?:训练)?)(?:仍|是|为|属于|判定为)?(?:一次|一堂)?(?:轻松跑|低强度有氧训练|轻松训练)[。！？]?/g, '');
  if (cleaned.includes(fact)) return cleaned;
  const record = activity && getPrimaryPersonalRecord(activity);
  if (record && /^(?:本次|This activity).{0,100}(?:PB|个人最佳|personal best)/i.test(cleaned)) {
    const end = cleaned.search(/[。！？.!?]/);
    if (end >= 0) return `${cleaned.slice(0, end + 1)} ${fact} ${cleaned.slice(end + 1).trim()}`.trim();
  }
  return `${fact} ${cleaned.trim()}`.trim();
}

function getLongRunExecution(
  activity: StravaActivity | undefined,
  classification: ActivityClassification,
  locale: string
): string | null {
  if (!activity || classification.isRace || activity.distance < 20_000) return null;
  const assessment = getLongRunAssessment(activity);
  if (!assessment) return null;
  const { pattern, paceChangeSecondsPerKm, heartRateChange } = assessment;
  if (pattern === 'unknown') return formatLongRunStructure(assessment, locale);
  const structure = formatLongRunStructure(assessment, locale);
  const paceDelta = Math.abs(Math.round(paceChangeSecondsPerKm ?? 0));
  const hrDelta = Math.round(heartRateChange ?? 0);
  const verdict = locale.startsWith('en')
    ? ({
        'negative-split': `The later section was ${paceDelta}s/km faster: a strong negative split and excellent long-run execution.`,
        steady: 'Pace stayed even across the full distance, showing good long-run control.',
        'intentional-slowdown': `The later section was ${paceDelta}s/km slower while HR fell ${Math.abs(hrDelta)} bpm; this looks like an intentional ease-down rather than a bonk, so execution remained sound.`,
        'fatigue-fade': `The later section was ${paceDelta}s/km slower while HR stayed high; this is consistent with a fatigue fade, so execution needs improvement.`,
        'slowing-unclear': `The later section was ${paceDelta}s/km slower, but HR evidence is insufficient to tell an intentional ease-down from a fatigue fade.`,
        mixed: 'The pacing varied without a clear steady or progressive strategy, so execution was usable but not especially clean.',
        unknown: 'There is not enough continuous split data to judge execution.',
      } as const)[pattern]
    : ({
        'negative-split': `后程比前段快 ${paceDelta} 秒/公里，前慢后快的节奏分配很出色，这次长距离完成到位。`,
        steady: '全程配速基本均匀，长距离节奏控制良好。',
        'intentional-slowdown': `后程比前段慢 ${paceDelta} 秒/公里，但心率同步下降 ${Math.abs(hrDelta)} bpm，更像主动降速而非跑崩，整体执行仍然合理。`,
        'fatigue-fade': `后程比前段慢 ${paceDelta} 秒/公里，心率却维持高位，符合疲劳性掉速，完成质量需要改进。`,
        'slowing-unclear': `后程比前段慢 ${paceDelta} 秒/公里，但心率证据不足，暂时不能把它定性为主动降速或跑崩。`,
        mixed: '全程配速有明显起伏，未形成匀速或后程提速策略，整体完成可用但节奏不够清晰。',
        unknown: '连续分段不足，暂时无法判断长距离执行质量。',
      } as const)[pattern];
  return locale.startsWith('en')
    ? `${structure}. ${verdict}`
    : `${structure}。${verdict}`;
}

function getUnexplainedHeartRateRise(
  streamAnalysis?: StreamAnalysis | null,
  longRunAssessment?: LongRunAssessment | null
): number | null {
  if (!streamAnalysis || streamAnalysis.avgHRDrift < 10) return null;
  if (longRunAssessment?.pattern === 'negative-split') return null;
  const paceExplainsRise = streamAnalysis.pacePattern === 'interval'
    || streamAnalysis.pacePattern === 'progression'
    || streamAnalysis.pacePattern === 'warmup-cooldown';
  return streamAnalysis.hasHRDrift || !paceExplainsRise
    ? Math.round(streamAnalysis.avgHRDrift)
    : null;
}

function getExecutionQuality(
  analysis: AIAnalysis,
  context: AIConsistencyContext,
  heartRateRise: number | null
): NonNullable<AIAnalysis['executionQuality']> {
  const { activity, classification, paceZones, streamAnalysis } = context;
  const structure = classification.structure;

  if (classification.isRace) {
    return activity ? getRaceExecutionAssessment(activity)?.quality ?? 'good' : 'good';
  }
  if (activity && getPrimaryPersonalRecord(activity)) return 'excellent';

  if (structure.alternatingRepCount >= 3 && structure.workPaceAverage) {
    const spread = structure.workPaceSpread ?? 0;
    const fade = structure.workPaceFade ?? 0;
    if (spread > 60 || fade > 45) return 'poor';
    if (spread <= 20 && fade <= 15) return 'excellent';
    if (spread <= 35 && fade <= 25) return 'good';
    return 'fair';
  }

  const longRunAssessment = activity ? getLongRunAssessment(activity) : null;
  if (longRunAssessment && longRunAssessment.pattern !== 'unknown') {
    if (longRunAssessment.pattern === 'negative-split') return 'excellent';
    if (longRunAssessment.pattern === 'steady') {
      if ((longRunAssessment.heartRateChange ?? 0) >= 20) return 'fair';
      return 'good';
    }
    if (longRunAssessment.pattern === 'intentional-slowdown') return 'good';
    if (longRunAssessment.pattern === 'fatigue-fade') return 'poor';
    return 'fair';
  }

  const isLowIntensityWorkout = classification.workoutType === 'easy'
    || classification.workoutType === 'recovery';
  if (isLowIntensityWorkout) {
    const hrDistribution = streamAnalysis?.hrZoneDistribution;
    const lowShare = (hrDistribution?.z1 ?? 0) + (hrDistribution?.z2 ?? 0);
    const hardShare = (hrDistribution?.z4 ?? 0) + (hrDistribution?.z5 ?? 0);

    if ((heartRateRise ?? 0) >= 20 || hardShare >= 30) return 'poor';
    if (heartRateRise !== null || hardShare >= 15) return 'fair';
    if (hrDistribution && lowShare >= 95 && hardShare < 5) return 'excellent';
    if (hrDistribution && lowShare >= 85) return 'good';
    if (classification.loadAdjustment?.applied) return 'fair';
    return 'good';
  }

  if ((heartRateRise ?? 0) >= 20) return 'poor';
  if (heartRateRise !== null) return 'fair';
  if (analysis.paceZoneAnalysis?.appropriateness !== undefined
    && analysis.paceZoneAnalysis.appropriateness !== 'appropriate') {
    return 'fair';
  }
  if (activity && getKeySustainedEffort(activity, paceZones?.marathon.max)) {
    return 'excellent';
  }
  return 'good';
}

function alignExecutionQualityText(
  text: string,
  quality: NonNullable<AIAnalysis['executionQuality']>,
  locale: string
): string {
  if (!text || (quality !== 'fair' && quality !== 'poor')) return text;

  if (locale.startsWith('en')) {
    const replacement = quality === 'poor'
      ? 'Execution needs improvement'
      : 'Execution had clear strengths but also a meaningful deviation';
    return text.replace(
      /(?:very well executed|well executed overall|executed (?:very )?well|excellent execution)/gi,
      replacement
    );
  }

  const replacement = quality === 'poor'
    ? '完成质量需改进'
    : '完成有亮点，但存在明显偏差';
  return text.replace(
    /(?:完成得很扎实|完成得很好|完成很好|整体完成得不错|完成质量到位|执行到位)/g,
    replacement
  );
}

function normalizeHeartRateTrendText(
  text: string,
  drift: number | null,
  classification: ActivityClassification,
  locale: string
): string {
  if (!text || drift === null) return text;
  const lowIntensity = classification.workoutType === 'easy'
    || classification.workoutType === 'recovery';

  if (locale.startsWith('en')) {
    const alreadyMentionsRise = /(?:heart rate|HR).{0,24}(?:drift|rose|rise|rising|climbed|increase)|second half.{0,16}(?:drift|rose|rise|increase)/i.test(text);
    return text
      .replace(
        /heart rate (?:stayed|remained|was) (?:very )?(?:stable|steady)(?: throughout)?/gi,
        alreadyMentionsRise
          ? (lowIntensity ? 'heart rate remained mostly in the lower zones' : 'heart rate was not stable throughout')
          : `heart rate rose ${drift} bpm in the second half`
      )
      .replace(
        /(?:stable|clean) late-run heart-rate control/gi,
        `a ${drift} bpm second-half heart-rate rise`
      );
  }

  const alreadyMentionsRise = /心率.{0,12}(?:漂移|上升|上扬)|后半程.{0,8}(?:漂移|上升|上扬)/.test(text);
  return text
    .replace(
      /心率全程(?:处于|保持在)?([^，。；]{1,16}?)(?:且|并且)控制稳定/g,
      '心率全程仍在$1'
    )
    .replace(
      /心率(?:控制|走势|表现)?(?:保持)?(?:得)?(?:很)?(?:稳定|平稳)/g,
      alreadyMentionsRise
        ? (lowIntensity ? '心率大部分仍处于低强度区间' : '心率并非全程稳定')
        : `后半程心率上升 ${drift} bpm`
    )
    .replace(
      /后程(?:心率)?控制(?:都)?(?:很)?(?:干净|稳定|良好)/g,
      `后半程心率上升 ${drift} bpm`
    );
}

function mentionsHeartRateRise(text: string, locale: string): boolean {
  return locale.startsWith('en')
    ? /(?:heart rate|HR).{0,24}(?:drift|rose|rise|rising|climbed|increase)|second half.{0,16}(?:drift|rose|rise|increase)/i.test(text)
    : /心率.{0,12}(?:漂移|上升|上扬)|后半程.{0,8}(?:漂移|上升|上扬)/.test(text);
}

function ensureExecutionMentionsHeartRateRise(
  text: string,
  drift: number | null,
  classification: ActivityClassification,
  locale: string
): string {
  if (drift === null || mentionsHeartRateRise(text, locale)) return text;
  const lowIntensity = classification.workoutType === 'easy'
    || classification.workoutType === 'recovery';
  const fact = locale.startsWith('en')
    ? lowIntensity
      ? `Heart rate stayed mostly in the lower zones but rose ${drift} bpm in the second half, so late-run control was not fully stable.`
      : `Heart rate rose ${drift} bpm in the second half, so late-run control was not fully stable.`
    : lowIntensity
      ? `心率大部分仍在低强度区间，但后半程较前半程上升 ${drift} bpm，后程控制不能算完全稳定。`
      : `后半程心率较前半程上升 ${drift} bpm，后程控制不能算完全稳定。`;
  return [text.trim(), fact].filter(Boolean).join(locale.startsWith('en') ? ' ' : '');
}

function normalizeLoadCostText(
  text: string,
  classification: ActivityClassification,
  finalIntensity: AIAnalysis['intensity'],
  locale: string
): string {
  if (!text || !classification.loadAdjustment?.applied) return text;
  if (locale.startsWith('en')) {
    return text
      .replace(/(?:overall|actual|session) intensity (?:was|is) (?:easy|light)/gi, `overall intensity was ${finalIntensity}`)
      .replace(/(?:recovery cost|training load) (?:was|is) (?:low|minimal)/gi, 'recovery cost was elevated by the conditions and effort')
      .replace(/(?:no|little) recovery (?:is )?(?:needed|required)/gi, 'meaningful recovery is still required');
  }

  const intensityLabel = ({
    easy: '轻松',
    moderate: '适中',
    hard: '高强度',
    extreme: '极限',
  } as const)[finalIntensity];
  return text
    .replace(/(?:综合|实际|本次单次)(?:训练)?强度(?:为|是|属于)?\s*(?:轻松|低强度)/g, `综合强度为${intensityLabel}`)
    .replace(/(?:恢复成本|训练负荷)(?:很|较)?低/g, '恢复成本已被天气与本次努力抬高')
    .replace(/无需(?:额外)?恢复/g, '仍需要充分恢复');
}

function conflictsWithRecoveryWindow(text: string, locale: string): boolean {
  if (!text) return false;
  if (locale.startsWith('en')) {
    const qualitySession = /(?:interval|threshold|tempo|speed|quality|long run)/i.test(text);
    const delayedUntilRecovered = /(?:after|once|only when).{0,24}(?:recover|fatigue|ready)|at least\s+\d+\s*h/i.test(text);
    return qualitySession && !delayedUntilRecovered;
  }
  const qualitySession = /(?:间歇|阈值|节奏跑|速度课|质量课|长距离|耐力课|[ITR]\s*跑)/i.test(text);
  const delayedUntilRecovered = /(?:恢复后|疲劳恢复|状态恢复|至少\s*\d+\s*(?:h|小时)后|确认恢复)/.test(text);
  return qualitySession && !delayedUntilRecovered;
}

function getRecoveryFirstText(hours: number, locale: string): string {
  return locale.startsWith('en')
    ? `Prioritize rest or very easy movement next; wait at least ${hours}h and confirm fatigue has settled before another quality session.`
    : `下一次优先休息或极轻松活动；至少经过 ${hours} 小时并确认疲劳恢复后，再安排质量训练。`;
}

function prioritizeRaceSummary(
  summary: string,
  raceExecution: string | null,
  locale: string
): string {
  if (!raceExecution) return summary;
  const usesTrainingTemplate = locale.startsWith('en')
    ? /(?:long[- ]distance|ultra[- ]distance)\s+(?:training|run|workout)|(?:5|10|30)\s*km\s+blocks?/i.test(summary)
    : /(?:长距离|超长距离)(?:训练|课|跑)|(?:5|10|30)\s*公里分段|长距离模板/.test(summary);
  return usesTrainingTemplate ? raceExecution : summary;
}

export function validateAIAnalysisConsistency(
  analysis: AIAnalysis,
  context: AIConsistencyContext
): AIConsistencyResult {
  const { classification, locale, streamAnalysis } = context;
  const correctedRules = new Set<AIConsistencyRule>();
  const finalIntensity = getFinalIntensity(analysis.intensity, classification, context.activity);
  const minimumRecoveryHours = classification.loadAdjustment?.minimumRecoveryHours ?? 0;
  const finalRecoveryHours = Math.max(analysis.recoveryHours || 0, minimumRecoveryHours);
  const longRunAssessment = context.activity ? getLongRunAssessment(context.activity) : null;
  const raceAssessment = classification.isRace && context.activity
    ? getRaceExecutionAssessment(context.activity)
    : null;
  const heartRateRise = raceAssessment
    ? null
    : getUnexplainedHeartRateRise(streamAnalysis, longRunAssessment);
  const executionQuality = getExecutionQuality(analysis, context, heartRateRise);

  if (finalIntensity !== analysis.intensity) correctedRules.add('intensity-floor');
  if (finalRecoveryHours !== analysis.recoveryHours) correctedRules.add('recovery-floor');
  if (executionQuality !== analysis.executionQuality) correctedRules.add('execution-quality');

  const normalizeNarrative = (text: string): string => {
    const heartRateChecked = normalizeHeartRateTrendText(
      text,
      heartRateRise,
      classification,
      locale
    );
    const loadChecked = normalizeLoadCostText(
      heartRateChecked,
      classification,
      finalIntensity,
      locale
    );
    if (heartRateChecked !== text) correctedRules.add('heart-rate-trend');
    if (loadChecked !== heartRateChecked) correctedRules.add('load-cost');
    return loadChecked;
  };

  const normalizedExecution = normalizeNarrative(analysis.executionSummary || '');
  const executionWithHeartRate = ensureExecutionMentionsHeartRateRise(
    normalizedExecution,
    heartRateRise,
    classification,
    locale
  );
  if (executionWithHeartRate !== normalizedExecution) correctedRules.add('heart-rate-trend');
  const raceExecution = raceAssessment ? formatRaceExecutionSummary(raceAssessment, locale) : null;
  const longRunExecution = getLongRunExecution(context.activity, classification, locale);
  const preferredExecution = raceExecution ?? longRunExecution;
  if (raceExecution && raceExecution !== executionWithHeartRate) correctedRules.add('race-priority');
  if (longRunExecution && longRunExecution !== executionWithHeartRate) correctedRules.add('long-run-priority');
  const executionSummary = alignExecutionQualityText(
    preferredExecution
      ? ensureExecutionMentionsHeartRateRise(preferredExecution, heartRateRise, classification, locale)
      : executionWithHeartRate,
    executionQuality,
    locale
  );
  if (executionSummary !== executionWithHeartRate) correctedRules.add('execution-quality');

  let nextWorkoutSuggestion = normalizeNarrative(analysis.nextWorkoutSuggestion || '');
  let suggestions = analysis.suggestions.map(normalizeNarrative);
  if (minimumRecoveryHours >= 36) {
    const recoveryFirst = getRecoveryFirstText(minimumRecoveryHours, locale);
    if (conflictsWithRecoveryWindow(nextWorkoutSuggestion, locale)) {
      nextWorkoutSuggestion = recoveryFirst;
      correctedRules.add('next-workout-recovery');
    }
    if (suggestions.some((item) => conflictsWithRecoveryWindow(item, locale))) {
      suggestions = [recoveryFirst];
      correctedRules.add('next-workout-recovery');
    }
  }

  const normalizedSummary = normalizeNarrative(analysis.summary || '');
  const racePrioritizedSummary = prioritizeRaceSummary(normalizedSummary, raceExecution, locale);
  if (racePrioritizedSummary !== normalizedSummary) correctedRules.add('race-priority');
  const prioritizedSummary = prioritizeLongRunSummary(
    racePrioritizedSummary,
    context.activity,
    classification,
    locale
  );
  if (prioritizedSummary !== racePrioritizedSummary) correctedRules.add('long-run-priority');

  return {
    analysis: {
      ...analysis,
      summary: prioritizedSummary,
      executionSummary,
      executionQuality,
      intensity: finalIntensity,
      recoveryHours: finalRecoveryHours,
      trainingLoadContext: normalizeNarrative(analysis.trainingLoadContext || ''),
      similarActivitiesInsight: normalizeNarrative(analysis.similarActivitiesInsight || ''),
      nextWorkoutSuggestion,
      suggestions,
      warnings: analysis.warnings.map(normalizeNarrative),
      paceZoneAnalysis: analysis.paceZoneAnalysis
        ? {
            ...analysis.paceZoneAnalysis,
            description: normalizeNarrative(analysis.paceZoneAnalysis.description || ''),
          }
        : null,
    },
    correctedRules: Array.from(correctedRules),
  };
}
