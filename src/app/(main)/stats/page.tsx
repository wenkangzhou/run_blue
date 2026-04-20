'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore } from '@/store/activities';
import { getActivities } from '@/lib/strava';
import { VolumeDashboard } from '@/components/VolumeDashboard';
import { Loader2 } from 'lucide-react';

const MAX_LOAD_PAGES = 10; // Safety limit: 2000 activities max

export default function StatsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const {
    activities,
    isLoading: storeLoading,
    hasMore: storeHasMore,
    loadedPages,
    setActivities,
    appendActivities,
    setLoading,
    setError,
    setHasMore,
    setLoadedPages,
    setLastFetchedAt,
  } = useActivitiesStore();
  const [localLoading, setLocalLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState('');
  const hasInitiatedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.accessToken || hasInitiatedRef.current) {
      if (!isAuthenticated) router.push('/');
      return;
    }

    hasInitiatedRef.current = true;

    const loadAll = async () => {
      // Case 1: Store is empty — load page 1
      if (activities.length === 0) {
        setLocalLoading(true);
        setLoading(true);
        try {
          const data = await getActivities(user.accessToken, 1, 200);
          setActivities(data);
          setHasMore(data.length === 200);
          setLoadedPages(1);
          setLastFetchedAt(Date.now());

          // If there's more, continue loading
          if (data.length === 200) {
            await loadRemaining(2);
          }
        } catch (err) {
          console.error('Failed to load activities:', err);
          setError(t('errors.generic'));
        } finally {
          setLoading(false);
          setLocalLoading(false);
        }
        return;
      }

      // Case 2: Store has data but more pages available — continue loading
      if (storeHasMore && loadedPages > 0) {
        setLocalLoading(true);
        setLoading(true);
        try {
          await loadRemaining(loadedPages + 1);
        } catch (err) {
          console.error('Failed to load more activities:', err);
        } finally {
          setLoading(false);
          setLocalLoading(false);
        }
      }
    };

    const loadRemaining = async (startPage: number) => {
      let page = startPage;
      let hasMoreData = true;

      while (hasMoreData && page <= MAX_LOAD_PAGES) {
        setLoadProgress(t('common.loading') + ` (${page} ${t('stats.pages', '页')})`);
        const data = await getActivities(user.accessToken, page, 200);

        if (data.length === 0) {
          hasMoreData = false;
          break;
        }

        appendActivities(data);
        hasMoreData = data.length === 200;
        page++;
      }

      setHasMore(hasMoreData);
      setLoadedPages(page - 1);
      setLastFetchedAt(Date.now());
      setLoadProgress('');
    };

    loadAll();
  }, [isAuthenticated, user?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) return null;

  const isLoading = storeLoading || localLoading;

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
            {loadProgress || t('common.loading')}
          </div>
        </div>
      ) : activities.length === 0 ? (
        <div className="text-center py-16">
          <p className="font-mono text-zinc-500">{t('activity.noActivities')}</p>
        </div>
      ) : (
        <VolumeDashboard activities={activities} />
      )}

      {/* Loading more indicator */}
      {isLoading && activities.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-zinc-500 font-mono text-xs">
          <Loader2 size={14} className="animate-spin" />
          {loadProgress || t('common.loading')}
        </div>
      )}
    </div>
  );
}
