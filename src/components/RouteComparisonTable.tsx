'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { StravaActivity } from '@/types';
import { formatDistance, formatPace, formatDate, formatDuration } from '@/lib/strava';
import { getActivityTimestamp } from '@/lib/dates';
import { MiniMap } from './map/MiniMap';
import { CheckSquare, Clock3, Scissors, Square, TrendingUp } from 'lucide-react';

interface RouteComparisonTableProps {
  activities: StravaActivity[];
  onSplitActivity?: (activity: StravaActivity) => void;
  selectedActivityIds?: number[];
  onToggleActivitySelection?: (activity: StravaActivity) => void;
  onClearActivitySelection?: () => void;
  onSplitSelectedActivities?: () => void;
}

export function RouteComparisonTable({
  activities,
  onSplitActivity,
  selectedActivityIds = [],
  onToggleActivitySelection,
  onClearActivitySelection,
  onSplitSelectedActivities,
}: RouteComparisonTableProps) {
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
  const selectedCount = selectedActivityIds.length;
  const canSplitSelected = selectedCount > 0 && selectedCount < activities.length;
  const hasSelectionFlow = Boolean(onToggleActivitySelection);
  const selectionHint = selectedCount >= activities.length
    ? t('routes.cannotSplitAllActivities', '至少保留一条记录在当前路线')
    : selectedCount > 0
      ? t('routes.selectedActivitiesHint', '已选择 {{count}} 条记录，可拆成一个新的路线版本。', { count: selectedCount })
      : t('routes.selectActivitiesHint', '选择几条误归类记录，可以一次拆成新的路线版本。');

  const renderSelectButton = (activity: StravaActivity, withLabel = false) => {
    if (!onToggleActivitySelection) return null;
    const selected = selectedActivityIds.includes(activity.id);

    return (
      <button
        type="button"
        onClick={() => onToggleActivitySelection(activity)}
        aria-label={selected ? t('routes.unselectActivity', '取消选择') : t('routes.selectActivity', '选择这条记录')}
        className={[
          'inline-flex h-8 items-center justify-center gap-1 border transition-colors',
          withLabel ? 'px-2 font-mono text-[10px] font-bold' : 'w-8',
          selected
            ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
            : 'border-zinc-200 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
        ].join(' ')}
        title={selected ? t('routes.unselectActivity', '取消选择') : t('routes.selectActivity', '选择这条记录')}
      >
        {selected ? <CheckSquare size={14} /> : <Square size={14} />}
        {withLabel && (
          <span>{selected ? t('routes.selected', '已选') : t('routes.select', '选择')}</span>
        )}
      </button>
    );
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
      {hasSelectionFlow && (
        <div className="sticky top-[58px] z-10 mb-3 flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50/95 px-3 py-2 shadow-sm shadow-zinc-200/50 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
          <p className={[
            'font-mono text-[11px]',
            selectedCount >= activities.length
              ? 'text-amber-600 dark:text-amber-300'
              : 'text-zinc-500 dark:text-zinc-400',
          ].join(' ')}>
            {selectionHint}
          </p>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={onClearActivitySelection}
                className="inline-flex items-center justify-center border border-zinc-200 px-2 py-1 font-mono text-[10px] text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                {t('routes.clearSelection', '清空')}
              </button>
            )}
            <button
              type="button"
              onClick={onSplitSelectedActivities}
              disabled={!canSplitSelected}
              className="inline-flex items-center justify-center gap-1 border border-zinc-900 bg-zinc-900 px-2 py-1 font-mono text-[10px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
              title={selectedCount >= activities.length ? t('routes.cannotSplitAllActivities', '至少保留一条记录在当前路线') : undefined}
            >
              <Scissors size={11} />
              {selectedCount > 0
                ? t('routes.splitSelectedCount', '拆出 {{count}} 条', { count: selectedCount })
                : t('routes.splitSelectedActivities', '拆出选中')}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 sm:hidden">
        {sorted.map((activity) => {
          const isBestPace = isActivityBestPace(activity);
          const selected = selectedActivityIds.includes(activity.id);
          return (
            <div
              key={activity.id}
              className={[
                'overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-zinc-900',
                selected
                  ? 'border-blue-500 dark:border-blue-400'
                  : isBestPace
                    ? 'border-green-200 dark:border-green-900/70'
                    : 'border-zinc-200 dark:border-zinc-800',
              ].join(' ')}
            >
              <Link
                href={`/activities/${activity.id}`}
                className="block h-28 bg-zinc-100 dark:bg-zinc-800"
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
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {renderSelectButton(activity, true)}
                    {!hasSelectionFlow && renderSplitButton(activity, true)}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="font-mono text-[10px] text-zinc-500">{t('stats.distance', '距离')}</p>
                    <p className="font-mono text-sm font-bold">{formatDistance(activity.distance, 'km')}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="font-mono text-[10px] text-zinc-500">{t('routes.avgPace', '配速')}</p>
                    <p className={[
                      'font-mono text-sm font-bold',
                      isBestPace ? 'text-green-600 dark:text-green-400' : '',
                    ].join(' ')}>
                      {getActivityPace(activity)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="font-mono text-[10px] text-zinc-500">{t('activity.time', '时间')}</p>
                    <p className="truncate font-mono text-sm font-bold">{formatDuration(activity.moving_time)}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b-2 border-zinc-200 dark:border-zinc-700">
              {hasSelectionFlow && (
                <th className="w-14 py-1.5 px-2 text-left font-mono text-[10px] uppercase text-zinc-500">
                  {t('routes.select', '选择')}
                </th>
              )}
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
                {t('activity.time', '时间')}
              </th>
              <th className="text-right py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500">
                {t('routes.avgPace', '配速')}
              </th>
              {onSplitActivity && !hasSelectionFlow && (
                <th className="text-right py-1.5 px-2 font-mono text-[10px] uppercase text-zinc-500">
                  {t('common.actions', '操作')}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((activity) => {
              const isBestPace = isActivityBestPace(activity);
              const selected = selectedActivityIds.includes(activity.id);

              return (
                <tr
                  key={activity.id}
                  className={`border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                    selected ? 'bg-blue-50 dark:bg-blue-950/20' : isBestPace ? 'bg-green-50 dark:bg-green-900/10' : ''
                  }`}
                >
                  {hasSelectionFlow && (
                    <td className="py-1 px-2">
                      {renderSelectButton(activity)}
                    </td>
                  )}
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
                  <td className="py-1 px-2 font-mono text-[11px] text-right whitespace-nowrap">
                    <Link href={`/activities/${activity.id}`} className="inline-flex items-center justify-end gap-1 hover:underline">
                      <Clock3 size={10} className="text-zinc-400" />
                      {formatDuration(activity.moving_time)}
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
                  {onSplitActivity && !hasSelectionFlow && (
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
