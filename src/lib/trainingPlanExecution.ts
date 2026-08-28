import type { StravaActivity } from '@/types';
import type { TrainingPlan, TrainingSession } from '@/lib/trainingPlan';
import { getActivityDate } from '@/lib/dates';

export type SessionExecutionStatus = 'completed' | 'partial' | 'missed' | 'upcoming' | 'rest' | 'skipped';

export interface SessionExecution {
  key: string;
  week: number;
  day: number;
  originalDate: Date;
  date: Date;
  weekStartDate: Date;
  weekEndDate: Date;
  dateKey: string;
  session: TrainingSession;
  status: SessionExecutionStatus;
  activity?: StravaActivity;
  actualDate?: Date;
  dateDelta?: number;
  dateOffsetDays: number;
  matchSource?: 'automatic' | 'manual';
  completionRatio: number;
}

export interface WeekActivityExecution {
  activity: StravaActivity;
  date: Date;
  dateKey: string;
  day: number;
  inferredType: TrainingSession['type'] | 'workout';
  matchedSessionKey?: string;
  matchedSessionType?: TrainingSession['type'];
  matchSource?: 'automatic' | 'manual';
}

export interface WeekExecution {
  week: number;
  startDate: Date;
  endDate: Date;
  isStarted: boolean;
  isCurrent: boolean;
  isClosed: boolean;
  sessions: SessionExecution[];
  activities: WeekActivityExecution[];
  plannedDistance: number;
  actualDistance: number;
  extraActivityCount: number;
  extraDistance: number;
  completedCount: number;
  partialCount: number;
  missedCount: number;
  skippedCount: number;
  dueCount: number;
  plannedDueDistance: number;
  actualDueDistance: number;
  plannedKeyCount: number;
  completedKeyCount: number;
}

export interface TrainingPlanExecution {
  planStartDate: Date;
  planEndDate: Date;
  currentWeek?: number;
  sessions: SessionExecution[];
  weeks: WeekExecution[];
  completedCount: number;
  partialCount: number;
  missedCount: number;
  skippedCount: number;
  dueCount: number;
  plannedDueDistance: number;
  actualDueDistance: number;
  completionRate: number;
}

export interface TrainingPlanSessionReference {
  plan: TrainingPlan;
  execution: TrainingPlanExecution;
  session: SessionExecution;
}

export interface ActivityTrainingPlanContext {
  matched?: TrainingPlanSessionReference;
  next?: TrainingPlanSessionReference;
}

export interface NextWeekAdjustment {
  type: 'not_started' | 'maintain' | 'reduce' | 'recover';
  multiplier: number;
  referenceWeek?: number;
  nextWeek?: number;
  suggestedDistance?: number;
}

interface MatchCandidate {
  sessionIndex: number;
  activityIndex: number;
  score: number;
  dateDelta: number;
}

interface RunningActivity {
  activity: StravaActivity;
  date: Date;
  week: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const UNLABELED_LONG_RUN_MIN_DISTANCE_METERS = 15_000;
const UNLABELED_LONG_RUN_MIN_MOVING_TIME_SECONDS = 90 * 60;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function differenceInCalendarDays(left: Date, right: Date): number {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((leftUtc - rightUtc) / DAY_MS);
}

function getNextMonday(date: Date): Date {
  const start = startOfLocalDay(date);
  const day = start.getDay();
  const daysUntilMonday = (8 - day) % 7;
  return addDays(start, daysUntilMonday);
}

export function getTrainingPlanStartDate(plan: TrainingPlan): Date {
  if (plan.goal.raceDate) {
    const raceDate = new Date(`${plan.goal.raceDate}T00:00:00`);
    return addDays(raceDate, -((plan.weeks.length - 1) * 7 + 6));
  }
  return getNextMonday(new Date(plan.createdAt));
}

export function inferActivityKind(activity: StravaActivity): TrainingSession['type'] | 'workout' {
  const text = `${activity.name || ''} ${activity.description || ''}`.toLocaleLowerCase();
  if (activity.workout_type === 1 || /race|比赛|竞赛/.test(text)) return 'race';
  if (activity.workout_type === 2 || /long run|lsd|长距离|长跑/.test(text)) return 'long';
  if (/recovery|恢复跑|shakeout/.test(text)) return 'recovery';
  if (/interval|repeats|间歇|重复跑/.test(text)) return 'interval';
  if (/tempo|threshold|节奏|阈值/.test(text)) return 'tempo';
  if (activity.workout_type === 3 || hasAlternatingWorkLaps(activity)) return 'workout';
  return 'easy';
}

function hasAlternatingWorkLaps(activity: StravaActivity): boolean {
  const laps = (activity.laps ?? []).filter((lap) => (
    lap.distance >= 300
    && lap.distance <= 2000
    && lap.moving_time >= 60
  ));
  if (laps.length < 5) return false;

  const paces = laps.map((lap) => lap.moving_time / (lap.distance / 1000));
  const fastIndices = paces.flatMap((pace, index) => {
    if (index === 0 || index === paces.length - 1) return [];
    const fasterThanPrevious = pace <= paces[index - 1] * 0.93;
    const fasterThanNext = pace <= paces[index + 1] * 0.93;
    return fasterThanPrevious && fasterThanNext ? [index] : [];
  });

  let longestAlternatingChain = 0;
  let currentChain = 0;
  let previousIndex = -10;
  fastIndices.forEach((index) => {
    currentChain = index - previousIndex === 2 ? currentChain + 1 : 1;
    longestAlternatingChain = Math.max(longestAlternatingChain, currentChain);
    previousIndex = index;
  });
  return longestAlternatingChain >= 3;
}

function isKeySession(session: TrainingSession): boolean {
  return ['long', 'tempo', 'interval', 'race'].includes(session.type);
}

function getTypeScore(session: TrainingSession, activity: StravaActivity): number {
  const actualKind = inferActivityKind(activity);
  if (session.type === actualKind) return 80;
  if (session.type === 'interval' || session.type === 'tempo') {
    return actualKind === 'workout' || actualKind === 'interval' || actualKind === 'tempo' ? 64 : 0;
  }
  if (session.type === 'easy' || session.type === 'recovery') {
    return actualKind === 'easy' || actualKind === 'recovery' ? 58 : 0;
  }
  if (
    session.type === 'long'
    && (
      activity.distance >= UNLABELED_LONG_RUN_MIN_DISTANCE_METERS
      || activity.moving_time >= UNLABELED_LONG_RUN_MIN_MOVING_TIME_SECONDS
    )
  ) {
    return 68;
  }
  return 0;
}

function getDistanceScore(session: TrainingSession, activity: StravaActivity): number {
  if (session.distance <= 0) return 10;
  const targetMeters = session.distance * 1000;
  const ratio = activity.distance / targetMeters;
  const closeness = Math.max(0, 1 - Math.abs(1 - ratio));
  return Math.round(closeness * 30);
}

function getCompletionRatio(session: TrainingSession, activity?: StravaActivity): number {
  if (!activity) return 0;
  if (session.distance > 0) return activity.distance / (session.distance * 1000);
  return activity.moving_time >= 20 * 60 ? 1 : activity.moving_time / (20 * 60);
}

function isSessionDue(session: SessionExecution, today: Date): boolean {
  if (session.session.type === 'rest') return false;
  if (session.weekStartDate.getTime() <= today.getTime()) return true;
  return session.status === 'completed'
    || session.status === 'partial'
    || session.status === 'skipped';
}

export function calculateTrainingPlanExecution(
  plan: TrainingPlan,
  activities: StravaActivity[],
  now = new Date()
): TrainingPlanExecution {
  const today = startOfLocalDay(now);
  const planStartDate = getTrainingPlanStartDate(plan);
  const plannedSessions = plan.weeks.flatMap((week) =>
    week.sessions.map((session) => {
      const key = `${week.week}-${session.day}`;
      const override = plan.executionOverrides?.[key];
      const originalDate = addDays(planStartDate, (week.week - 1) * 7 + session.day);
      const weekStartDate = addDays(planStartDate, (week.week - 1) * 7);
      const weekEndDate = addDays(weekStartDate, 6);
      const dateOffsetDays = override?.dateOffsetDays ?? 0;
      const date = addDays(originalDate, dateOffsetDays);
      return {
        key,
        week: week.week,
        day: session.day,
        originalDate,
        date,
        weekStartDate,
        weekEndDate,
        dateKey: formatDateKey(date),
        dateOffsetDays,
        override,
        session,
      };
    })
  );

  const runningActivities: RunningActivity[] = activities
    .filter((activity) => activity.type === 'Run' || activity.sport_type === 'Run')
    .map((activity) => {
      const date = startOfLocalDay(getActivityDate(activity));
      return {
        activity,
        date,
        week: Math.floor(differenceInCalendarDays(date, planStartDate) / 7) + 1,
      };
    })
    .filter(({ week }) => week >= 1 && week <= plan.weeks.length);
  const candidates: MatchCandidate[] = [];
  const manuallyMatchedActivityIndexes = new Set<number>();
  const manualMatches = new Map<number, MatchCandidate>();

  plannedSessions.forEach((planned, sessionIndex) => {
    const manualActivityId = planned.override?.matchMode === 'manual'
      ? planned.override.activityId
      : undefined;
    if (!manualActivityId) return;
    const activityIndex = runningActivities.findIndex(({ activity }) => activity.id === manualActivityId);
    if (activityIndex < 0 || manuallyMatchedActivityIndexes.has(activityIndex)) return;
    const dateDelta = differenceInCalendarDays(runningActivities[activityIndex].date, planned.date);
    manuallyMatchedActivityIndexes.add(activityIndex);
    manualMatches.set(sessionIndex, {
      sessionIndex,
      activityIndex,
      dateDelta,
      score: Number.MAX_SAFE_INTEGER,
    });
  });

  plannedSessions.forEach((planned, sessionIndex) => {
    if (
      planned.session.type === 'rest'
      || planned.override?.skipped
      || planned.override?.matchMode === 'none'
      || manualMatches.has(sessionIndex)
    ) return;
    runningActivities.forEach(({ activity, date, week }, activityIndex) => {
      if (manuallyMatchedActivityIndexes.has(activityIndex)) return;
      if (week !== planned.week) return;
      const dateDelta = differenceInCalendarDays(date, planned.date);
      const typeScore = getTypeScore(planned.session, activity);
      if (typeScore <= 0) return;
      const dateScore = Math.max(0, 12 - Math.abs(dateDelta) * 2);
      candidates.push({
        sessionIndex,
        activityIndex,
        dateDelta,
        score: typeScore + getDistanceScore(planned.session, activity) + dateScore,
      });
    });
  });

  candidates.sort((left, right) => (
    right.score - left.score
    || Math.abs(left.dateDelta) - Math.abs(right.dateDelta)
    || left.sessionIndex - right.sessionIndex
  ));
  const matchedSessionIndexes = new Set<number>();
  const matchedActivityIndexes = new Set<number>(manuallyMatchedActivityIndexes);
  const matches = new Map<number, MatchCandidate>(manualMatches);
  manualMatches.forEach((candidate) => {
    matchedSessionIndexes.add(candidate.sessionIndex);
  });

  candidates.forEach((candidate) => {
    if (matchedSessionIndexes.has(candidate.sessionIndex) || matchedActivityIndexes.has(candidate.activityIndex)) {
      return;
    }
    matchedSessionIndexes.add(candidate.sessionIndex);
    matchedActivityIndexes.add(candidate.activityIndex);
    matches.set(candidate.sessionIndex, candidate);
  });

  const sessions: SessionExecution[] = plannedSessions.map((planned, index) => {
    if (planned.session.type === 'rest') {
      return { ...planned, status: 'rest', completionRatio: 0 };
    }
    if (planned.override?.skipped) {
      return { ...planned, status: 'skipped', completionRatio: 0 };
    }

    const match = matches.get(index);
    const matchedRunningActivity = match ? runningActivities[match.activityIndex] : undefined;
    const activity = matchedRunningActivity?.activity;
    const completionRatio = getCompletionRatio(planned.session, activity);
    let status: SessionExecutionStatus;
    if (activity) {
      status = completionRatio >= 0.65 ? 'completed' : 'partial';
    } else {
      status = planned.weekEndDate.getTime() < today.getTime() ? 'missed' : 'upcoming';
    }

    return {
      ...planned,
      status,
      activity,
      actualDate: matchedRunningActivity?.date,
      dateDelta: match?.dateDelta,
      matchSource: activity ? (manualMatches.has(index) ? 'manual' : 'automatic') : undefined,
      completionRatio,
    };
  });

  const weeks: WeekExecution[] = plan.weeks.map((week) => {
    const weekSessions = sessions.filter((session) => session.week === week.week);
    const startDate = addDays(planStartDate, (week.week - 1) * 7);
    const endDate = addDays(startDate, 6);
    const isStarted = startDate.getTime() <= today.getTime();
    const isCurrent = today.getTime() >= startDate.getTime() && today.getTime() <= endDate.getTime();
    const isClosed = endDate.getTime() < today.getTime();
    const weekActivities = runningActivities.filter((item) => item.week === week.week);
    const matchedActivityIds = new Set(
      weekSessions.map((session) => session.activity?.id).filter((id): id is number => Boolean(id))
    );
    const matchedSessionByActivityId = new Map(
      weekSessions.flatMap((session) => session.activity
        ? [[session.activity.id, session] as const]
        : [])
    );
    const extraActivities = weekActivities.filter(({ activity }) => !matchedActivityIds.has(activity.id));
    const dueSessions = weekSessions.filter((session) => isSessionDue(session, today));
    const dueKeySessions = dueSessions.filter((session) => isKeySession(session.session));
    return {
      week: week.week,
      startDate,
      endDate,
      isStarted,
      isCurrent,
      isClosed,
      sessions: weekSessions,
      activities: weekActivities
        .map(({ activity, date }) => {
          const matchedSession = matchedSessionByActivityId.get(activity.id);
          return {
            activity,
            date,
            dateKey: formatDateKey(date),
            day: differenceInCalendarDays(date, startDate),
            inferredType: inferActivityKind(activity),
            matchedSessionKey: matchedSession?.key,
            matchedSessionType: matchedSession?.session.type,
            matchSource: matchedSession?.matchSource,
          } satisfies WeekActivityExecution;
        })
        .sort((left, right) => left.date.getTime() - right.date.getTime()
          || left.activity.start_date.localeCompare(right.activity.start_date)),
      plannedDistance: weekSessions.reduce((sum, session) => sum + (
        session.session.type === 'rest' ? 0 : session.session.distance
      ), 0),
      actualDistance: weekActivities.reduce((sum, { activity }) => sum + activity.distance / 1000, 0),
      extraActivityCount: extraActivities.length,
      extraDistance: extraActivities.reduce((sum, { activity }) => sum + activity.distance / 1000, 0),
      completedCount: dueSessions.filter((session) => session.status === 'completed').length,
      partialCount: dueSessions.filter((session) => session.status === 'partial').length,
      missedCount: dueSessions.filter((session) => session.status === 'missed').length,
      skippedCount: dueSessions.filter((session) => session.status === 'skipped').length,
      dueCount: dueSessions.length,
      plannedDueDistance: dueSessions.reduce((sum, session) => sum + session.session.distance, 0),
      actualDueDistance: isStarted
        ? weekActivities.reduce((sum, { activity }) => sum + activity.distance / 1000, 0)
        : 0,
      plannedKeyCount: dueKeySessions.length,
      completedKeyCount: dueKeySessions.filter((session) =>
        session.status === 'completed' || session.status === 'partial'
      ).length,
    };
  });

  const dueSessions = sessions.filter((session) => isSessionDue(session, today));
  const completedCount = dueSessions.filter((session) => session.status === 'completed').length;
  const partialCount = dueSessions.filter((session) => session.status === 'partial').length;
  const missedCount = dueSessions.filter((session) => session.status === 'missed').length;
  const skippedCount = dueSessions.filter((session) => session.status === 'skipped').length;
  const currentWeek = weeks.find((week) =>
    today.getTime() >= week.startDate.getTime() && today.getTime() <= week.endDate.getTime()
  )?.week;

  return {
    planStartDate,
    planEndDate: weeks.at(-1)?.endDate || planStartDate,
    currentWeek,
    sessions,
    weeks,
    completedCount,
    partialCount,
    missedCount,
    skippedCount,
    dueCount: dueSessions.length,
    plannedDueDistance: dueSessions.reduce((sum, session) => sum + session.session.distance, 0),
    actualDueDistance: weeks.reduce((sum, week) => sum + week.actualDueDistance, 0),
    completionRate: dueSessions.length > 0
      ? Math.round(((completedCount + partialCount * 0.5) / dueSessions.length) * 100)
      : 0,
  };
}

function compareSessionReferences(
  left: TrainingPlanSessionReference,
  right: TrainingPlanSessionReference
) {
  return left.session.date.getTime() - right.session.date.getTime()
    || right.plan.createdAt.localeCompare(left.plan.createdAt);
}

function getUpcomingSessionReferences(
  plans: TrainingPlan[],
  activities: StravaActivity[],
  now: Date
): TrainingPlanSessionReference[] {
  return plans.flatMap((plan) => {
    const execution = calculateTrainingPlanExecution(plan, activities, now);
    return execution.sessions
      .filter((session) => session.status === 'upcoming' && session.session.type !== 'rest')
      .map((session) => ({ plan, execution, session }));
  }).sort(compareSessionReferences);
}

export function getNextTrainingPlanSession(
  plans: TrainingPlan[],
  activities: StravaActivity[],
  now = new Date()
): TrainingPlanSessionReference | undefined {
  return getUpcomingSessionReferences(plans, activities, now)[0];
}

export function getActivityTrainingPlanContext(
  plans: TrainingPlan[],
  activities: StravaActivity[],
  activity: StravaActivity,
  now = new Date()
): ActivityTrainingPlanContext {
  const executions = plans.map((plan) => ({
    plan,
    execution: calculateTrainingPlanExecution(plan, activities, now),
  }));
  const matched = executions
    .flatMap(({ plan, execution }) => execution.sessions
      .filter((session) => session.activity?.id === activity.id)
      .map((session) => ({ plan, execution, session })))
    .sort((left, right) => {
      if (left.session.matchSource !== right.session.matchSource) {
        return left.session.matchSource === 'manual' ? -1 : 1;
      }
      return Math.abs(left.session.dateDelta ?? 0) - Math.abs(right.session.dateDelta ?? 0)
        || right.plan.createdAt.localeCompare(left.plan.createdAt);
    })[0];

  const upcoming = executions
    .flatMap(({ plan, execution }) => execution.sessions
      .filter((session) => session.status === 'upcoming' && session.session.type !== 'rest')
      .map((session) => ({ plan, execution, session })))
    .sort(compareSessionReferences);
  const next = matched
    ? upcoming.find((reference) => reference.plan.id === matched.plan.id) ?? upcoming[0]
    : upcoming[0];

  return { matched, next };
}

export function getNextWeekAdjustment(
  plan: TrainingPlan,
  execution: TrainingPlanExecution
): NextWeekAdjustment {
  const referenceWeekNumber = execution.weeks
    .filter((week) => week.isClosed && week.dueCount > 0)
    .at(-1)?.week;
  const referenceWeek = execution.weeks.find((week) => week.week === referenceWeekNumber);
  const nextWeek = referenceWeekNumber
    ? plan.weeks.find((week) => week.week === referenceWeekNumber + 1)
    : plan.weeks[0];

  if (!referenceWeek || referenceWeek.dueCount === 0) {
    return {
      type: 'not_started',
      multiplier: 1,
      referenceWeek: referenceWeekNumber,
      nextWeek: nextWeek?.week,
      suggestedDistance: nextWeek?.totalDistance,
    };
  }

  const earnedSessions = referenceWeek.completedCount + referenceWeek.partialCount * 0.5;
  const completionRate = earnedSessions / referenceWeek.dueCount;
  const distanceRate = referenceWeek.plannedDueDistance > 0
    ? referenceWeek.actualDueDistance / referenceWeek.plannedDueDistance
    : 1;

  let type: NextWeekAdjustment['type'] = 'maintain';
  let multiplier = 1;
  if (
    completionRate < 0.5
    || referenceWeek.missedCount >= 2
    || distanceRate > 1.25
  ) {
    type = 'recover';
    multiplier = 0.8;
  } else if (
    completionRate < 0.75
    || distanceRate < 0.75
    || referenceWeek.skippedCount > 0
  ) {
    type = 'reduce';
    multiplier = 0.9;
  }

  return {
    type,
    multiplier,
    referenceWeek: referenceWeek.week,
    nextWeek: nextWeek?.week,
    suggestedDistance: nextWeek
      ? Math.round(nextWeek.totalDistance * multiplier)
      : undefined,
  };
}
