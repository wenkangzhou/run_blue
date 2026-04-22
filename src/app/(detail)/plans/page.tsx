'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { TrainingPlanForm } from '@/components/TrainingPlanForm';
import { GeneratingOverlay } from '@/components/GeneratingOverlay';
import { PixelButton } from '@/components/ui';
import { getUserProfile, parseTimeToSeconds } from '@/lib/userProfile';
import {
  getStoredTrainingPlans,
  saveTrainingPlan,
  deleteTrainingPlan,
  type RaceDistance,
  type TrainingPlan,
} from '@/lib/trainingPlan';
import { Plus, Trash2, ChevronRight, Calendar, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function TrainingPlansListPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { activities } = useActivitiesStore();
  const { t, i18n } = useTranslation();

  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasPB, setHasPB] = useState(false);
  const [weeklyVolume, setWeeklyVolume] = useState(30);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
    setPlans(getStoredTrainingPlans());
    const profile = getUserProfile();
    setHasPB(!!profile?.pbs?.['5k'] && profile.pbs['5k'] > 0);

    if (activities.length > 0) {
      const now = new Date();
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      const recentRuns = activities.filter(
        (a) => a.type === 'Run' && new Date(a.start_date) >= fourWeeksAgo
      );
      const totalDist = recentRuns.reduce((sum, a) => sum + a.distance, 0);
      setWeeklyVolume(Math.round(totalDist / 4000));
    }
  }, [isAuthenticated, router, activities]);

  if (!isAuthenticated) return null;

  const isZh = i18n.language === 'zh';

  const distanceLabel = (d: RaceDistance) => {
    if (isZh) {
      return d === '5k' ? '5公里' : d === '10k' ? '10公里' : d === '21k' ? '半程马拉松' : '全程马拉松';
    }
    return d === '5k' ? '5K' : d === '10k' ? '10K' : d === '21k' ? 'Half Marathon' : 'Full Marathon';
  };

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

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
    const pb5k = profile?.pbs?.['5k'] || 1500;

    setLoading(true);
    setError('');
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch('/api/ai/plan', {
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
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }

      const json = await res.json();
      saveTrainingPlan(json.plan);
      setPlans(getStoredTrainingPlans());
      setShowForm(false);
      // Navigate to detail page
      router.push(`/plans/${json.plan.id}`);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError(isZh ? '已取消生成' : 'Generation cancelled');
      } else {
        setError(err.message || t('trainingPlan.generateError'));
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelGenerate = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleDelete = (id: string) => {
    if (confirm(t('trainingPlan.deleteConfirm', '确定删除这个训练计划吗？'))) {
      deleteTrainingPlan(id);
      setPlans(getStoredTrainingPlans());
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-2xl flex items-center justify-between">
          <div className="flex-1">
            <Link
              href="/activities"
              className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              {t('common.back')}
            </Link>
          </div>
          <h1 className="font-pixel text-base font-bold">{t('trainingPlan.title')}</h1>
          <div className="flex-1 flex justify-end">
            {plans.length > 0 && (
              <PixelButton variant="primary" size="sm" onClick={() => setShowForm((s) => !s)}>
                <span className="inline-flex items-center gap-1">
                  <Plus size={14} />
                  <span className="hidden sm:inline">{t('trainingPlan.create', '新建')}</span>
                </span>
              </PixelButton>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-3 py-4 max-w-2xl">
      {error && (
        <div className="mb-4 p-3 border-2 border-red-400 bg-red-50 dark:bg-red-950/30">
          <p className="font-mono text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {(showForm || plans.length === 0) && (
        <div className="mb-6 border-4 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 md:p-6">
          <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            {t('trainingPlan.description')}
          </p>
          <TrainingPlanForm hasPB={hasPB} onSubmit={handleGenerate} isLoading={loading} />
        </div>
      )}

      {plans.length > 0 && (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="group border-4 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 flex items-center justify-between gap-4 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
            >
              <Link href={`/plans/${plan.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-pixel text-sm font-bold">{distanceLabel(plan.goal.distance)}</span>
                  <span className="font-mono text-xs text-zinc-400">
                    {formatTime(plan.goal.targetTimeSeconds)} · {plan.weeks.length}{t('trainingPlan.weeksUnit')}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500">
                  {plan.goal.raceDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={10} />
                      {plan.goal.raceDate}
                    </span>
                  )}
                  <span>{new Date(plan.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>

              <div className="flex items-center gap-2">
                <Link
                  href={`/plans/${plan.id}`}
                  className="p-2 border-2 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ChevronRight size={16} />
                </Link>
                <button
                  onClick={() => handleDelete(plan.id)}
                  className="p-2 border-2 border-zinc-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-300 dark:hover:border-red-700 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <GeneratingOverlay isOpen={loading} onCancel={handleCancelGenerate} />
    </div>
    </div>
  );
}
