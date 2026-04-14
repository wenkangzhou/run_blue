'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { TrainingPlanView } from '@/components/TrainingPlanView';
import { getStoredTrainingPlan, deleteTrainingPlan } from '@/lib/trainingPlan';
import type { TrainingPlan } from '@/lib/trainingPlan';
import { ChevronLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function TrainingPlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();

  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }
    const id = params.id as string;
    const found = getStoredTrainingPlan(id);
    if (found) {
      setPlan(found);
    } else {
      setNotFound(true);
    }
  }, [isAuthenticated, router, params.id]);

  if (!isAuthenticated) return null;

  if (notFound) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="container mx-auto px-4 py-4 max-w-2xl">
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

  const handleDelete = () => {
    if (confirm(t('trainingPlan.deleteConfirm', '确定删除这个训练计划吗？'))) {
      deleteTrainingPlan(plan.id);
      router.push('/plans');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-2xl flex items-center justify-between">
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
      <div className="container mx-auto px-3 py-4 max-w-2xl">
        <TrainingPlanView plan={plan} />
      </div>
    </div>
  );
}
