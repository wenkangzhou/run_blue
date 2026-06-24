'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { PageLoadingShell } from '@/components/PageLoadingShell';
import { TrainingPlanView } from '@/components/TrainingPlanView';
import { getStoredTrainingPlan, deleteTrainingPlan } from '@/lib/trainingPlan';
import { deleteGuestTrainingPlan, getGuestActivities, getGuestTrainingPlan, isGuestUser } from '@/lib/guestMode';
import type { TrainingPlan } from '@/lib/trainingPlan';
import { ChevronLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function TrainingPlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const isGuest = isGuestUser(user);
  const { t, i18n } = useTranslation();
  const storedActivities = useActivitiesStore((state) => state.activities);
  const activities = React.useMemo(
    () => (isGuest ? getGuestActivities() : storedActivities),
    [isGuest, storedActivities]
  );

  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [notFound, setNotFound] = useState(false);

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

    const id = params.id as string;
    setNotFound(false);
    if (isGuest) {
      const found = getGuestTrainingPlan(id, i18n.language);
      if (found) {
        setPlan(found);
      } else {
        setNotFound(true);
      }
      return () => {
        cancelled = true;
      };
    }

    getStoredTrainingPlan(id)
      .then((found) => {
        if (cancelled) return;
        if (found) {
          setPlan(found);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, isGuest, router, params.id, i18n.language]);

  if (authLoading || !isAuthenticated) {
    return <PageLoadingShell title={t('trainingPlan.title', '训练计划')} maxWidth="3xl" variant="plans" />;
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="container mx-auto px-4 py-4 max-w-3xl">
            <Link
              href="/plans"
              className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ChevronLeft size={16} />
              {t('common.back')}
            </Link>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-zinc-500">{t('trainingPlan.notFound', '计划不存在')}</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-pulse font-mono text-zinc-400">◼◼◼ {t('common.loading')} ◼◼◼</div>
      </div>
    );
  }

  const handleDelete = async () => {
    if (confirm(t('trainingPlan.deleteConfirm', '确定删除这个训练计划吗？'))) {
      if (isGuest) {
        deleteGuestTrainingPlan(plan.id);
      } else {
        await deleteTrainingPlan(plan.id);
      }
      router.push('/plans');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-3xl flex items-center justify-between">
          <Link
            href="/plans"
            className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </Link>

          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1 px-3 py-1.5 font-mono text-xs font-bold uppercase border-2 border-zinc-200 dark:border-zinc-700 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">{t('common.delete')}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-3 py-5 max-w-3xl">
        <TrainingPlanView plan={plan} activities={activities} />
      </div>
    </div>
  );
}
