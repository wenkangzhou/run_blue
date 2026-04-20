'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { VolumeDashboard } from '@/components/VolumeDashboard';
import { Loader2 } from 'lucide-react';

export default function StatsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { activities, isLoading } = useActivitiesStore();

  React.useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <div className="container mx-auto px-3 py-4">
      <div className="mb-6">
        <h1 className="font-pixel text-2xl font-bold">
          {t('stats.volumeComparison', '跑量对比')}
        </h1>
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {t('stats.volumeComparisonDesc', '追踪你的跑步数据，按时间维度对比分析')}
        </p>
      </div>

      {isLoading && activities.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse font-mono text-xl flex items-center gap-2">
            <Loader2 className="animate-spin" />
            {t('common.loading')}
          </div>
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-mono text-zinc-500">{t('activity.noActivities')}</p>
        </div>
      ) : (
        <VolumeDashboard activities={activities} />
      )}
    </div>
  );
}
