import type { AIAnalysis } from './aiTypes';
import type { StravaActivity } from '@/types';
import type { ActivityClassification, PaceZones } from './trainingAnalysis';
import type { StreamAnalysis } from './streamAnalysis';
import { getPrimaryPersonalRecord } from './activityAchievements';
import { getKeySustainedEffort } from './activityHighlights';

export type AIConsistencyRule =
  | 'intensity-floor'
  | 'recovery-floor'
  | 'execution-quality'
  | 'heart-rate-trend'
  | 'load-cost'
  | 'next-workout-recovery';

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
  classification: ActivityClassification
): AIAnalysis['intensity'] {
  if (classification.isRace) return 'extreme';
  const parsed = candidate && candidate in INTENSITY_RANK ? candidate : 'moderate';
  if (!classification.loadAdjustment?.applied) return parsed;
  return INTENSITY_RANK[classification.intensity] > INTENSITY_RANK[parsed]
    ? classification.intensity
    : parsed;
}

function getUnexplainedHeartRateRise(streamAnalysis?: StreamAnalysis | null): number | null {
  if (!streamAnalysis || streamAnalysis.avgHRDrift < 10) return null;
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

  if (activity && getPrimaryPersonalRecord(activity)) return 'excellent';
  if (classification.isRace) return 'good';

  if (structure.alternatingRepCount >= 3 && structure.workPaceAverage) {
    const spread = structure.workPaceSpread ?? 0;
    const fade = structure.workPaceFade ?? 0;
    if (spread > 60 || fade > 45) return 'poor';
    if (spread <= 20 && fade <= 15) return 'excellent';
    if (spread <= 35 && fade <= 25) return 'good';
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

export function validateAIAnalysisConsistency(
  analysis: AIAnalysis,
  context: AIConsistencyContext
): AIConsistencyResult {
  const { classification, locale, streamAnalysis } = context;
  const correctedRules = new Set<AIConsistencyRule>();
  const finalIntensity = getFinalIntensity(analysis.intensity, classification);
  const minimumRecoveryHours = classification.loadAdjustment?.minimumRecoveryHours ?? 0;
  const finalRecoveryHours = Math.max(analysis.recoveryHours || 0, minimumRecoveryHours);
  const heartRateRise = getUnexplainedHeartRateRise(streamAnalysis);
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
  const executionSummary = alignExecutionQualityText(
    executionWithHeartRate,
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

  return {
    analysis: {
      ...analysis,
      summary: normalizeNarrative(analysis.summary || ''),
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
