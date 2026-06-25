'use client';

import React from 'react';
import { CalendarClock, Check, Link2Off, RotateCcw, SkipForward, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TrainingSessionExecutionOverride } from '@/lib/trainingPlan';
import type { SessionExecution } from '@/lib/trainingPlanExecution';
import { getActivityDate } from '@/lib/dates';
import { formatPaceSeconds } from '@/lib/paceFormat';
import type { StravaActivity } from '@/types';

interface TrainingSessionEditorProps {
  execution: SessionExecution;
  override?: TrainingSessionExecutionOverride;
  activities: StravaActivity[];
  usedActivityIds: Set<number>;
  onClose: () => void;
  onChange: (override: TrainingSessionExecutionOverride | null) => void | Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDayDistance(left: Date, right: Date) {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((leftUtc - rightUtc) / DAY_MS);
}

function formatActivityDate(activity: StravaActivity, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }).format(getActivityDate(activity));
}

function getActivityPace(activity: StravaActivity) {
  if (!activity.distance || !activity.moving_time) return '--';
  return `${formatPaceSeconds(activity.moving_time / (activity.distance / 1000))}/km`;
}

export function TrainingSessionEditor({
  execution,
  override,
  activities,
  usedActivityIds,
  onClose,
  onChange,
}: TrainingSessionEditorProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US';
  const [saving, setSaving] = React.useState(false);
  const dateFormatter = React.useMemo(() => new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  }), [locale]);

  const candidates = React.useMemo(() => activities
    .filter((activity) => (
      (activity.type === 'Run' || activity.sport_type === 'Run')
      && (!usedActivityIds.has(activity.id) || activity.id === execution.activity?.id)
      && Math.abs(calendarDayDistance(getActivityDate(activity), execution.date)) <= 7
    ))
    .sort((left, right) => {
      const leftDate = Math.abs(calendarDayDistance(getActivityDate(left), execution.date));
      const rightDate = Math.abs(calendarDayDistance(getActivityDate(right), execution.date));
      if (leftDate !== rightDate) return leftDate - rightDate;
      const leftDistance = Math.abs(left.distance - execution.session.distance * 1000);
      const rightDistance = Math.abs(right.distance - execution.session.distance * 1000);
      return leftDistance - rightDistance;
    })
    .slice(0, 12), [activities, execution, usedActivityIds]);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const save = async (next: TrainingSessionExecutionOverride | null) => {
    setSaving(true);
    try {
      await onChange(next);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const withTimestamp = (
    patch: Omit<TrainingSessionExecutionOverride, 'updatedAt'>
  ): TrainingSessionExecutionOverride => ({
    ...patch,
    updatedAt: new Date().toISOString(),
  });

  const dateOffsetDays = override?.dateOffsetDays ?? execution.dateOffsetDays;
  const preserveSchedule = dateOffsetDays ? { dateOffsetDays } : {};

  return (
    <div className="fixed inset-0 z-[10500] flex items-end justify-center p-3 sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/65 backdrop-blur-[2px]"
        onClick={onClose}
        tabIndex={-1}
        aria-hidden="true"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-editor-title"
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden border-2 border-zinc-900 bg-white shadow-[8px_8px_0_rgba(0,0,0,0.25)] dark:border-zinc-100 dark:bg-zinc-950"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase text-blue-600 dark:text-blue-300">
              {t('trainingPlan.adjustSession')}
            </p>
            <h2 id="session-editor-title" className="mt-1 font-pixel text-sm font-bold text-zinc-950 dark:text-zinc-50">
              {execution.session.title}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">
              {dateFormatter.format(execution.date)} · {execution.session.distance}km
              {execution.session.paceZone ? ` · ${execution.session.paceZone}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => save(null)}
              className="border border-zinc-200 px-3 py-2 text-left transition-colors hover:border-blue-300 dark:border-zinc-700"
            >
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-zinc-900 dark:text-zinc-100">
                <RotateCcw size={13} />
                {t('trainingPlan.restoreAutomaticMatch')}
              </span>
              <span className="mt-1 block font-mono text-[9px] leading-relaxed text-zinc-500">
                {t('trainingPlan.restoreAutomaticMatchHint')}
              </span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(withTimestamp({
                ...preserveSchedule,
                matchMode: 'none',
              }))}
              className="border border-zinc-200 px-3 py-2 text-left transition-colors hover:border-blue-300 dark:border-zinc-700"
            >
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-zinc-900 dark:text-zinc-100">
                <Link2Off size={13} />
                {t('trainingPlan.removeMatch')}
              </span>
              <span className="mt-1 block font-mono text-[9px] leading-relaxed text-zinc-500">
                {t('trainingPlan.removeMatchHint')}
              </span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(withTimestamp({
                ...preserveSchedule,
                skipped: true,
                matchMode: 'none',
              }))}
              className="border border-zinc-200 px-3 py-2 text-left transition-colors hover:border-zinc-400 dark:border-zinc-700"
            >
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-zinc-900 dark:text-zinc-100">
                <SkipForward size={13} />
                {t('trainingPlan.skipSession')}
              </span>
              <span className="mt-1 block font-mono text-[9px] leading-relaxed text-zinc-500">
                {t('trainingPlan.skipSessionHint')}
              </span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(withTimestamp({
                ...override,
                dateOffsetDays: dateOffsetDays + 1,
                skipped: false,
              }))}
              className="border border-zinc-200 px-3 py-2 text-left transition-colors hover:border-violet-300 dark:border-zinc-700"
            >
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-zinc-900 dark:text-zinc-100">
                <CalendarClock size={13} />
                {t('trainingPlan.deferOneDay')}
              </span>
              <span className="mt-1 block font-mono text-[9px] leading-relaxed text-zinc-500">
                {t('trainingPlan.deferOneDayHint', {
                  date: dateFormatter.format(new Date(execution.date.getTime() + DAY_MS)),
                })}
              </span>
            </button>
          </div>

          {dateOffsetDays > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => save(withTimestamp({
                ...override,
                dateOffsetDays: 0,
              }))}
              className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-bold text-violet-600 hover:underline dark:text-violet-300"
            >
              <RotateCcw size={11} />
              {t('trainingPlan.restoreOriginalDate', {
                date: dateFormatter.format(execution.originalDate),
              })}
            </button>
          )}

          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="font-mono text-xs font-bold text-zinc-950 dark:text-zinc-50">
                  {t('trainingPlan.chooseActivity')}
                </h3>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">
                  {t('trainingPlan.chooseActivityHint')}
                </p>
              </div>
              <span className="font-mono text-[10px] text-zinc-400">
                {candidates.length}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {candidates.map((activity) => {
                const selected = execution.activity?.id === activity.id;
                return (
                  <button
                    key={activity.id}
                    type="button"
                    disabled={saving}
                    onClick={() => save(withTimestamp({
                      ...preserveSchedule,
                      matchMode: 'manual',
                      activityId: activity.id,
                      skipped: false,
                    }))}
                    className={[
                      'flex w-full items-center justify-between gap-3 border px-3 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/25'
                        : 'border-zinc-200 hover:border-blue-300 dark:border-zinc-700',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {activity.name}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-500">
                        {formatActivityDate(activity, locale)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-xs font-bold">
                        {(activity.distance / 1000).toFixed(2)}km
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-500">
                        {getActivityPace(activity)}
                      </p>
                    </div>
                    {selected && <Check size={15} className="shrink-0 text-blue-600" />}
                  </button>
                );
              })}
              {candidates.length === 0 && (
                <p className="border border-dashed border-zinc-300 px-3 py-5 text-center font-mono text-[11px] text-zinc-500 dark:border-zinc-700">
                  {t('trainingPlan.noMatchCandidates')}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
