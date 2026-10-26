function makeActivity(id, overrides = {}) {
  return {
    id,
    name: `Run ${id}`,
    distance: 8000,
    moving_time: 2880,
    elapsed_time: 2880,
    total_elevation_gain: 20,
    type: 'Run',
    sport_type: 'Run',
    start_date: '2026-01-01T00:00:00Z',
    start_date_local: '2026-01-01T08:00:00Z',
    average_speed: 8000 / 2880,
    max_speed: 5,
    has_heartrate: true,
    map: { id: String(id), polyline: null, summary_polyline: null },
    ...overrides,
  };
}

function makeLap(index, distance, movingTime) {
  return {
    id: index + 1,
    lap_index: index,
    name: `Lap ${index + 1}`,
    distance,
    moving_time: movingTime,
    elapsed_time: movingTime,
    start_date: '2026-01-01T00:00:00Z',
    average_speed: distance / movingTime,
    max_speed: distance / movingTime,
    total_elevation_gain: 0,
  };
}

function makeSplits(paces, heartRates = []) {
  return paces.map((pace, index) => ({
    split: index + 1,
    distance: 1000,
    moving_time: pace,
    elapsed_time: pace,
    average_speed: 1000 / pace,
    average_heartrate: heartRates[index],
    elevation_difference: 0,
  }));
}

const easyVariationPaces = [410, 405, 400, 395, 390, 350, 350, 350, 415];
const progressiveLongRunPaces = Array.from(
  { length: 32 },
  (_, index) => index < 10 ? 360 : index < 20 ? 345 : index < 30 ? 330 : 285
);
const marathonPaces = Array.from({ length: 42 }, (_, index) => index < 21 ? 295 : 309);
const marathonHeartRates = Array.from({ length: 42 }, (_, index) => index < 21 ? 158 : 164);

/**
 * Product-level contracts collected from real user feedback. These fixtures
 * intentionally describe semantic outcomes rather than exact generated prose.
 */
export const AI_SEMANTIC_REGRESSION_CASES = [
  {
    id: '19864417258',
    title: 'alternating interval laps are evaluated as work and recovery reps',
    activity: makeActivity(19864417258, {
      name: 'Morning Run',
      distance: 6870,
      moving_time: 2110,
      elapsed_time: 2110,
      average_speed: 6870 / 2110,
      average_heartrate: 161,
      laps: [
        makeLap(0, 1090, 381),
        makeLap(1, 750, 204),
        makeLap(2, 800, 239),
        makeLap(3, 780, 201),
        makeLap(4, 820, 261),
        makeLap(5, 760, 206),
        makeLap(6, 910, 336),
        makeLap(7, 730, 208),
        makeLap(8, 230, 74),
      ],
    }),
    expected: {
      workoutType: 'interval',
      intensity: 'hard',
      alternatingRepCount: 4,
      executionIncludes: [/4 个快段/, /恢复圈/, /完成/],
      executionExcludes: [/被识别为/, /置信度/, /判定为/],
    },
  },
  {
    id: '19395075517',
    title: 'easy-zone pace variation is not promoted to a quality block',
    activity: makeActivity(19395075517, {
      name: 'Morning Run',
      distance: 9000,
      moving_time: easyVariationPaces.reduce((sum, pace) => sum + pace, 0),
      elapsed_time: easyVariationPaces.reduce((sum, pace) => sum + pace, 0),
      average_speed: 9000 / easyVariationPaces.reduce((sum, pace) => sum + pace, 0),
      average_heartrate: 135,
      description: 'Temperature 29°C, Feels like 33.7°C, Humidity 94%',
      splits_metric: makeSplits(easyVariationPaces, Array(9).fill(135)),
    }),
    expected: {
      keyEffort: null,
      summaryIncludes: [/低强度有氧/, /稳定积累耐力/],
      summaryExcludes: [/核心质量/, /速度耐力/, /质量课执行/],
    },
  },
  {
    id: '19329411284',
    title: 'hot recovery run keeps heat and cumulative load separate from session intensity',
    activity: makeActivity(19329411284, {
      name: 'Morning Run',
      distance: 8010,
      moving_time: 3053,
      elapsed_time: 3053,
      average_speed: 8010 / 3053,
      average_heartrate: 130,
      suffer_score: 21,
      description: 'Cloudy, Temperature 30.8°C, Feels like 35.7°C, Humidity 67%',
    }),
    trainingLoad: {
      activityLoad: 21,
      current7DayLoad: 223,
      previous7DayLoad: 56,
      averageWeeklyLoad: 162,
      loadRatio: 1.38,
      changePercent: 298,
      state: 'high',
      changeReliability: 'low',
      consecutiveRunDays: 9,
    },
    expected: {
      intensity: 'easy',
      minimumRecoveryHours: 24,
      summaryIncludes: [/低强度有氧/, /体感 35.7°C/, /连续第 9 天跑步/],
      summaryExcludes: [/核心质量/, /高强度/],
    },
  },
  {
    id: '19265678216',
    title: 'a real 5K personal best remains the primary achievement',
    activity: makeActivity(19265678216, {
      name: 'Morning Run',
      distance: 12020,
      moving_time: 3588,
      elapsed_time: 4124,
      average_speed: 12020 / 3588,
      average_heartrate: 160,
      description: 'Temperature 30.2°C, Feels like 33.1°C, Humidity 70%',
      best_efforts: [
        { name: '5K', distance: 5000, moving_time: 1225, elapsed_time: 1254, pr_rank: 1 },
        { name: '1K', distance: 1000, moving_time: 238, elapsed_time: 238, pr_rank: 2 },
      ],
    }),
    expected: {
      primaryPersonalRecord: '5K',
      personalRecordCount: 1,
    },
  },
  {
    id: '20400849331',
    title: '32K long run uses its detected progression rather than a fixed template',
    activity: makeActivity(20400849331, {
      name: 'Morning Run',
      distance: 32000,
      moving_time: progressiveLongRunPaces.reduce((sum, pace) => sum + pace, 0),
      elapsed_time: progressiveLongRunPaces.reduce((sum, pace) => sum + pace, 0),
      average_speed: 32000 / progressiveLongRunPaces.reduce((sum, pace) => sum + pace, 0),
      average_heartrate: 153,
      splits_metric: makeSplits(
        progressiveLongRunPaces,
        progressiveLongRunPaces.map((_, index) => index < 10 ? 140 : index < 20 ? 148 : 156)
      ),
    }),
    expected: {
      intensity: 'moderate',
      longRunPattern: 'negative-split',
      longRunMethod: 'adaptive-phases',
      executionIncludes: [/根据持续配速变化识别出的阶段/, /前慢后快/, /出色/],
      executionExcludes: [/跑崩/, /固定.*10.*公里/],
    },
  },
  {
    id: '16399915541',
    title: 'marathon race is judged by race execution instead of long-run structure',
    activity: makeActivity(16399915541, {
      name: '2025湖州马拉松',
      workout_type: 1,
      distance: 42666,
      moving_time: 12883,
      elapsed_time: 12883,
      average_speed: 42666 / 12883,
      average_heartrate: 161.2,
      max_heartrate: 169,
      splits_metric: [
        ...makeSplits(marathonPaces, marathonHeartRates),
        {
          split: 43,
          distance: 666,
          moving_time: 199,
          elapsed_time: 199,
          average_speed: 666 / 199,
          average_heartrate: 164,
          elevation_difference: 0,
        },
      ],
    }),
    expected: {
      workoutType: 'race',
      intensity: 'extreme',
      racePattern: 'controlled-positive-split',
      raceQuality: 'excellent',
      executionIncludes: [/前半程/, /后半程只比前半程慢/, /完成非常出色/],
      executionExcludes: [/长距离训练/, /长距离模板/],
    },
  },
];
