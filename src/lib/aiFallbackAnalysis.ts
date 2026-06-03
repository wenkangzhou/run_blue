import { StravaActivity } from '@/types';
import type { AIAnalysis } from './aiTypes';
import type { ActivityClassification, TrainingProfile } from './trainingAnalysis';
import { formatPace } from './trainingAnalysis';
import { buildAccurateComparison } from './aiComparison';

/**
 * Generate local analysis when the AI provider fails or times out.
 */
export function generateFallbackAnalysis(
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
  const comparisonText = fallbackComparison?.comparisonToAverage || (en ? 'No historical comparison data yet' : '暂无历史对比数据');

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
