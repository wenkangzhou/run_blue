'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BadgeCheck, ChartNoAxesCombined, Flame, Trophy } from 'lucide-react';
import type { StravaActivity } from '@/types';
import { getUserProfile, type UserProfile } from '@/lib/userProfile';
import {
  PERFORMANCE_DISTANCES,
  calculatePerformanceTrend,
  calculateVDOT,
  predictTimeFromVDOT,
  type PerformanceConfidence,
  type PerformanceDistance,
  type PerformanceEvidenceSource,
} from '@/lib/performanceTrend';
import { useSessionPageState } from '@/hooks/useSessionPageState';

interface PerformanceTrendPanelProps {
  activities: StravaActivity[];
}

type TrendRange = '90d' | '180d' | '365d';

const DISTANCES: PerformanceDistance[] = ['5k', '10k', '21k', '42k'];
const RANGES: Array<{ value: TrendRange; days: number }> = [
  { value: '90d', days: 90 },
  { value: '180d', days: 180 },
  { value: '365d', days: 365 },
];
const DAY_MS = 24 * 60 * 60 * 1000;

function isPerformanceDistance(value: unknown): value is PerformanceDistance {
  return typeof value === 'string' && DISTANCES.includes(value as PerformanceDistance);
}

function isTrendRange(value: unknown): value is TrendRange {
  return value === '90d' || value === '180d' || value === '365d';
}

function formatPerformanceTime(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || !Number.isFinite(totalSeconds)) return '—';
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatCompactDate(dateKey: string, locale: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return locale.startsWith('zh')
    ? `${date.getMonth() + 1}/${date.getDate()}`
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatEvidenceDistance(distanceMeters: number): string {
  const kilometers = distanceMeters / 1000;
  return `${kilometers >= 10 ? kilometers.toFixed(1) : kilometers.toFixed(2)} km`;
}

function getEvidenceLabel(source: PerformanceEvidenceSource, t: ReturnType<typeof useTranslation>['t']): string {
  return t(`stats.performanceEvidence.${source}`);
}

function getConfidenceTone(confidence: PerformanceConfidence): string {
  if (confidence === 'high') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-300';
  if (confidence === 'medium') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/35 dark:text-blue-300';
  return 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
}

export function PerformanceTrendPanel({ activities }: PerformanceTrendPanelProps) {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [distance, setDistance] = useSessionPageState<PerformanceDistance>(
    'run_blue_page:stats:performance-distance',
    '5k',
    isPerformanceDistance
  );
  const [range, setRange] = useSessionPageState<TrendRange>(
    'run_blue_page:stats:performance-range',
    '180d',
    isTrendRange
  );
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    setProfile(getUserProfile());
    setProfileReady(true);
  }, []);

  useEffect(() => {
    if (window.location.hash !== '#performance-trend') return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('performance-trend')?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [profileReady]);

  const trend = useMemo(() => calculatePerformanceTrend({
    activities,
    profilePBs: profile?.pbs,
    now,
  }), [activities, now, profile?.pbs]);
  const selectedSnapshots = trend.distanceSnapshots[distance];
  const rangeDays = RANGES.find((item) => item.value === range)?.days ?? 180;
  const rangeStart = now.getTime() - rangeDays * DAY_MS;
  const snapshots = selectedSnapshots.filter((snapshot) => snapshot.timestamp >= rangeStart);
  const latestSnapshot = selectedSnapshots[selectedSnapshots.length - 1] ?? null;
  const current = latestSnapshot && now.getTime() - latestSnapshot.timestamp <= 8 * DAY_MS
    ? latestSnapshot
    : null;
  const currentEstimate = current ? predictTimeFromVDOT(current.vdot, distance) : null;
  const comparisonTimestamp = (current?.timestamp ?? now.getTime()) - 28 * DAY_MS;
  const comparison = current
    ? [...selectedSnapshots].reverse().find((snapshot) => snapshot.timestamp <= comparisonTimestamp) ?? null
    : null;
  const comparisonEstimate = comparison ? predictTimeFromVDOT(comparison.vdot, distance) : null;
  const improvementSeconds = currentEstimate && comparisonEstimate
    ? comparisonEstimate - currentEstimate
    : null;
  const record = trend.records[distance];
  const recordEvents = trend.recordEvents[distance].filter((event) => event.timestamp >= rangeStart);

  const chartData = snapshots.map((snapshot, index) => {
    const previousTimestamp = index === 0 ? rangeStart : snapshots[index - 1].timestamp;
    const event = [...recordEvents]
      .reverse()
      .find((candidate) => candidate.timestamp > previousTimestamp && candidate.timestamp <= snapshot.timestamp);
    const recordVDOT = event
      ? calculateVDOT(PERFORMANCE_DISTANCES[distance].meters, event.durationSeconds)
      : null;
    return {
      date: snapshot.date,
      vdot: snapshot.vdot,
      recordVDOT,
      estimate: predictTimeFromVDOT(snapshot.vdot, distance),
      confidence: snapshot.confidence,
      evidenceCount: snapshot.evidenceCount,
      recordTime: event?.durationSeconds ?? null,
    };
  });
  const isCurrentStale = current ? current.latestEvidenceDays > 28 : true;
  const currentEvidence = current?.evidence ?? [];

  return (
    <section id="performance-trend" className="scroll-mt-28 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
      <div className="border-b border-zinc-100 p-4 sm:p-5 dark:border-zinc-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ChartNoAxesCombined size={17} className="text-blue-600 dark:text-blue-400" />
              <h2 className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50">
                {t('stats.performanceTrend', '能力与成绩趋势')}
              </h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {t('stats.performanceTrendHint', '真实 PB 保留原始成绩；各距离只采用最近 84 天内、距离要求匹配的有效表现。')}
            </p>
          </div>

          <div className="grid grid-cols-4 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-950">
            {DISTANCES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDistance(value)}
                aria-pressed={distance === value}
                className={`min-w-14 rounded-md px-2 py-2 font-mono text-[11px] transition-colors ${distance === value
                  ? 'bg-white font-bold text-blue-600 shadow-sm dark:bg-zinc-800 dark:text-blue-300'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {t(`stats.performanceDistance.${value}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!profileReady ? (
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="h-36 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-56 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        </div>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[250px_minmax(0,1fr)]">
          <div className="border-b border-zinc-100 p-4 sm:p-5 lg:border-b-0 lg:border-r dark:border-zinc-800">
            <p className="font-mono text-[10px] uppercase text-zinc-500 dark:text-zinc-400">
              {t('stats.currentAbilityEstimate', '当前能力估算')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-4xl font-black leading-none text-zinc-950 dark:text-zinc-50">
                {formatPerformanceTime(currentEstimate)}
              </span>
              {current && (
                <span className={`rounded-md border px-2 py-1 font-mono text-[10px] font-bold ${getConfidenceTone(current.confidence)}`}>
                  {t(`stats.performanceConfidence.${current.confidence}`)}
                </span>
              )}
            </div>

            <p className={`mt-2 font-mono text-xs font-bold ${
              improvementSeconds === null || Math.abs(improvementSeconds) < 2
                ? 'text-zinc-400'
                : improvementSeconds > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
            }`}>
              {current === null
                ? t('stats.performanceEstimateUnavailable', '暂无足够依据，暂不估算')
                : improvementSeconds === null
                ? t('stats.performanceNoComparison', '等待形成四周对比')
                : Math.abs(improvementSeconds) < 2
                  ? t('stats.performanceStable', '较四周前基本持平')
                  : improvementSeconds > 0
                    ? t('stats.performanceImproved', '较四周前提升约 {{value}}', { value: formatPerformanceTime(improvementSeconds) })
                    : t('stats.performanceDeclined', '较四周前回落约 {{value}}', { value: formatPerformanceTime(Math.abs(improvementSeconds)) })}
            </p>

            <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <Trophy size={14} className="text-amber-500" />
                  {t('stats.actualPB', '真实 PB')}
                </span>
                <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {formatPerformanceTime(record?.durationSeconds)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <Activity size={14} className="text-blue-500" />
                  {t('stats.validEvidence', '近期有效证据')}
                </span>
                <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  {current?.evidenceCount ?? 0} {t('stats.itemsUnit', '项')}
                </span>
              </div>
              {currentEvidence.slice(0, 3).map((item) => (
                <Link
                  key={`${item.activityId}:${item.source}:${item.distanceMeters}`}
                  href={`/activities/${item.activityId}`}
                  className="block rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:border-blue-800 dark:hover:bg-blue-950/25"
                >
                  <span className="block font-mono text-[10px] text-zinc-400">
                    {getEvidenceLabel(item.source, t)} · {formatEvidenceDistance(item.distanceMeters)} · {formatPerformanceTime(item.durationSeconds)}
                  </span>
                  <span className="mt-1 block truncate font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    {item.activityName}
                    {item.heatAdjusted && (
                      <Flame size={12} className="ml-1.5 inline text-orange-500" />
                    )}
                  </span>
                </Link>
              ))}
              {currentEvidence.length > 3 && (
                <p className="text-right font-mono text-[10px] text-zinc-400">
                  {t('stats.additionalEvidence', '另有 {{count}} 项已纳入计算', { count: currentEvidence.length - 3 })}
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-5">
            <div className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="flex min-w-0 items-start gap-2">
                <BadgeCheck size={15} className="mt-0.5 shrink-0 text-orange-500" />
                <p className="min-w-0 font-mono text-[10px] leading-4 text-zinc-500 dark:text-zinc-400">
                  {current === null
                    ? t('stats.performanceNoRelevantEvidence', '近 84 天暂无足够距离的有效依据，暂不估算当前能力')
                    : isCurrentStale
                    ? t('stats.performanceStale', '近期缺少有效质量数据，当前估算置信度有限')
                    : recordEvents.length > 0
                      ? t('stats.performanceChartLegend', '蓝线为能力估算，橙点为真实成绩节点')
                      : t('stats.performanceProfileOnly', '蓝线为能力估算；档案 PB 因缺少日期单独显示')}
                </p>
              </div>
              <div className="grid w-full shrink-0 grid-cols-3 gap-1 rounded-md bg-zinc-100 p-1 sm:flex sm:w-auto dark:bg-zinc-950">
                {RANGES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setRange(item.value)}
                    className={`min-w-0 rounded px-2 py-1 font-mono text-[10px] sm:min-w-10 ${range === item.value
                      ? 'bg-white font-bold text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-500'
                    }`}
                  >
                    {t(`stats.performanceRange.${item.value}`)}
                  </button>
                ))}
              </div>
            </div>

            {chartData.length >= 2 ? (
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 8, bottom: 0, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value: string) => formatCompactDate(value, i18n.language)}
                      tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'monospace' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      dataKey="vdot"
                      domain={['dataMin - 1', 'dataMax + 1']}
                      tickFormatter={(value: number) => formatPerformanceTime(predictTimeFromVDOT(value, distance))}
                      tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'monospace' }}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                    />
                    <Tooltip
                      labelFormatter={(value) => String(value)}
                      formatter={(value, name) => {
                        const numericValue = Number(value);
                        if (name === t('stats.actualResult', '真实成绩')) {
                          return [formatPerformanceTime(predictTimeFromVDOT(numericValue, distance)), t('stats.actualResult', '真实成绩')];
                        }
                        return [formatPerformanceTime(predictTimeFromVDOT(numericValue, distance)), t('stats.abilityEstimate', '能力估算')];
                      }}
                      contentStyle={{
                        borderRadius: 6,
                        border: '1px solid #d4d4d8',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                    />
                    <Line
                      name={t('stats.abilityEstimate', '能力估算')}
                      type="monotone"
                      dataKey="vdot"
                      stroke="#2563eb"
                      strokeWidth={3}
                      dot={{ r: 2.5, fill: '#2563eb', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                    <Line
                      name={t('stats.actualResult', '真实成绩')}
                      type="linear"
                      dataKey="recordVDOT"
                      stroke="transparent"
                      strokeWidth={0}
                      dot={{ r: 4, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: '#f97316', stroke: '#fff', strokeWidth: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-60 items-center justify-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-6 text-center dark:border-zinc-800 dark:bg-zinc-950/50">
                <div>
                  <ChartNoAxesCombined size={22} className="mx-auto text-zinc-400" />
                  <p className="mt-2 font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    {t('stats.performanceEmptyTitle', '还没有形成能力曲线')}
                  </p>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {t('stats.performanceEmptyHint', '同步比赛、最佳成绩或达到个人 M 区以上的连续质量段后，这里会开始记录变化。')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
