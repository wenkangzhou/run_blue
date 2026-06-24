import type { StravaActivity } from '@/types';
import type { TrainingPlan, TrainingSession } from '@/lib/trainingPlan';
import { getActivityDate } from '@/lib/dates';

export type SessionExecutionStatus = 'completed' | 'partial' | 'missed' | 'upcoming' | 'rest';

export interface SessionExecution {
  key: string;
  week: number;
  day: number;
  date: Date;
  dateKey: string;
  session: TrainingSession;
  status: SessionExecutionStatus;
  activity?: StravaActivity;
  dateDelta?: number;
  completionRatio: number;
}

export interface WeekExecution {
  week: number;
  startDate: Date;
  endDate: Date;
  sessions: SessionExecution[];
  plannedDistance: number;
  actualDistance: number;
  completedCount: number;
  dueCount: number;
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
  dueCount: number;
  plannedDueDistance: number;
  actualDueDistance: number;
  completionRate: number;
}

interface MatchCandidate {
  sessionIndex: number;
  activityIndex: number;
  score: number;
  dateDelta: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

function inferActivityKind(activity: StravaActivity): TrainingSession['type'] | 'workout' {
  const text = `${activity.name || ''} ${activity.description || ''}`.toLocaleLowerCase();
  if (activity.workout_type === 1 || /race|比赛|竞赛/.test(text)) return 'race';
  if (activity.workout_type === 2 || /long run|lsd|长距离|长跑/.test(text)) return 'long';
  if (/recovery|恢复跑|shakeout/.test(text)) return 'recovery';
  if (/interval|repeats|间歇|重复跑/.test(text)) return 'interval';
  if (/tempo|threshold|节奏|阈值/.test(text)) return 'tempo';
  if (activity.workout_type === 3 || (activity.laps?.length ?? 0) >= 4) return 'workout';
  return 'easy';
}

function getTypeScore(session: TrainingSession, activity: StravaActivity): number {
  const actualKind = inferActivityKind(activity);
  if (session.type === actualKind) return 34;
  if (session.type === 'interval' || session.type === 'tempo') {
    return actualKind === 'workout' || actualKind === 'interval' || actualKind === 'tempo' ? 24 : 0;
  }
  if (session.type === 'easy' || session.type === 'recovery') {
    return actualKind === 'easy' || actualKind === 'recovery' ? 22 : 0;
  }
  if (session.type === 'long' && activity.distance >= Math.max(12000, session.distance * 650)) {
    return 24;
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

export function calculateTrainingPlanExecution(
  plan: TrainingPlan,
  activities: StravaActivity[],
  now = new Date()
): TrainingPlanExecution {
  const today = startOfLocalDay(now);
  const planStartDate = getTrainingPlanStartDate(plan);
  const plannedSessions = plan.weeks.flatMap((week) =>
    week.sessions.map((session) => {
      const date = addDays(planStartDate, (week.week - 1) * 7 + session.day);
      return {
        key: `${week.week}-${session.day}`,
        week: week.week,
        day: session.day,
        date,
        dateKey: formatDateKey(date),
        session,
      };
    })
  );

  const runningActivities = activities
    .filter((activity) => activity.type === 'Run' || activity.sport_type === 'Run')
    .map((activity) => ({ activity, date: startOfLocalDay(getActivityDate(activity)) }));
  const candidates: MatchCandidate[] = [];

  plannedSessions.forEach((planned, sessionIndex) => {
    if (planned.session.type === 'rest') return;
    runningActivities.forEach(({ activity, date }, activityIndex) => {
      const dateDelta = differenceInCalendarDays(date, planned.date);
      if (Math.abs(dateDelta) > 1) return;
      const dateScore = dateDelta === 0 ? 70 : 32;
      candidates.push({
        sessionIndex,
        activityIndex,
        dateDelta,
        score: dateScore + getTypeScore(planned.session, activity) + getDistanceScore(planned.session, activity),
      });
    });
  });

  candidates.sort((left, right) => right.score - left.score);
  const matchedSessionIndexes = new Set<number>();
  const matchedActivityIndexes = new Set<number>();
  const matches = new Map<number, MatchCandidate>();

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

    const match = matches.get(index);
    const activity = match ? runningActivities[match.activityIndex].activity : undefined;
    const completionRatio = getCompletionRatio(planned.session, activity);
    const isFutureOrToday = planned.date.getTime() >= today.getTime();
    let status: SessionExecutionStatus;
    if (activity) {
      status = completionRatio >= 0.65 ? 'completed' : 'partial';
    } else {
      status = isFutureOrToday ? 'upcoming' : 'missed';
    }

    return {
      ...planned,
      status,
      activity,
      dateDelta: match?.dateDelta,
      completionRatio,
    };
  });

  const weeks: WeekExecution[] = plan.weeks.map((week) => {
    const weekSessions = sessions.filter((session) => session.week === week.week);
    const dueSessions = weekSessions.filter((session) =>
      session.session.type !== 'rest' && session.date.getTime() <= today.getTime()
    );
    return {
      week: week.week,
      startDate: addDays(planStartDate, (week.week - 1) * 7),
      endDate: addDays(planStartDate, (week.week - 1) * 7 + 6),
      sessions: weekSessions,
      plannedDistance: weekSessions.reduce((sum, session) => sum + (
        session.session.type === 'rest' ? 0 : session.session.distance
      ), 0),
      actualDistance: weekSessions.reduce((sum, session) => sum + (session.activity?.distance || 0) / 1000, 0),
      completedCount: dueSessions.filter((session) => session.status === 'completed').length,
      dueCount: dueSessions.length,
    };
  });

  const dueSessions = sessions.filter((session) =>
    session.session.type !== 'rest' && session.date.getTime() <= today.getTime()
  );
  const completedCount = dueSessions.filter((session) => session.status === 'completed').length;
  const partialCount = dueSessions.filter((session) => session.status === 'partial').length;
  const missedCount = dueSessions.filter((session) => session.status === 'missed').length;
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
    dueCount: dueSessions.length,
    plannedDueDistance: dueSessions.reduce((sum, session) => sum + session.session.distance, 0),
    actualDueDistance: dueSessions.reduce((sum, session) => sum + (session.activity?.distance || 0) / 1000, 0),
    completionRate: dueSessions.length > 0
      ? Math.round(((completedCount + partialCount * 0.5) / dueSessions.length) * 100)
      : 0,
  };
}
