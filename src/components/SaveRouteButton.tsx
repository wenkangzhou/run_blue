'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { StravaActivity } from '@/types';
import { useRoutesStore } from '@/store/routes';
import { useActivitiesStore } from '@/store/activities';
import { getRouteKey } from '@/lib/routeClustering';
import { MapPin, MapPinOff } from 'lucide-react';

interface SaveRouteButtonProps {
  activity: StravaActivity;
  variant?: 'icon' | 'button';
}

export function SaveRouteButton({ activity, variant = 'button' }: SaveRouteButtonProps) {
  const { t } = useTranslation();
  const { isRouteSaved, saveRoute, unsaveRoute } = useRoutesStore();
  const { activities } = useActivitiesStore();

  const routeKey = getRouteKey(activity);
  const saved = routeKey ? isRouteSaved(routeKey) : false;

  const handleToggle = () => {
    if (!routeKey) return;
    if (saved) {
      unsaveRoute(routeKey);
    } else {
      saveRoute(activity, activities);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleToggle}
        className={`p-2 border-2 transition-colors ${
          saved
            ? 'border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
            : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
        }`}
        title={saved ? t('routes.saved', '已收藏') : t('routes.save', '收藏路线')}
      >
        {saved ? <MapPin size={18} /> : <MapPinOff size={18} />}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border-2 transition-colors ${
        saved
          ? 'border-blue-600 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-400'
          : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
      }`}
    >
      {saved ? <MapPin size={14} /> : <MapPinOff size={14} />}
      <span>{saved ? t('routes.saved', '已收藏') : t('routes.save', '收藏路线')}</span>
    </button>
  );
}
