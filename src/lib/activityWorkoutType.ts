import type { StravaActivity } from '@/types';

export type ActivityWorkoutCategory =
  | 'normal'
  | 'race'
  | 'longRun'
  | 'workout';

export const ACTIVITY_WORKOUT_TYPE_CODES = {
  normal: 0,
  race: 1,
  longRun: 2,
  workout: 3,
} as const;

const WORKOUT_KEYWORDS = [
  'workout',
  'training',
  'interval',
  'intervals',
  'tempo',
  'threshold',
  'fartlek',
  'progression',
  'repeats',
  'hill repeats',
  '训练',
  '间歇',
  '节奏',
  '阈值',
  '法特莱克',
  '渐进',
  '坡跑',
];

export const ACTIVITY_WORKOUT_TRANSLATION_KEYS: Record<ActivityWorkoutCategory, string> = {
  normal: 'activity.normalRun',
  race: 'activity.race',
  longRun: 'activity.longRun',
  workout: 'activity.workout',
};

function getActivityText(activity: Pick<StravaActivity, 'name' | 'description'>): string {
  return `${activity.name || ''} ${activity.description || ''}`.toLocaleLowerCase();
}

function containsAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function getActivityWorkoutCategory(
  activity: Pick<StravaActivity, 'workout_type' | 'distance' | 'name' | 'description'>
): ActivityWorkoutCategory {
  switch (activity.workout_type) {
    case ACTIVITY_WORKOUT_TYPE_CODES.normal:
      return 'normal';
    case ACTIVITY_WORKOUT_TYPE_CODES.race:
      return 'race';
    case ACTIVITY_WORKOUT_TYPE_CODES.longRun:
      return 'longRun';
    case ACTIVITY_WORKOUT_TYPE_CODES.workout:
      return 'workout';
  }

  const text = getActivityText(activity);
  if (containsAnyKeyword(text, WORKOUT_KEYWORDS)) return 'workout';
  if (activity.distance >= 15000) return 'longRun';
  return 'normal';
}

export function matchesActivityWorkoutCategory(
  activity: Pick<StravaActivity, 'workout_type' | 'distance' | 'name' | 'description'>,
  categories: ActivityWorkoutCategory[]
): boolean {
  if (categories.length === 0) return true;
  const category = getActivityWorkoutCategory(activity);
  return categories.includes(category);
}

export function getActivityWorkoutSearchTerms(
  activity: Pick<StravaActivity, 'workout_type' | 'distance' | 'name' | 'description'>
): string[] {
  const category = getActivityWorkoutCategory(activity);

  const terms: Record<ActivityWorkoutCategory, string[]> = {
    normal: ['normal run', 'regular run', '普通跑', '日常跑'],
    race: ['race', '比赛', '竞赛'],
    longRun: ['long run', 'long-run', 'lsd', '长跑', '长距离'],
    workout: ['workout', 'training', '训练', '质量课', '间歇', '节奏', '阈值'],
  };

  return terms[category];
}
