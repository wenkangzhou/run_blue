'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { TrainingPlanForm } from '@/components/TrainingPlanForm';
import { GeneratingOverlay } from '@/components/GeneratingOverlay';
import { PageLoadingShell } from '@/components/PageLoadingShell';
import { PixelButton } from '@/components/ui';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { getUserProfile, parseTimeToSeconds, type UserProfilePBs } from '@/lib/userProfile';
import { getActivityDate } from '@/lib/dates';
import {
  deleteGuestTrainingPlan,
  generateGuestTrainingPlan,
  getGuestActivities,
  getGuestTrainingPlans,
  isGuestUser,
  saveGuestTrainingPlan,
} from '@/lib/guestMode';
import { calculateTrainingPlanExecution } from '@/lib/trainingPlanExecution';
import {
  getDistanceLabel,
  getDistanceLabelEn,
  getStoredTrainingPlans,
  getRecommendedTargetTime,
  saveTrainingPlan,
  deleteTrainingPlan,
  type RaceDistance,
  type TrainingPlan,
} from '@/lib/trainingPlan';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flag,
  Gauge,
  Plus,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';

const DISTANCE_KM: Record<RaceDistance, number> = {
  '5k': 5,
  '10k': 10,
  '21k': 21.0975,
  '42k': 42.195,
};

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPace(secPerKm: number) {
  const rounded = Math.round(secPerKm);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

function getPlanDaysToRace(plan: TrainingPlan) {
  if (!plan.goal.raceDate) return null;
  const race = new Date(`${plan.goal.raceDate}T00:00:00`);
  const now = new Date();
  return Math.ceil((race.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getPlanPhasePreview(plan: TrainingPlan) {
  const counts = plan.weeks.reduce<Record<string, number>>((acc, week) => {
    acc[week.phase] = (acc[week.phase] ?? 0) + 1;
    return acc;
  }, {});
  return ['base', 'build', 'peak', 'taper', 'recovery']
    .filter((phase) => counts[phase])
    .map((phase) => ({ phase, count: counts[phase] }));
}

export default function TrainingPlansListPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const isGuest = isGuestUser(user);
  const { activities } = useActivitiesStore();
  const { t, i18n } = useTranslation();
  const confirmDialog = useConfirmDialog();

  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasPB, setHasPB] = useState(false);
  const [profilePBs, setProfilePBs] = useState<Partial<UserProfilePBs> | null>(null);
  const [weeklyVolume, setWeeklyVolume] = useState(30);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const sourceActivities = React.useMemo(
    () => (isGuest ? getGuestActivities() : activities),
    [activities, isGuest]
  );
  const planExecutions = React.useMemo(
    () => new Map(plans.map((plan) => [plan.id, calculateTrainingPlanExecution(plan, sourceActivities)])),
    [plans, sourceActivities]
  );

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      return () => {
        cancelled = true;
      };
    }

    if (!isAuthenticated) {
      router.push('/');
      return () => {
        cancelled = true;
      };
    }

    if (isGuest) {
      setPlans(getGuestTrainingPlans(i18n.language));
    } else {
      getStoredTrainingPlans()
        .then((storedPlans) => {
          if (!cancelled) setPlans(storedPlans);
        })
        .catch(() => {
          if (!cancelled) setPlans([]);
        });
    }

    const profile = getUserProfile();
    const effectivePBs = isGuest
      ? { '5k': 1500, '10k': null, '21k': null, '42k': null }
      : profile?.pbs ?? null;
    setProfilePBs(effectivePBs);
    setHasPB(Boolean(effectivePBs && Object.values(effectivePBs).some((value) => (
      typeof value === 'number' && value > 0
    ))));

    if (sourceActivities.length > 0) {
      const now = new Date();
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      const recentRuns = sourceActivities.filter(
        (a) => a.type === 'Run' && getActivityDate(a) >= fourWeeksAgo
      );
      const totalDist = recentRuns.reduce((sum, a) => sum + a.distance, 0);
      setWeeklyVolume(Math.round(totalDist / 4000));
    }

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, isGuest, router, sourceActivities, i18n.language]);

  if (authLoading || !isAuthenticated) {
    return <PageLoadingShell title={t('trainingPlan.title', '训练计划')} maxWidth="3xl" variant="plans" />;
  }

  const isZh = i18n.language === 'zh';

  const distanceLabel = (d: RaceDistance) => (
    isZh ? getDistanceLabel(d) : getDistanceLabelEn(d)
  );

  const handleGenerate = async (data: {
    distance: RaceDistance;
    targetTime: string;
    weeks: number;
    raceDate?: string;
  }) => {
    const targetSeconds = parseTimeToSeconds(data.targetTime);
    if (!targetSeconds || targetSeconds <= 0) {
      setError(t('trainingPlan.invalidTime'));
      return;
    }

    const profile = getUserProfile();
    const pb5k = getRecommendedTargetTime(
      isGuest ? { '5k': 1500 } : profile?.pbs,
      '5k'
    )?.seconds || 1500;

    setLoading(true);
    setError('');
    abortControllerRef.current = new AbortController();

    try {
      if (isGuest) {
        const plan = generateGuestTrainingPlan({
          distance: data.distance,
          targetTimeSeconds: targetSeconds,
          weeks: data.weeks,
          pb5kSec: pb5k,
          weeklyVolume,
          raceDate: data.raceDate,
          locale: i18n.language,
          lthr: profile?.lthr ?? 172,
        });
        saveGuestTrainingPlan(plan);
        setPlans(getGuestTrainingPlans(i18n.language));
        setShowForm(false);
        router.push(`/plans/${plan.id}`);
        return;
      }

      const res = await fetch('/api/training-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          distance: data.distance,
          targetTimeSeconds: targetSeconds,
          weeks: data.weeks,
          pb5kSec: pb5k,
          weeklyVolume,
          raceDate: data.raceDate,
          locale: i18n.language,
          lthr: profile?.lthr,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }

      const json = (await res.json()) as { plan: TrainingPlan };
      await saveTrainingPlan(json.plan);
      setPlans(await getStoredTrainingPlans());
      setShowForm(false);
      router.push(`/plans/${json.plan.id}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError(isZh ? '已取消生成' : 'Generation cancelled');
      } else {
        setError(err instanceof Error ? err.message : t('trainingPlan.generateError'));
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelGenerate = () => {
    abortControllerRef.current?.abort();
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: t('trainingPlan.deletePlanTitle'),
      message: t('trainingPlan.deleteConfirm'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;

    if (isGuest) {
      deleteGuestTrainingPlan(id);
      setPlans(getGuestTrainingPlans(i18n.language));
    } else {
      await deleteTrainingPlan(id);
      setPlans(await getStoredTrainingPlans());
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/activities"
            className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </Link>
          <h1 className="font-pixel text-base font-bold">{t('trainingPlan.title')}</h1>
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="inline-flex items-center gap-1 border-2 border-zinc-200 px-3 py-1.5 font-mono text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t('trainingPlan.create', '新建计划')}</span>
          </button>
        </div>
      </div>

      <main className="container mx-auto max-w-3xl px-3 py-5">
        <section className="mb-5 border-4 border-zinc-900 bg-white dark:border-zinc-100 dark:bg-zinc-950">
          <div className="border-b-2 border-zinc-100 px-4 py-4 dark:border-zinc-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-[10px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                  <Target size={12} />
                  {t('trainingPlan.workspace', '训练计划工作台')}
                </div>
                <h2 className="font-pixel text-xl font-bold text-zinc-950 dark:text-zinc-50">
                  {t('trainingPlan.libraryTitle', '把目标拆成每一周')}
                </h2>
                <p className="mt-2 max-w-xl font-mono text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {t('trainingPlan.librarySubtitle', '基于 PB、周跑量和比赛日期生成可执行的周期化训练计划。')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-56">
                <div className="border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                  <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.currentVolume', '近期周量')}</p>
                  <p className="font-mono text-lg font-bold">{weeklyVolume}km</p>
                </div>
                <div className="border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                  <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.savedPlans', '计划数')}</p>
                  <p className="font-mono text-lg font-bold">{plans.length}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-4 border-2 border-red-300 bg-red-50 px-3 py-3 dark:border-red-900/70 dark:bg-red-950/25">
            <p className="font-mono text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {(showForm || plans.length === 0) && (
          <section className="mb-5 border-2 border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-pixel text-sm font-bold">{t('trainingPlan.createPlanTitle', '创建新计划')}</h3>
                <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t('trainingPlan.createPlanHint', '先定目标，再让系统排出训练周期。')}
                </p>
              </div>
              {plans.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="font-mono text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  {t('common.cancel')}
                </button>
              )}
            </div>
            <TrainingPlanForm
              hasPB={hasPB}
              profilePBs={profilePBs}
              onSubmit={handleGenerate}
              isLoading={loading}
            />
          </section>
        )}

        {plans.length > 0 ? (
          <section className="space-y-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-pixel text-sm font-bold">{t('trainingPlan.savedPlanList', '已有计划')}</h3>
              <p className="font-mono text-[11px] text-zinc-500">
                {t('trainingPlan.sortedByNewest', '按创建时间排序')}
              </p>
            </div>
            {plans.map((plan) => {
              const targetPace = plan.goal.targetTimeSeconds / DISTANCE_KM[plan.goal.distance];
              const daysToRace = getPlanDaysToRace(plan);
              const phasePreview = getPlanPhasePreview(plan);
              const execution = planExecutions.get(plan.id);
              const nextSession = execution?.sessions.find((session) => session.status === 'upcoming');

              return (
                <article
                  key={plan.id}
                  className="group border-2 border-zinc-200 bg-white transition-colors hover:border-blue-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-600"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/plans/${plan.id}`} className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="font-pixel text-base font-bold text-zinc-950 dark:text-zinc-50">
                            {distanceLabel(plan.goal.distance)}
                          </span>
                          <span className="border border-zinc-200 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800">
                            {plan.weeks.length}{t('trainingPlan.weeksUnit')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.targetTime', '目标时间')}</p>
                            <p className="font-mono text-sm font-bold">{formatTime(plan.goal.targetTimeSeconds)}</p>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.targetPace', '目标配速')}</p>
                            <p className="font-mono text-sm font-bold">{formatPace(targetPace)}/km</p>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.raceDate', '比赛日期')}</p>
                            <p className="font-mono text-sm font-bold">{plan.goal.raceDate || '-'}</p>
                          </div>
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.daysToRace', '距离比赛')}</p>
                            <p className="font-mono text-sm font-bold">
                              {typeof daysToRace === 'number'
                                ? daysToRace >= 0
                                  ? t('trainingPlan.daysCount', '{{days}} 天', { days: daysToRace })
                                  : t('trainingPlan.racePassed', '已结束')
                                : '-'}
                            </p>
                          </div>
                        </div>
                      </Link>

                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          href={`/plans/${plan.id}`}
                          className="border-2 border-zinc-200 p-2 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                          title={t('common.view')}
                        >
                          <ChevronRight size={16} />
                        </Link>
                        <button
                          onClick={() => handleDelete(plan.id)}
                          className="border-2 border-zinc-200 p-2 transition-colors hover:border-red-300 hover:bg-red-50 dark:border-zinc-700 dark:hover:border-red-700 dark:hover:bg-red-950/30"
                          title={t('common.delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex h-2 overflow-hidden border border-zinc-100 dark:border-zinc-800">
                      {phasePreview.map(({ phase, count }) => (
                        <div
                          key={phase}
                          className={[
                            phase === 'base' ? 'bg-blue-500' : '',
                            phase === 'build' ? 'bg-orange-500' : '',
                            phase === 'peak' ? 'bg-red-500' : '',
                            phase === 'taper' ? 'bg-green-500' : '',
                            phase === 'recovery' ? 'bg-zinc-400' : '',
                          ].join(' ')}
                          style={{ width: `${(count / plan.weeks.length) * 100}%` }}
                        />
                      ))}
                    </div>
                    {execution && (
                      <div className="mt-3 border border-zinc-100 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-mono text-[10px] text-zinc-500">
                              {t('trainingPlan.executionProgress')}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                              {execution.dueCount > 0
                                ? t('trainingPlan.executionSummary', {
                                    completed: execution.completedCount,
                                    due: execution.dueCount,
                                    actual: Math.round(execution.actualDueDistance),
                                    planned: Math.round(execution.plannedDueDistance),
                                  })
                                : t('trainingPlan.noSessionsDue')}
                            </p>
                          </div>
                          <p className="shrink-0 font-mono text-lg font-black text-zinc-950 dark:text-zinc-50">
                            {execution.dueCount > 0
                              ? `${execution.completionRate}%`
                              : t('trainingPlan.notStarted')}
                          </p>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden bg-zinc-200 dark:bg-zinc-700">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${execution.completionRate}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {nextSession && (
                      <Link
                        href={`/plans/${plan.id}`}
                        className="mt-3 flex items-center justify-between gap-3 border border-blue-200 bg-blue-50 px-3 py-2.5 transition-colors hover:border-blue-400 dark:border-blue-900/60 dark:bg-blue-950/20"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-[9px] font-bold uppercase text-blue-600 dark:text-blue-300">
                            {t('trainingPlan.nextWorkoutEntry')}
                          </p>
                          <p className="mt-1 truncate font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {nextSession.session.title} · {nextSession.session.distance}km
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-[10px] text-zinc-500">
                            {new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', {
                              month: 'short',
                              day: 'numeric',
                            }).format(nextSession.date)}
                          </p>
                          <ChevronRight size={14} className="ml-auto mt-1 text-blue-600" />
                        </div>
                      </Link>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(plan.createdAt).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp size={11} />
                        {plan.currentAbility.weeklyVolume}km/w
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Gauge size={11} />
                        PB 5K {plan.currentAbility.pb5k ? formatTime(plan.currentAbility.pb5k) : '-'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Flag size={11} />
                        {t('trainingPlan.algorithmicPlan', '算法周期计划')}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : !showForm ? (
          <section className="border-2 border-dashed border-zinc-300 bg-white px-4 py-10 text-center dark:border-zinc-700 dark:bg-zinc-950">
            <Target size={34} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
            <p className="font-mono text-sm font-bold text-zinc-700 dark:text-zinc-300">
              {t('trainingPlan.emptyTitle', '还没有训练计划')}
            </p>
            <p className="mx-auto mt-2 max-w-sm font-mono text-xs leading-relaxed text-zinc-500">
              {t('trainingPlan.emptyHint', '创建一个目标赛事计划，开始按周推进训练。')}
            </p>
            <PixelButton className="mt-5" onClick={() => setShowForm(true)}>
              <Plus size={14} />
              {t('trainingPlan.create', '新建计划')}
            </PixelButton>
          </section>
        ) : null}

        <GeneratingOverlay isOpen={loading} onCancel={handleCancelGenerate} />
      </main>
    </div>
  );
}
