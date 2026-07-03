'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  HeartPulse,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import type { StravaActivity } from '@/types';
import { calculateTrainingLoadSummary, type TrainingLoadState } from '@/lib/trainingLoad';
import { getUserProfile } from '@/lib/userProfile';

interface TrainingLoadPanelProps {
  activities: StravaActivity[];
}

const STATE_STYLES: Record<TrainingLoadState, {
  icon: typeof Activity;
  text: string;
  soft: string;
  bar: string;
}> = {
  insufficient: {
    icon: Activity,
    text: 'text-zinc-600 dark:text-zinc-300',
    soft: 'bg-zinc-100 dark:bg-zinc-800',
    bar: 'bg-zinc-400',
  },
  recover: {
    icon: ShieldCheck,
    text: 'text-emerald-700 dark:text-emerald-300',
    soft: 'bg-emerald-50 dark:bg-emerald-950/35',
    bar: 'bg-emerald-500',
  },
  balanced: {
    icon: ShieldCheck,
    text: 'text-blue-700 dark:text-blue-300',
    soft: 'bg-blue-50 dark:bg-blue-950/35',
    bar: 'bg-blue-500',
  },
  building: {
    icon: TrendingUp,
    text: 'text-violet-700 dark:text-violet-300',
    soft: 'bg-violet-50 dark:bg-violet-950/35',
    bar: 'bg-violet-500',
  },
  high: {
    icon: TriangleAlert,
    text: 'text-rose-700 dark:text-rose-300',
    soft: 'bg-rose-50 dark:bg-rose-950/35',
    bar: 'bg-rose-500',
  },
};

export function TrainingLoadPanel({ activities }: TrainingLoadPanelProps) {
  const { t } = useTranslation();
  const [lthr, setLthr] = useState<number | null>(null);

  useEffect(() => {
    setLthr(getUserProfile()?.lthr ?? null);
  }, []);

  const summary = useMemo(
    () => calculateTrainingLoadSummary(activities, lthr),
    [activities, lthr]
  );
  const style = STATE_STYLES[summary.state];
  const StateIcon = style.icon;
  const maxLoad = Math.max(...summary.weeks.map((week) => week.load), 1);
  const changeText = summary.changePercent === null
    ? t('stats.loadNewBaseline', '暂无上周基线')
    : t('stats.loadVsLastWeek', '较上周 {{value}}%', {
        value: `${summary.changePercent >= 0 ? '+' : ''}${summary.changePercent}`,
      });
  const stateLabel = t(`stats.loadState.${summary.state}`);
  const stateHint = t(`stats.loadStateHint.${summary.state}`);

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(220px,0.72fr)_minmax(0,1.28fr)] lg:items-center">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HeartPulse size={16} className="text-rose-500" />
              <h2 className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {t('stats.trainingLoad', '训练负荷')}
              </h2>
            </div>
            <span className="font-mono text-[10px] text-zinc-400">
              {t('stats.last28Days', '近 28 天')}
            </span>
          </div>

          <div className="mt-4 flex items-end gap-3">
            <span className="font-mono text-4xl font-bold leading-none text-zinc-950 dark:text-zinc-50">
              {summary.current7DayLoad}
            </span>
            <span className="pb-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {t('stats.loadPoints7Days', '近 7 天负荷点')}
            </span>
          </div>
          <p className="mt-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {changeText} · {t('stats.loadWeeklyAverage', '前 3 周周均 {{value}}', { value: summary.averageWeeklyLoad })}
          </p>

          <div className={`mt-4 flex items-start gap-2 rounded-md px-3 py-2.5 ${style.soft}`}>
            <StateIcon size={16} className={`mt-0.5 shrink-0 ${style.text}`} />
            <div className="min-w-0">
              <p className={`font-mono text-xs font-bold ${style.text}`}>{stateLabel}</p>
              <p className="mt-0.5 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{stateHint}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="flex h-32 items-end gap-3 sm:gap-5">
            {summary.weeks.map((week, index) => {
              const height = week.load > 0 ? Math.max(10, Math.round((week.load / maxLoad) * 100)) : 3;
              return (
                <div key={week.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="font-mono text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
                    {week.load}
                  </span>
                  <div className="flex h-20 w-full max-w-16 items-end overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`w-full transition-[height] ${week.isCurrent ? style.bar : 'bg-zinc-300 dark:bg-zinc-600'}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className={`font-mono text-[10px] ${week.isCurrent ? 'font-bold text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}`}>
                    {week.isCurrent
                      ? t('stats.current7Days', '近 7 天')
                      : t('stats.weeksAgo', '前 {{count}} 周', { count: 3 - index })}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              {t('stats.heartRateCoverage', '心率覆盖 {{percent}}%', { percent: summary.heartRateCoverage })}
              {lthr ? ` · LTHR ${lthr}` : ` · ${t('stats.loadEstimated', '部分为估算')}`}
            </span>
            <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              {summary.latestRunDaysAgo === null
                ? t('stats.noRecentRun', '暂无记录')
                : summary.latestRunDaysAgo === 0
                  ? t('stats.ranToday', '今天有训练')
                  : t('stats.lastRunDaysAgo', '{{count}} 天前训练', { count: summary.latestRunDaysAgo })}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
