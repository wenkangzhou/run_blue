import type { StravaActivity } from '@/types';
import { buildActivityWeatherContext } from './weather';
import type { TrainingLoadSummary } from './trainingLoad';
import type {
  ActivityClassification,
  ActivityLoadAdjustment,
  TrainingProfile,
} from './trainingAnalysis';

export interface TrainingLoadContext {
  activityLoad: number;
  summary: TrainingLoadSummary;
  maxHeartRate?: number | null;
}

const INTENSITY_RANK: Record<ActivityClassification['intensity'], number> = {
  easy: 0,
  moderate: 1,
  hard: 2,
  extreme: 3,
};

function maxIntensity(
  left: ActivityClassification['intensity'],
  right: ActivityClassification['intensity']
): ActivityClassification['intensity'] {
  return INTENSITY_RANK[left] >= INTENSITY_RANK[right] ? left : right;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getRecentVolumeContext(recentLoad: TrainingProfile['recentLoad']) {
  if (recentLoad.length === 0) {
    return { changePercent: null, changeReliable: false, ratio: null };
  }

  const current = recentLoad[recentLoad.length - 1];
  const previous = recentLoad.length > 1 ? recentLoad[recentLoad.length - 2] : null;
  const baseline = recentLoad.slice(Math.max(0, recentLoad.length - 4), -1);
  const baselineAverage = baseline.length > 0
    ? baseline.reduce((sum, week) => sum + week.totalDistance, 0) / baseline.length
    : 0;

  return {
    changePercent: previous && previous.totalDistance > 0
      ? Math.round(((current.totalDistance - previous.totalDistance) / previous.totalDistance) * 100)
      : null,
    changeReliable: Boolean(
      previous
      && previous.runs >= 2
      && previous.totalDistance >= Math.max(5000, baselineAverage * 0.4)
    ),
    ratio: baselineAverage > 0 ? round(current.totalDistance / baselineAverage, 2) : null,
  };
}

export function adjustClassificationForTrainingStress(
  activity: StravaActivity,
  profile: TrainingProfile,
  classification: ActivityClassification,
  trainingLoadContext?: TrainingLoadContext
): ActivityClassification {
  if (classification.isRace) return classification;

  const weather = buildActivityWeatherContext(activity);
  const paceSecondsPerKm = activity.distance > 0 && activity.moving_time > 0
    ? activity.moving_time / (activity.distance / 1000)
    : null;
  const easyZone = profile.paceZones.easy;
  const hasEasyZone = Number.isFinite(easyZone?.min) && Number.isFinite(easyZone?.max);
  const easyFastBoundarySeconds = hasEasyZone
    ? Math.round(easyZone.min + (easyZone.max - easyZone.min) * 0.5)
    : null;

  let paceContext: ActivityLoadAdjustment['paceContext'] = 'unknown';
  if (paceSecondsPerKm !== null) {
    if (classification.paceZone !== 'E') {
      paceContext = 'quality';
    } else if (easyFastBoundarySeconds !== null && paceSecondsPerKm <= easyFastBoundarySeconds) {
      paceContext = 'upper-easy';
    } else {
      paceContext = 'relaxed-easy';
    }
  }

  const sameTemperaturePaceDeltaSeconds = profile.thermalStats?.paceDifferenceSeconds ?? null;
  const isFasterThanThermalBaseline = sameTemperaturePaceDeltaSeconds !== null
    && sameTemperaturePaceDeltaSeconds <= -10;
  const pacePressure = paceContext === 'quality'
    || paceContext === 'upper-easy'
    || isFasterThanThermalBaseline;

  const volume = getRecentVolumeContext(profile.recentLoad);
  const highRecentVolume = (volume.changeReliable && volume.changePercent !== null && volume.changePercent >= 50)
    || (volume.ratio !== null && volume.ratio >= 1.35);
  const veryHighRecentVolume = (volume.changeReliable && volume.changePercent !== null && volume.changePercent >= 100)
    || (volume.ratio !== null && volume.ratio >= 1.7);

  const trainingLoad = trainingLoadContext?.summary;
  const hasTrainingLoadBaseline = Boolean(trainingLoad && trainingLoad.state !== 'insufficient');
  const highTrainingLoad = Boolean(hasTrainingLoadBaseline && (
    trainingLoad!.state === 'high'
    || (trainingLoad!.loadRatio !== null && trainingLoad!.loadRatio >= 1.35)
    || (trainingLoad!.changeReliability === 'normal'
      && trainingLoad!.changePercent !== null
      && trainingLoad!.changePercent >= 50)
  ));
  const veryHighTrainingLoad = Boolean(hasTrainingLoadBaseline && (
    (trainingLoad!.loadRatio !== null && trainingLoad!.loadRatio >= 1.7)
    || (trainingLoad!.changeReliability === 'normal'
      && trainingLoad!.changePercent !== null
      && trainingLoad!.changePercent >= 100)
  ));
  const highRecentLoad = highTrainingLoad || highRecentVolume;
  const veryHighRecentLoad = veryHighTrainingLoad || veryHighRecentVolume;

  const relativeEffort = typeof activity.suffer_score === 'number' && Number.isFinite(activity.suffer_score)
    ? Math.round(activity.suffer_score)
    : null;
  const heartRateRatio = trainingLoadContext?.maxHeartRate
    && activity.average_heartrate
    && activity.average_heartrate > 0
      ? activity.average_heartrate / trainingLoadContext.maxHeartRate
      : null;
  const hasControlledEffortSignal = (heartRateRatio !== null && heartRateRatio <= 0.81)
    || (relativeEffort !== null && relativeEffort <= 35);
  const sessionEffortControlled = classification.intensity === 'easy'
    && paceContext === 'relaxed-easy'
    && (hasControlledEffortSignal || (heartRateRatio === null && relativeEffort === null));

  let adjustedIntensity = classification.intensity;
  if (weather.thermalSeverity === 'heat-stress') {
    if (pacePressure) {
      adjustedIntensity = maxIntensity(adjustedIntensity, 'moderate');
    }
  } else if (weather.thermalSeverity === 'heat-load' && pacePressure && !sessionEffortControlled) {
    adjustedIntensity = maxIntensity(adjustedIntensity, 'moderate');
  }

  const applied = INTENSITY_RANK[adjustedIntensity] > INTENSITY_RANK[classification.intensity];
  const consecutiveRunDays = trainingLoad?.consecutiveRunDays ?? 0;
  const cumulativeLoadConcern: ActivityLoadAdjustment['cumulativeLoadConcern'] =
    veryHighRecentLoad || consecutiveRunDays >= 7
      ? 'high'
      : highRecentLoad || consecutiveRunDays >= 5
        ? 'watch'
        : 'none';
  const sessionRecoveryFloor = adjustedIntensity === 'hard'
    ? 48
    : adjustedIntensity === 'moderate'
      ? 36
      : 0;
  const cumulativeRecoveryFloor = cumulativeLoadConcern === 'high'
    ? 24
    : cumulativeLoadConcern === 'watch'
      ? 18
      : 0;
  const minimumRecoveryHours = Math.max(sessionRecoveryFloor, cumulativeRecoveryFloor);

  const loadAdjustment: ActivityLoadAdjustment = {
    applied,
    baseIntensity: classification.intensity,
    adjustedIntensity,
    sessionEffortControlled,
    cumulativeLoadConcern,
    thermalSeverity: weather.thermalSeverity,
    paceContext,
    paceSecondsPerKm: paceSecondsPerKm === null ? null : Math.round(paceSecondsPerKm),
    easyFastBoundarySeconds,
    sameTemperaturePaceDeltaSeconds,
    recentVolumeChangePercent: volume.changePercent,
    recentVolumeRatio: volume.ratio,
    activityTrainingLoad: trainingLoadContext?.activityLoad ?? null,
    current7DayTrainingLoad: trainingLoad?.current7DayLoad ?? null,
    previous7DayTrainingLoad: trainingLoad?.previous7DayLoad ?? null,
    averageWeeklyTrainingLoad: trainingLoad?.averageWeeklyLoad ?? null,
    trainingLoadChangePercent: trainingLoad?.changePercent ?? null,
    trainingLoadChangeReliable: trainingLoad ? trainingLoad.changeReliability === 'normal' : null,
    trainingLoadRatio: trainingLoad?.loadRatio ?? null,
    trainingLoadState: trainingLoad?.state ?? null,
    trainingLoadHeartRateCoverage: trainingLoad?.heartRateCoverage ?? null,
    activityTrainingLoadSharePercent: trainingLoadContext && trainingLoad?.current7DayLoad
      ? round((trainingLoadContext.activityLoad / trainingLoad.current7DayLoad) * 100, 0)
      : null,
    relativeEffort,
    consecutiveRunDays,
    minimumRecoveryHours,
  };

  return {
    ...classification,
    intensity: adjustedIntensity,
    workoutTypeEvidence: applied
      ? [...classification.workoutTypeEvidence, 'heat and pace raise current-session effort']
      : classification.workoutTypeEvidence,
    loadAdjustment,
  };
}
