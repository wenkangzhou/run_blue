import type { ActivitySplit, StravaActivity } from '@/types';

export type RaceExecutionPattern =
  | 'negative-split'
  | 'even-split'
  | 'controlled-positive-split'
  | 'isolated-disruption'
  | 'late-fade'
  | 'likely-bonk'
  | 'unknown';

export interface RaceSplitAnomaly {
  kilometer: number;
  paceSecondsPerKm: number;
  slowerThanAverageSecondsPerKm: number;
  recoveredAfterward: boolean;
  inSecondHalf: boolean;
  excessSeconds: number;
}

export interface RaceExecutionAssessment {
  pattern: RaceExecutionPattern;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  analyzedDistanceMeters: number;
  averagePaceSecondsPerKm: number;
  firstHalfTimeSeconds: number;
  secondHalfTimeSeconds: number;
  splitDifferenceSeconds: number;
  adjustedSplitDifferenceSeconds: number;
  firstHalfPaceSecondsPerKm: number;
  secondHalfPaceSecondsPerKm: number;
  firstHalfHeartRate?: number;
  secondHalfHeartRate?: number;
  heartRateChange?: number;
  firstHalfFasterThanAverageSecondsPerKm: number;
  balancedPositiveSplitLimitSeconds: number;
  startedTooFast: boolean;
  anomalies: RaceSplitAnomaly[];
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getValidSplits(splits: ActivitySplit[] | undefined): ActivitySplit[] {
  return (splits ?? [])
    .filter((split) => isPositiveFinite(split.distance) && isPositiveFinite(split.moving_time))
    .sort((a, b) => a.split - b.split);
}

function getBalancedPositiveSplitLimitSeconds(distanceMeters: number): number {
  if (distanceMeters >= 40_000) return 300;
  if (distanceMeters >= 20_000) return 180;
  if (distanceMeters >= 9_500) return 90;
  return 45;
}

interface HalfAccumulator {
  distance: number;
  time: number;
  heartRateTime: number;
  heartRateDuration: number;
}

function addSplitPortion(
  accumulator: HalfAccumulator,
  split: ActivitySplit,
  distance: number
) {
  if (distance <= 0) return;
  const fraction = distance / split.distance;
  const time = split.moving_time * fraction;
  accumulator.distance += distance;
  accumulator.time += time;
  if (isPositiveFinite(split.average_heartrate)) {
    accumulator.heartRateTime += split.average_heartrate * time;
    accumulator.heartRateDuration += time;
  }
}

function getAverageHeartRate(accumulator: HalfAccumulator): number | undefined {
  return accumulator.heartRateDuration > 0
    ? accumulator.heartRateTime / accumulator.heartRateDuration
    : undefined;
}

function findRaceSplitAnomalies(
  splits: ActivitySplit[],
  averagePaceSecondsPerKm: number,
  halfDistanceMeters: number
): RaceSplitAnomaly[] {
  const anomalies: RaceSplitAnomaly[] = [];
  let distanceCursor = 0;
  splits.forEach((split, index) => {
    const splitMidpoint = distanceCursor + split.distance / 2;
    distanceCursor += split.distance;
    if (split.distance < 800) return;

    const pace = split.moving_time / split.distance * 1000;
    const slowerBy = pace - averagePaceSecondsPerKm;
    if (slowerBy < 120) return;

    const following = splits.slice(index + 1, index + 4).filter((item) => item.distance >= 800);
    const recoveredAfterward = following.some((nextSplit) =>
      nextSplit.moving_time / nextSplit.distance * 1000 <= averagePaceSecondsPerKm + 45
    );
    anomalies.push({
      kilometer: split.split,
      paceSecondsPerKm: pace,
      slowerThanAverageSecondsPerKm: slowerBy,
      recoveredAfterward,
      inSecondHalf: splitMidpoint > halfDistanceMeters,
      excessSeconds: slowerBy * split.distance / 1000,
    });
  });
  return anomalies;
}

/**
 * Race execution is evaluated as a race, not as a long training run. The
 * first/second-half split is the primary signal; isolated very slow kilometers
 * are kept separate so a stop followed by recovery is not treated as a
 * continuous late-race collapse.
 */
export function getRaceExecutionAssessment(
  activity: Pick<StravaActivity, 'distance' | 'splits_metric'>
): RaceExecutionAssessment | null {
  const splits = getValidSplits(activity.splits_metric);
  if (splits.length < 4) return null;

  const splitDistance = splits.reduce((sum, split) => sum + split.distance, 0);
  const analyzedDistanceMeters = Math.min(activity.distance, splitDistance);
  if (analyzedDistanceMeters < activity.distance * 0.85) return null;

  const halfDistance = analyzedDistanceMeters / 2;
  const first: HalfAccumulator = { distance: 0, time: 0, heartRateTime: 0, heartRateDuration: 0 };
  const second: HalfAccumulator = { distance: 0, time: 0, heartRateTime: 0, heartRateDuration: 0 };
  let cursor = 0;
  for (const split of splits) {
    if (cursor >= analyzedDistanceMeters) break;
    const usableDistance = Math.min(split.distance, analyzedDistanceMeters - cursor);
    const firstDistance = Math.max(0, Math.min(cursor + usableDistance, halfDistance) - cursor);
    addSplitPortion(first, split, firstDistance);
    addSplitPortion(second, split, usableDistance - firstDistance);
    cursor += usableDistance;
  }

  if (first.distance < halfDistance * 0.98 || second.distance < halfDistance * 0.98) return null;

  const firstHalfPaceSecondsPerKm = first.time / first.distance * 1000;
  const secondHalfPaceSecondsPerKm = second.time / second.distance * 1000;
  const averagePaceSecondsPerKm = (first.time + second.time) / analyzedDistanceMeters * 1000;
  const splitDifferenceSeconds = second.time - first.time;
  const firstHalfHeartRate = getAverageHeartRate(first);
  const secondHalfHeartRate = getAverageHeartRate(second);
  const heartRateChange = firstHalfHeartRate !== undefined && secondHalfHeartRate !== undefined
    ? secondHalfHeartRate - firstHalfHeartRate
    : undefined;
  const firstHalfFasterThanAverageSecondsPerKm = averagePaceSecondsPerKm - firstHalfPaceSecondsPerKm;
  const balancedPositiveSplitLimitSeconds = getBalancedPositiveSplitLimitSeconds(analyzedDistanceMeters);
  const startedTooFast = firstHalfFasterThanAverageSecondsPerKm >= Math.max(12, averagePaceSecondsPerKm * 0.04);
  const anomalies = findRaceSplitAnomalies(splits, averagePaceSecondsPerKm, halfDistance);
  const recoveredAnomalyAdjustment = anomalies
    .filter((anomaly) => anomaly.recoveredAfterward)
    .reduce(
      (sum, anomaly) => sum + (anomaly.inSecondHalf ? -anomaly.excessSeconds : anomaly.excessSeconds),
      0
    );
  const adjustedSplitDifferenceSeconds = splitDifferenceSeconds + recoveredAnomalyAdjustment;
  const recoveredAnomalyExplainsSplit = anomalies.some((anomaly) => anomaly.recoveredAfterward)
    && Math.abs(splitDifferenceSeconds) > balancedPositiveSplitLimitSeconds
    && Math.abs(adjustedSplitDifferenceSeconds) <= balancedPositiveSplitLimitSeconds;

  let pattern: RaceExecutionPattern;
  let quality: RaceExecutionAssessment['quality'];
  if (recoveredAnomalyExplainsSplit) {
    pattern = 'isolated-disruption';
    quality = 'good';
  } else if (splitDifferenceSeconds <= -30) {
    pattern = 'negative-split';
    quality = 'excellent';
  } else if (Math.abs(splitDifferenceSeconds) <= 60) {
    pattern = 'even-split';
    quality = 'excellent';
  } else if (splitDifferenceSeconds <= balancedPositiveSplitLimitSeconds) {
    pattern = 'controlled-positive-split';
    quality = 'excellent';
  } else {
    const heartRateStayedHigh = heartRateChange !== undefined && heartRateChange >= -2;
    const severeSlowdown = splitDifferenceSeconds > balancedPositiveSplitLimitSeconds * 2;
    if (startedTooFast && severeSlowdown && heartRateStayedHigh) {
      pattern = 'likely-bonk';
      quality = 'poor';
    } else {
      pattern = 'late-fade';
      quality = severeSlowdown ? 'poor' : 'fair';
    }
  }

  return {
    pattern,
    quality,
    analyzedDistanceMeters,
    averagePaceSecondsPerKm,
    firstHalfTimeSeconds: first.time,
    secondHalfTimeSeconds: second.time,
    splitDifferenceSeconds,
    adjustedSplitDifferenceSeconds,
    firstHalfPaceSecondsPerKm,
    secondHalfPaceSecondsPerKm,
    firstHalfHeartRate,
    secondHalfHeartRate,
    heartRateChange,
    firstHalfFasterThanAverageSecondsPerKm,
    balancedPositiveSplitLimitSeconds,
    startedTooFast,
    anomalies,
  };
}

function formatDuration(seconds: number): string {
  const rounded = Math.round(Math.abs(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatPace(secondsPerKm: number): string {
  const rounded = Math.round(secondsPerKm);
  return `${Math.floor(rounded / 60)}'${String(rounded % 60).padStart(2, '0')}"`;
}

export function formatRaceExecutionSummary(
  assessment: RaceExecutionAssessment,
  locale: string
): string {
  const en = locale.startsWith('en');
  const firstTime = formatDuration(assessment.firstHalfTimeSeconds);
  const secondTime = formatDuration(assessment.secondHalfTimeSeconds);
  const difference = formatDuration(assessment.splitDifferenceSeconds);
  const firstPace = formatPace(assessment.firstHalfPaceSecondsPerKm);
  const secondPace = formatPace(assessment.secondHalfPaceSecondsPerKm);
  const startGap = Math.round(assessment.firstHalfFasterThanAverageSecondsPerKm);

  const verdict = en
    ? ({
        'negative-split': `The second half was ${difference} faster: an excellent negative split and very strong race execution.`,
        'even-split': 'The two halves were almost even, showing excellent pacing control.',
        'controlled-positive-split': `The second half was only ${difference} slower, which is still an excellent controlled finish for this race distance.`,
        'isolated-disruption': 'The apparent half-to-half gap was mainly caused by one isolated disruption. Pace returned afterward, showing good in-race adjustment rather than a continuous collapse.',
        'late-fade': assessment.heartRateChange === undefined
          ? `The first half was reasonably established, but the second half was ${difference} slower. This is a meaningful late-race fade; without half-by-half HR it cannot be labeled a bonk with confidence.`
          : assessment.heartRateChange <= -5
            ? `The second half was ${difference} slower while HR also fell ${Math.abs(Math.round(assessment.heartRateChange))} bpm. That does not support a simple high-effort bonk; an intentional ease-down, stop, or physical issue is also possible.`
            : `The first half was reasonably established, but the second half was ${difference} slower, showing a meaningful late-race fade.`,
        'likely-bonk': `The first half showed strong speed, but it was ${startGap}s/km faster than the overall average; the second half then slowed by ${difference} while HR stayed high. The opening was too aggressive and the race likely unraveled late.`,
        unknown: 'There is not enough split evidence to judge race execution.',
      } as const)[assessment.pattern]
    : ({
        'negative-split': `后半程比前半程快 ${difference}，跑出了负分割，比赛执行非常出色。`,
        'even-split': '前后半程几乎等速，配速控制非常出色。',
        'controlled-positive-split': `后半程只比前半程慢 ${difference}，对这个比赛距离仍属于控制很好的正分割，完成非常出色。`,
        'isolated-disruption': '前后半程的表面差异主要来自一次局部中断；恢复后重新回到比赛节奏，说明临场调整能力不错，不能把它归为持续跑崩。',
        'late-fade': assessment.heartRateChange === undefined
          ? `前半程基本建立了比赛节奏，但后半程比前半程慢 ${difference}，后程出现明显掉速；缺少前后半程心率，不能直接定性为跑崩。`
          : assessment.heartRateChange <= -5
            ? `后半程比前半程慢 ${difference}，但心率也下降了 ${Math.abs(Math.round(assessment.heartRateChange))} bpm，不支持简单判为高心率下的跑崩，也可能是主动降速、停走或身体状况影响。`
            : `前半程基本建立了比赛节奏，但后半程比前半程慢 ${difference}，后程出现了比较明显的掉速。`,
        'likely-bonk': `前半程体现出了速度能力，但配速比全程均配快 ${startGap} 秒/公里；后半程又慢了 ${difference}，且心率没有同步下降，说明前段跑得过快，后程高度疑似跑崩。`,
        unknown: '分段证据不足，暂时无法判断比赛执行。',
      } as const)[assessment.pattern];

  const halves = en
    ? `First half ${firstTime} (${firstPace}/km), second half ${secondTime} (${secondPace}/km).`
    : `前半程 ${firstTime}（${firstPace}/km），后半程 ${secondTime}（${secondPace}/km）。`;
  const anomaly = assessment.anomalies.find((item) => item.recoveredAfterward);
  if (!anomaly) return `${halves}${verdict}`;

  const anomalyPace = formatPace(anomaly.paceSecondsPerKm);
  const anomalyGap = Math.round(anomaly.slowerThanAverageSecondsPerKm);
  const anomalyText = en
    ? ` Kilometer ${anomaly.kilometer} slowed to ${anomalyPace}/km (${anomalyGap}s/km slower than average) before pace recovered; this looks like an isolated stop/walk, cramp, or wall episode rather than a continuous fade, though the data cannot identify the exact cause.`
    : `第 ${anomaly.kilometer} 公里降到 ${anomalyPace}/km，比均配慢 ${anomalyGap} 秒/公里，随后能够恢复配速，这一点值得肯定；这更像一次停走、抽筋或撞墙后的短暂中断，而不是持续性掉速，具体原因仍需结合当时体感。`;
  return `${halves}${verdict}${anomalyText}`;
}
