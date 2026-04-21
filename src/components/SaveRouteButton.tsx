'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StravaActivity } from '@/types';
import { useRoutesStore } from '@/store/routes';
import { useActivitiesStore } from '@/store/activities';
import { getRouteKey } from '@/lib/routeClustering';
import { Bookmark, BookmarkCheck } from 'lucide-react';

interface SaveRouteButtonProps {
  activity: StravaActivity;
  variant?: 'icon' | 'button';
}

export function SaveRouteButton({ activity, variant = 'button' }: SaveRouteButtonProps) {
  const { t } = useTranslation();
  const { isActivitySaved, saveRoute, unsaveActivity } = useRoutesStore();
  const { activities } = useActivitiesStore();

  const routeKey = getRouteKey(activity);
  const saved = isActivitySaved(activity.id);
  const canSave = !!routeKey;

  const handleToggle = () => {
    if (!canSave) {
      console.warn('[SaveRouteButton] Cannot save: missing start_latlng', activity);
      return;
    }
    if (saved) {
      console.log('[SaveRouteButton] Unsaving activity', activity.id);
      unsaveActivity(activity.id);
    } else {
      console.log('[SaveRouteButton] Saving activity', activity.id, 'routeKey:', routeKey);
      // Ensure current activity is included in the search pool
      const pool = activities.some((a) => a.id === activity.id)
        ? activities
        : [...activities, activity];
      saveRoute(activity, pool);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleToggle}
        disabled={!canSave}
        className={`p-2 border-2 transition-colors ${
          !canSave
            ? 'border-zinc-100 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
            : saved
              ? 'border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
        }`}
        title={
          !canSave
            ? t('routes.cannotSave', '无法收藏：缺少位置数据')
            : saved
              ? t('routes.saved')
              : t('routes.save')
        }
      >
        {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={!canSave}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border-2 transition-colors ${
        !canSave
          ? 'border-zinc-100 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
          : saved
            ? 'border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-400'
            : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
      }`}
    >
      {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
      <span>
        {!canSave
          ? t('routes.cannotSave', '无法收藏')
          : saved
            ? t('routes.saved')
            : t('routes.save')}
      </span>
    </button>
  );
}
