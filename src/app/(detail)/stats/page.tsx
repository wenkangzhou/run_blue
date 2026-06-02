'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useActivitiesStore, isActivitiesCacheStale } from '@/store/activities';
import { loadRemainingActivities, syncRecentActivities } from '@/lib/activitySync';
import { VolumeDashboard } from '@/components/VolumeDashboard';
import { Loader2, ChevronLeft } from 'lucide-react';

const MAX_LOAD_PAGES = 10; // Safety limit for one automatic catch-up pass.

export default function StatsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const {
    activities,
    isLoading: storeLoading,
    loadedPages,
    lastFetchedAt,
    hasMore,
    setLoading,
    setError,
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
      // Case 1: Store is empty — load recent activities first
      if (activities.length === 0) {
        setLocalLoading(true);
        setLoading(true);
        try {
          await syncRecentActivities(user.accessToken, { force: true });
          if (useActivitiesStore.getState().hasMore) {
            await loadRemaining();
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

      // Case 2: Cache is stale — merge recent changes, keep historical cache
      if (isActivitiesCacheStale(lastFetchedAt)) {
        setLocalLoading(true);
        setLoading(true);
        try {
          await syncRecentActivities(user.accessToken, { force: true });
          if (useActivitiesStore.getState().hasMore) {
            await loadRemaining();
          }
        } catch (err) {
          console.error('Failed to reload activities:', err);
        } finally {
          setLoading(false);
          setLocalLoading(false);
        }
        return;
      }

      // Case 3: Store has data and cache is fresh — continue loading remaining pages only
      if (loadedPages > 0 && hasMore) {
        setLocalLoading(true);
        setLoading(true);
        try {
          await loadRemaining();
        } catch (err) {
          console.error('Failed to load more activities:', err);
        } finally {
          setLoading(false);
          setLocalLoading(false);
        }
      }
    };

    const loadRemaining = async () => {
      await loadRemainingActivities(user.accessToken, {
        maxPages: MAX_LOAD_PAGES,
        onProgress: ({ page }) => {
          setLoadProgress(t('common.loading') + ` (${page} ${t('stats.pages', '页')})`);
        },
      });
      setLoadProgress('');
    };

    loadAll();
  }, [isAuthenticated, user?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) return null;

  const isLoading = storeLoading || localLoading;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Minimal Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-2xl flex items-center justify-between">
          <Link
            href="/activities"
            className="inline-flex items-center gap-1 font-mono text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} />
            {t('common.back')}
          </Link>
          <h1 className="font-pixel text-base font-bold">{t('nav.stats', '统计')}</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="container mx-auto px-3 py-4 max-w-2xl">
        <p className="font-mono text-sm text-zinc-500 dark:text-zinc-400 mb-6">
          {t('stats.volumeComparisonDesc', '追踪你的跑步数据，按时间维度对比分析')}
        </p>

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
    </div>
  );
}
