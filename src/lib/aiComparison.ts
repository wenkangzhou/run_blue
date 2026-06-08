import { StravaActivity } from '@/types';
import type { TrainingProfile, WorkoutType } from './trainingAnalysis';

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

function getRankText(
  rank: number,
  referenceLabel: string,
  en: boolean,
  suffix = ''
): string {
  if (rank <= 0) {
    return en
      ? `currently slower than the full ${referenceLabel} sample${suffix}`
      : `当前落在这组${referenceLabel}样本的后段${suffix}`;
  }
  if (rank >= 100) {
    return en
      ? `currently faster than the full ${referenceLabel} sample${suffix}`
      : `当前落在这组${referenceLabel}样本的最前列${suffix}`;
  }
  return en
    ? `faster than ${rank}% of ${referenceLabel}${suffix}`
    : `超过 ${rank}% 的${referenceLabel}${suffix}`;
}

/**
 * Build accurate comparison text from similarStats to avoid AI hallucinations
 * like "significantly improved by 2+ minutes total time".
 */
export function buildAccurateComparison(
  activity: StravaActivity,
  similarStats: NonNullable<TrainingProfile['similarStats']>,
  locale: string = 'zh',
  workoutType?: WorkoutType
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

  const referenceLabel = similarStats.comparisonMode === 'strict'
    ? (en ? 'similar workouts' : '同类训练')
    : (en ? 'distance-matched runs' : '距离相近样本');
  const softSuffix = similarStats.sampleConfidence === 'low'
    ? (en ? ' (reference strength is limited)' : '（参考性较弱）')
    : '';
  const lowIntensityReference = workoutType === 'easy' || workoutType === 'recovery';
  const rankText = getRankText(similarStats.yourPaceRank, referenceLabel, en, softSuffix);

  if (lowIntensityReference) {
    const comparison = (() => {
      if (diffSec === 0) {
        return en
          ? `Close to historical average, but for easy/recovery runs this is only a pace reference`
          : `与历史平均接近，但对轻松/恢复跑来说这只是一条配速参考`;
      }
      if (diffSec < 0) {
        return en
          ? `${diffAbs}s/km faster than historical average; if effort stayed light, this suggests good freshness rather than a target to chase`
          : `比历史平均快 ${diffAbs} 秒/km；若体感依旧轻松，更像恢复状态较好，而不是需要主动去追的目标`;
      }
      return en
        ? `${diffAbs}s/km slower than historical average, but easy/recovery runs should be judged by low strain first`
        : `比历史平均慢 ${diffAbs} 秒/km，但轻松/恢复跑应优先看是否低负荷完成`;
    })();

    let insight = en
      ? `Use the ${similarStats.count}-run reference set as background only. `
      : `这 ${similarStats.count} 次样本更适合作为背景参考。`;

    if (similarStats.yourPaceRank <= 20) {
      insight += en
        ? `This pace sits toward the back of the sample, which is acceptable when the run was intentionally easy or recovery-focused.`
        : `本次配速位于样本后段，但如果这是按恢复意图执行的低压力训练，本身并不构成问题。`;
    } else if (similarStats.yourPaceRank >= 80 && diffSec < 0) {
      insight += en
        ? `This pace sits toward the front of the sample. If heart rate and feel stayed easy, that usually means freshness is good.`
        : `本次配速位于样本前段；如果心率和体感仍然轻松，通常说明当前恢复状态不错。`;
    } else {
      insight += en
        ? `For low-intensity runs, the main question is whether strain stayed low and the workout intent was respected.`
        : `对低强度训练来说，关键还是看负荷是否足够低，以及训练意图有没有被正确执行。`;
    }

    if (similarStats.sampleConfidence === 'low') {
      insight += en
        ? ` Treat the comparison as directional only.`
        : ` 这组对比仅作方向性提示。`;
    } else if (similarStats.trendDirection === 'improving') {
      insight += en ? ` Recent easy-run rhythm is trending better.` : ` 近期轻松跑节奏整体在变好。`;
    } else if (similarStats.trendDirection === 'declining') {
      insight += en ? ` Recent easy-run rhythm has been a bit heavier.` : ` 近期轻松跑节奏略显偏重。`;
    } else {
      insight += en ? ` Recent low-intensity rhythm is broadly stable.` : ` 近期低强度训练节奏整体稳定。`;
    }

    return { comparisonToAverage: comparison, similarActivitiesInsight: insight };
  }

  const comparison = diffSec === 0
    ? (en
        ? `Same as historical average, ${rankText}`
        : `与历史平均持平，${rankText}`)
    : (en
        ? `${diffAbs}s/km ${diffText} than historical average, ${rankText}`
        : `比历史平均${diffText} ${diffAbs} 秒/km，${rankText}`);

  const distanceLabel = getDistanceLabel(activity.distance, en);
  const zhSampleLabel = `${similarStats.comparisonMode === 'strict' ? '同类' : '距离相近'}${distanceLabel}训练`;
  let insight = '';
  if (en) {
    if (similarStats.yourPaceRank <= 0) {
      insight = `Among ${similarStats.count} ${similarStats.comparisonMode === 'strict' ? 'same-type' : 'distance-matched'} ${distanceLabel} workouts, this run currently sits near the back of the sample. `;
    } else if (similarStats.yourPaceRank >= 100) {
      insight = `Among ${similarStats.count} ${similarStats.comparisonMode === 'strict' ? 'same-type' : 'distance-matched'} ${distanceLabel} workouts, this run currently sits at the front of the sample. `;
    } else {
      insight = `Among ${similarStats.count} ${similarStats.comparisonMode === 'strict' ? 'same-type' : 'distance-matched'} ${distanceLabel} workouts, this pace was faster than ${similarStats.yourPaceRank}% of them. `;
    }
  } else if (similarStats.yourPaceRank <= 0) {
    insight = `在 ${similarStats.count} 次${zhSampleLabel}中，本次暂时位于这组样本的后段。`;
  } else if (similarStats.yourPaceRank >= 100) {
    insight = `在 ${similarStats.count} 次${zhSampleLabel}中，本次暂时位于这组样本最前列。`;
  } else {
    insight = `在 ${similarStats.count} 次${zhSampleLabel}中，本次配速超过 ${similarStats.yourPaceRank}% 的样本。`;
  }
  if (diffSec === 0) {
    insight += en ? 'This pace is basically the same as the historical average' : '本次配速与历史平均基本持平';
  } else {
    insight += en
      ? `This pace is ${diffAbs}s/km ${diffText} than the historical average`
      : `本次配速比历史平均${diffText} ${diffAbs} 秒/km`;
  }
  const trendText = (() => {
    if (similarStats.sampleConfidence === 'low') {
      return en ? ', but the reference sample is weak so treat this as directional only' : '，但参考样本较弱，请把它理解为方向性提示';
    }
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
