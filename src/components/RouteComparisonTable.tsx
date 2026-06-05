'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { StravaActivity } from '@/types';
import { formatDistance, formatPace, formatDate } from '@/lib/strava';
import { getActivityTimestamp } from '@/lib/dates';
import { MiniMap } from './map/MiniMap';
import { Scissors, TrendingUp } from 'lucide-react';

interface RouteComparisonTableProps {
  activities: StravaActivity[];
  onSplitActivity?: (activity: StravaActivity) => void;
}

export function RouteComparisonTable({ activities, onSplitActivity }: RouteComparisonTableProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (activities.length === 0) return null;

  const sorted = [...activities].sort(
    (a, b) => getActivityTimestamp(b) - getActivityTimestamp(a)
  );

  // Find best pace
  let bestPace = Infinity;
  for (const a of sorted) {
    if (a.distance > 0 && a.moving_time > 0) {
      const pace = a.moving_time / (a.distance / 1000);
      if (pace < bestPace) bestPace = pace;
    }
  }

  const getActivityPace = (activity: StravaActivity) => (
    activity.distance > 0 && activity.moving_time > 0
      ? formatPace(activity.distance, activity.moving_time, 'min/km')
      : '--'
  );

  const isActivityBestPace = (activity: StravaActivity) => {
    const paceSecPerKm =
      activity.distance > 0
        ? activity.moving_time / (activity.distance / 1000)
        : 0;
    return paceSecPerKm > 0 && paceSecPerKm === bestPace;
  };

  const renderSplitButton = (activity: StravaActivity, compact = false) => {
    if (!onSplitActivity) return null;
    return (
      <button
        type="button"
        onClick={() => onSplitActivity(activity)}
        className={[
          'inline-flex items-center justify-center gap-1 border border-zinc-200 dark:border-zinc-700 font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors',
          compact ? 'px-2 py-1' : 'px-2 py-1',
        ].join(' ')}
        title={t('routes.splitActivity', '拆出为单独路线')}
      >
        <Scissors size={10} />
        {t('routes.splitShort', '拆出')}
      </button>
    );
  };

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {sorted.map((activity) => {
          const isBestPace = isActivityBestPace(activity);
          return (
            <div
              key={activity.id}
              className={[
                'overflow-hidden border-2 bg-white dark:bg-zinc-900',
                isBestPace
                  ? 'border-green-200 dark:border-green-900/70'
                  : 'border-zinc-200 dark:border-zinc-800',
              ].join(' ')}
            >
              <Link
                href={`/activities/${activity.id}`}
                className="block h-24 bg-zinc-100 dark:bg-zinc-800"
                title={activity.name}
              >
                <MiniMap
                  polyline={activity.map?.summary_polyline || null}
                  height="100%"
                />
              </Link>
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/activities/${activity.id}`}
                    className="min-w-0 font-mono text-xs font-bold hover:underline"
                  >
                    <span className="truncate block">{formatDate(activity.start_date_local, locale)}</span>
                    {isBestPace && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                        <TrendingUp size={10} />
                        {t('routes.bestPace', '最快配速')}
                      </span>
                    )}
                  </Link>
                  {renderSplitButton(activity, true)}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="border border-zinc-100 dark:border-zinc-800 px-2 py-2">
                    <p className="font-mono text-[10px] text-zinc-500">{t('stats.distance', '距离')}</p>
                    <p className="font-mono text-sm font-bold">{formatDistance(activity.distance, 'km')}</p>
                  </div>
                  <div className="border border-zinc-100 dark:border-zinc-800 px-2 py-2">
                    <p className="font-mono text-[10px] text-zinc-500">{t('routes.avgPace', '配速')}</p>
                    <p className={[
                      'font-mono text-sm font-bold',
                      isBestPace ? 'text-green-600 dark:text-green-400' : '',
                    ].join(' ')}>
                      {getActivityPace(activity)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b-2 border-zinc-200 dark:border-zinc-700">
              <th className="text-left py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500 w-16">
                {t('routes.routePreview', '路线')}
              </th>
              <th className="text-left py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500">
                {t('common.date', '日期')}
              </th>
              <th className="text-right py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500">
                {t('stats.distance', '距离')}
              </th>
              <th className="text-right py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500">
                {t('routes.avgPace', '配速')}
              </th>
              {onSplitActivity && (
                <th className="text-right py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500">
                  {t('common.actions', '操作')}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((activity) => {
              const isBestPace = isActivityBestPace(activity);

              return (
                <tr
                  key={activity.id}
                  className={`border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                    isBestPace ? 'bg-green-50 dark:bg-green-900/10' : ''
                  }`}
                >
                  <td className="py-1 px-2 w-16">
                    <Link
                      href={`/activities/${activity.id}`}
                      className="block rounded overflow-hidden border border-zinc-200 dark:border-zinc-700"
                      title={activity.name}
                    >
                      <MiniMap
                        polyline={activity.map?.summary_polyline || null}
                        height="36px"
                      />
                    </Link>
                  </td>
                  <td className="py-1 px-2 font-mono text-[11px] whitespace-nowrap">
                    <Link
                      href={`/activities/${activity.id}`}
                      className="flex items-center gap-1 hover:underline"
                    >
                      {isBestPace && (
                        <TrendingUp size={10} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                      )}
                      {formatDate(activity.start_date_local, locale)}
                    </Link>
                  </td>
                  <td className="py-1 px-2 font-mono text-[11px] text-right whitespace-nowrap">
                    <Link href={`/activities/${activity.id}`} className="hover:underline">
                      {formatDistance(activity.distance, 'km')}
                    </Link>
                  </td>
                  <td
                    className={`py-1 px-2 font-mono text-[11px] text-right whitespace-nowrap font-bold ${
                      isBestPace ? 'text-green-600 dark:text-green-400' : ''
                    }`}
                  >
                    <Link href={`/activities/${activity.id}`} className="hover:underline">
                      {getActivityPace(activity)}
                    </Link>
                  </td>
                  {onSplitActivity && (
                    <td className="py-1 px-2 text-right">
                      {renderSplitButton(activity)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
