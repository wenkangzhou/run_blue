import { StravaActivity } from '@/types';
import type { TrainingProfile } from './trainingAnalysis';

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
 * Build accurate comparison text from similarStats to avoid AI hallucinations
 * like "significantly improved by 2+ minutes total time".
 */
export function buildAccurateComparison(
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
