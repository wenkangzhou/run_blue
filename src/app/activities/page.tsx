'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { ActivityCard } from '@/components/ActivityCard';
import { PixelButton } from '@/components/ui';
import { StravaActivity } from '@/types';
import { getActivities } from '@/lib/strava';
import { Loader2 } from 'lucide-react';

export default function ActivitiesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const {
    activities,
    isLoading,
    error,
    page,
    hasMore,
    appendActivities,
    setLoading,
    setError,
    setPage,
    setHasMore,
  } = useActivitiesStore();

  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    if (activities.length === 0 && user?.accessToken) {
      loadActivities();
    } else {
      setInitialLoading(false);
    }
  }, [isAuthenticated, user]);

  const loadActivities = async () => {
    if (!user?.accessToken) return;

    setLoading(true);
    setError(null);

    try {
      const newActivities = await getActivities(user.accessToken, page, 20);
      
      if (newActivities.length === 0) {
        setHasMore(false);
      } else {
        appendActivities(newActivities);
        setPage(page + 1);
      }
    } catch (err) {
      setError(t('errors.stravaError'));
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  const loadMore = () => {
    loadActivities();
  };

  if (!isAuthenticated) {
    return null;
  }

  if (initialLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse font-mono text-xl flex items-center gap-2">
            <Loader2 className="animate-spin" />
            {t('common.loading')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-pixel text-3xl md:text-4xl font-bold">
          {t('activity.title')}
        </h1>
        <span className="font-mono text-sm text-zinc-500">
          {activities.length} {t('activity.title').toLowerCase()}
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 border-4 border-red-600 bg-red-50 dark:bg-red-950">
          <p className="font-mono text-red-600 dark:text-red-400">{error}</p>
          <PixelButton
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={loadActivities}
          >
            {t('common.retry')}
          </PixelButton>
        </div>
      )}

      {activities.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-mono text-zinc-500">{t('activity.noActivities')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {activities.map((activity: StravaActivity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 text-center">
              <PixelButton
                onClick={loadMore}
                isLoading={isLoading}
                disabled={isLoading}
              >
                {t('common.loading')}
              </PixelButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
