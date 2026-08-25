'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarClock, CheckCircle2, CircleDashed, Target } from 'lucide-react';
import type { StravaActivity } from '@/types';
import type { TrainingPlan } from '@/lib/trainingPlan';
import { getStoredTrainingPlans } from '@/lib/trainingPlan';
import { getGuestTrainingPlans } from '@/lib/guestMode';
import { getActivityTrainingPlanContext } from '@/lib/trainingPlanExecution';

interface ActivityTrainingPlanCardProps {
  activity: StravaActivity;
  activities: StravaActivity[];
  isGuest: boolean;
}

function getFirstDescriptionLine(description: string) {
  return description
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? '';
}

function formatDistance(distance: number) {
  return Number.isInteger(distance) ? String(distance) : distance.toFixed(1);
}

function getSessionVolumeLabel(session: TrainingPlan['weeks'][number]['sessions'][number], isZh: boolean) {
  const total = `${formatDistance(session.distance)}km`;
  if (!session.workDistance) return `${total}${session.paceZone ? ` · ${session.paceZone}` : ''}`;
  const work = `${formatDistance(session.workDistance)}km${session.paceZone ? ` ${session.paceZone}` : ''}`;
  return isZh ? `全课约 ${total} · 主训练 ${work}` : `~${total} total · ${work} quality`;
}

function formatSessionDate(date: Date, locale: string, today = new Date()) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const reference = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((target.getTime() - reference.getTime()) / (24 * 60 * 60 * 1000));
  if (locale === 'zh') {
    if (days === 0) return '今天';
    if (days === 1) return '明天';
  } else {
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
  }
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

export function ActivityTrainingPlanCard({
  activity,
  activities,
  isGuest,
}: ActivityTrainingPlanCardProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === 'zh';
  const [plans, setPlans] = React.useState<TrainingPlan[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (isGuest) {
      setPlans(getGuestTrainingPlans(i18n.language));
      setLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    getStoredTrainingPlans()
      .then((storedPlans) => {
        if (!cancelled) setPlans(storedPlans);
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [i18n.language, isGuest]);

  const sourceActivities = React.useMemo(() => {
    if (activities.some((candidate) => candidate.id === activity.id)) {
      return activities.map((candidate) => candidate.id === activity.id ? activity : candidate);
    }
    return [...activities, activity];
  }, [activities, activity]);
  const context = React.useMemo(
    () => getActivityTrainingPlanContext(plans, sourceActivities, activity),
    [activity, plans, sourceActivities]
  );

  if (!loaded || (!context.matched && !context.next)) return null;

  const reference = context.matched ?? context.next!;
  const matchedSession = context.matched?.session;
  const nextSession = context.next?.session;
  const planHref = `/plans/${reference.plan.id}`;
  const nextHref = context.next
    ? `/plans/${context.next.plan.id}#plan-session-${context.next.session.key}`
    : planHref;
  const nextDescription = nextSession
    ? getFirstDescriptionLine(nextSession.session.description)
    : '';

  return (
    <section
      id="activity-training-plan"
      className="mt-5 scroll-mt-28 overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm dark:border-blue-900/70 dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between gap-3 border-b border-blue-100 px-4 py-3 dark:border-blue-900/50">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <Target size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="font-pixel text-sm font-bold text-zinc-950 dark:text-zinc-50">
              {t('trainingPlan.activityLinkTitle', '训练计划')}
            </h2>
            <p className="mt-0.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              {t('trainingPlan.activityLinkHint', '把这次跑步和接下来的安排连起来')}
            </p>
          </div>
        </div>
        <Link
          href={planHref}
          className="shrink-0 font-mono text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-300"
        >
          {t('trainingPlan.viewFullPlan', '完整计划')}
        </Link>
      </div>

      <div className={`grid ${matchedSession && nextSession ? 'md:grid-cols-[0.9fr_1.1fr]' : ''}`}>
        {matchedSession && (
          <div className="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2">
              {matchedSession.status === 'completed' ? (
                <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-300" />
              ) : (
                <CircleDashed size={15} className="text-amber-600 dark:text-amber-300" />
              )}
              <p className="font-mono text-[10px] font-bold uppercase text-zinc-500">
                {t('trainingPlan.matchedWorkout', '本次完成的周目标')}
              </p>
            </div>
            <h3 className="mt-2 font-pixel text-sm font-bold text-zinc-950 dark:text-zinc-50">
              {matchedSession.session.title}
            </h3>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('trainingPlan.planWeekSession', '第 {{week}} 周', { week: matchedSession.week })}
              {' · '}{getSessionVolumeLabel(matchedSession.session, isZh)}
              {' · '}{t('trainingPlan.actualDistance', '实际 {{distance}} km', { distance: (activity.distance / 1000).toFixed(1) })}
            </p>
          </div>
        )}

        {nextSession ? (
          <Link
            href={nextHref}
            className="group flex items-center justify-between gap-4 bg-blue-50/60 px-4 py-4 transition-colors hover:bg-blue-50 dark:bg-blue-950/15 dark:hover:bg-blue-950/25"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                <CalendarClock size={14} />
                {nextSession.week === context.next?.execution.currentWeek
                  ? t('trainingPlan.nextWeeklyTarget', '本周下一项')
                  : t('trainingPlan.nextWorkoutEntry', '下一次训练')}
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t('trainingPlan.recommendedOn', '建议')}{' '}{formatSessionDate(nextSession.date, i18n.language)}
                </span>
              </div>
              <h3 className="mt-2 font-pixel text-base font-bold text-zinc-950 dark:text-zinc-50">
                {nextSession.session.title}
              </h3>
              <p className="mt-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                {getSessionVolumeLabel(nextSession.session, isZh)}
              </p>
              {nextDescription && (
                <p className="mt-2 line-clamp-2 font-mono text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {nextDescription}
                </p>
              )}
            </div>
            <ArrowRight size={18} className="shrink-0 text-blue-600 transition-transform group-hover:translate-x-0.5 dark:text-blue-300" />
          </Link>
        ) : (
          <div className="px-4 py-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {t('trainingPlan.planCompleted', '这个计划已没有待完成训练')}
          </div>
        )}
      </div>
    </section>
  );
}
