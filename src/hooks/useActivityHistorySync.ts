'use client';

import { useCallback, useRef, useState } from 'react';
import { ensureActivityHistory } from '@/lib/activitySync';

type ActivityHistorySyncOptions = NonNullable<Parameters<typeof ensureActivityHistory>[1]>;
type ActivityHistorySyncResult = Awaited<ReturnType<typeof ensureActivityHistory>>;

export type ActivityHistorySyncPhase = 'idle' | 'recent' | 'history' | 'complete';
export type ActivityHistorySyncErrorKind = 'auth' | 'rateLimit' | 'generic';

export interface ActivityHistorySyncProgress {
  phase: ActivityHistorySyncPhase;
  page: number | null;
  pagesLoaded: number;
  activitiesFetched: number;
}

export interface ActivityHistorySyncError {
  kind: ActivityHistorySyncErrorKind;
  message: string;
}

function getErrorKind(error: unknown): ActivityHistorySyncErrorKind {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('401') || message.includes('Unauthorized') || message.includes('auth_required')) {
    return 'auth';
  }
  if (message.includes('429')) return 'rateLimit';
  return 'generic';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'activity_history_sync_failed';
}

export function useActivityHistorySync(accessToken?: string | null) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<ActivityHistorySyncProgress | null>(null);
  const [error, setError] = useState<ActivityHistorySyncError | null>(null);
  const isSyncingRef = useRef(false);

  const reset = useCallback(() => {
    setProgress(null);
    setError(null);
  }, []);

  const syncHistory = useCallback(
    async (options: ActivityHistorySyncOptions = {}): Promise<ActivityHistorySyncResult | null> => {
      if (isSyncingRef.current) return null;

      if (!accessToken) {
        const authError = new Error('auth_required');
        setError({ kind: 'auth', message: authError.message });
        throw authError;
      }

      const { onProgress, onPageLoaded, ...restOptions } = options;
      let fetchedCount = 0;

      isSyncingRef.current = true;
      setIsSyncing(true);
      setError(null);
      setProgress({
        phase: 'recent',
        page: null,
        pagesLoaded: 0,
        activitiesFetched: 0,
      });

      try {
        const result = await ensureActivityHistory(accessToken, {
          ...restOptions,
          onProgress: (pageProgress) => {
            setProgress({
              phase: 'history',
              page: pageProgress.page,
              pagesLoaded: pageProgress.pagesLoaded,
              activitiesFetched: fetchedCount,
            });
            onProgress?.(pageProgress);
          },
          onPageLoaded: async (pageResult) => {
            fetchedCount += pageResult.activities.length;
            await onPageLoaded?.(pageResult);
            setProgress((currentProgress) => ({
              phase: 'history',
              page: pageResult.page,
              pagesLoaded: currentProgress?.pagesLoaded ?? 0,
              activitiesFetched: fetchedCount,
            }));
          },
        });

        const totalFetched = result.recent.activitiesFetched + result.remaining.activitiesFetched;
        setProgress({
          phase: 'complete',
          page: null,
          pagesLoaded: result.remaining.pagesLoaded,
          activitiesFetched: totalFetched,
        });
        return result;
      } catch (syncError) {
        setError({
          kind: getErrorKind(syncError),
          message: getErrorMessage(syncError),
        });
        throw syncError;
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [accessToken]
  );

  return {
    isSyncing,
    progress,
    error,
    syncHistory,
    reset,
  };
}
