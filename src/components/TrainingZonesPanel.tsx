'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge, HeartPulse, Timer } from 'lucide-react';
import type { StravaActivity } from '@/types';
import { formatPaceSeconds } from '@/lib/paceFormat';
import { formatSecondsToTime, getUserProfile, type UserProfile } from '@/lib/userProfile';
import {
  calculateTrainingZoneDistribution,
  resolveFiveKReference,
  type TrainingZoneDistributionItem,
  type TrainingZoneMode,
  type TrainingZonePeriod,
} from '@/lib/trainingZones';
import { useSessionPageState } from '@/hooks/useSessionPageState';

interface TrainingZonesPanelProps {
  activities: StravaActivity[];
}

const PERIODS: TrainingZonePeriod[] = ['7d', '30d', '90d', '180d', 'ytd', '365d'];
const ZONE_TONES: Record<string, { bar: string; text: string; soft: string }> = {
  z1: { bar: 'bg-sky-400', text: 'text-sky-700 dark:text-sky-300', soft: 'bg-sky-50 dark:bg-sky-950/30' },
  z2: { bar: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-300', soft: 'bg-teal-50 dark:bg-teal-950/30' },
  z3: { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', soft: 'bg-emerald-50 dark:bg-emerald-950/30' },
  z4: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', soft: 'bg-amber-50 dark:bg-amber-950/30' },
  z5: { bar: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300', soft: 'bg-orange-50 dark:bg-orange-950/30' },
  z6: { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300', soft: 'bg-rose-50 dark:bg-rose-950/30' },
};

function isZoneMode(value: unknown): value is TrainingZoneMode {
  return value === 'pace' || value === 'heartRate';
}

function isZonePeriod(value: unknown): value is TrainingZonePeriod {
  return typeof value === 'string' && PERIODS.includes(value as TrainingZonePeriod);
}

function formatZoneRange(zone: TrainingZoneDistributionItem, mode: TrainingZoneMode): string {
  if (mode === 'heartRate') {
    if (zone.id === 'z1') return `≤ ${zone.max} bpm`;
    if (zone.id === 'z5') return `≥ ${zone.min} bpm`;
    return `${zone.min}–${zone.max} bpm`;
  }
  if (zone.id === 'z1') return `> ${formatPaceSeconds(zone.min)}/km`;
  if (zone.id === 'z6') return `< ${formatPaceSeconds(zone.max)}/km`;
  return `${formatPaceSeconds(zone.min)}–${formatPaceSeconds(zone.max)}/km`;
}

function formatHours(seconds: number): string {
  if (seconds <= 0) return '0h';
  const hours = seconds / 3600;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

export function TrainingZonesPanel({ activities }: TrainingZonesPanelProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mode, setMode] = useSessionPageState<TrainingZoneMode>(
    'run_blue_page:stats:zone-mode',
    'pace',
    isZoneMode
  );
  const [period, setPeriod] = useSessionPageState<TrainingZonePeriod>(
    'run_blue_page:stats:zone-period',
    '90d',
    isZonePeriod
  );

  useEffect(() => {
    setProfile(getUserProfile());
  }, []);

  const fiveKReference = useMemo(
    () => resolveFiveKReference(profile?.pbs, activities),
    [activities, profile?.pbs]
  );
  const distribution = useMemo(() => calculateTrainingZoneDistribution({
    activities,
    mode,
    period,
    pb5kSeconds: fiveKReference?.seconds,
    lthr: profile?.lthr,
  }), [activities, fiveKReference?.seconds, mode, period, profile?.lthr]);
  const dominant = distribution.zones.find((zone) => zone.id === distribution.dominantZone) ?? null;
  const middlePercent = distribution.zones.find((zone) => zone.id === 'z3')?.percent ?? 0;
  const hasReference = mode === 'pace' ? Boolean(fiveKReference) : Boolean(profile?.lthr);

  const insightKey = !hasReference
    ? mode === 'pace' ? 'missingPaceReference' : 'missingHeartRateReference'
    : distribution.totalSeconds === 0
      ? 'noZoneData'
      : distribution.coveragePercent < 50
        ? 'lowCoverage'
        : distribution.qualityPercent > 25
          ? 'highQualityShare'
          : middlePercent > 35
            ? 'highMiddleShare'
            : distribution.lowIntensityPercent >= 70
              ? 'aerobicBase'
              : 'balancedMix';
  const sourceText = mode === 'pace'
    ? fiveKReference
      ? t(`stats.zoneReference.${fiveKReference.source}`, {
          value: formatSecondsToTime(fiveKReference.seconds),
        })
      : t('stats.zoneReference.nonePace')
    : profile?.lthr
      ? t('stats.zoneReference.lthr', { value: profile.lthr })
      : t('stats.zoneReference.noneHeartRate');

  return (
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
      <div className="border-b border-zinc-100 p-4 sm:p-5 dark:border-zinc-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Gauge size={17} className="text-blue-600 dark:text-blue-400" />
              <h2 className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50">
                {t('stats.trainingZones', '训练区间')}
              </h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {t('stats.trainingZonesHint', '按训练时长统计；当前使用活动平均值估算区间分布')}
            </p>
          </div>

          <div className="flex w-full gap-1 rounded-lg bg-zinc-100 p-1 lg:w-auto dark:bg-zinc-950">
            {(['pace', 'heartRate'] as TrainingZoneMode[]).map((value) => {
              const Icon = value === 'pace' ? Timer : HeartPulse;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 font-mono text-xs transition-colors lg:min-w-28 ${
                    mode === value
                      ? 'bg-white font-bold text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  <Icon size={14} />
                  {value === 'pace' ? t('stats.paceZones', '配速 Z1–Z6') : t('stats.heartRateZones', '心率 Z1–Z5')}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1 dark:bg-zinc-950">
          {PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              aria-pressed={period === value}
              className={`min-w-12 flex-1 whitespace-nowrap rounded-md px-2 py-1.5 font-mono text-[11px] transition-colors ${
                period === value
                  ? 'bg-blue-600 font-bold text-white shadow-sm dark:bg-blue-400 dark:text-zinc-950'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              {t(`stats.zonePeriod.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.25fr)_minmax(270px,0.75fr)]">
        <div className="space-y-3 p-4 sm:p-5">
          {distribution.zones.map((zone) => {
            const tone = ZONE_TONES[zone.id];
            const width = zone.percent > 0 ? Math.max(zone.percent, 2) : 0;
            return (
              <div key={zone.id} className="grid grid-cols-[34px_minmax(0,1fr)_42px] items-center gap-2.5">
                <div className={`flex size-8 items-center justify-center rounded-md font-mono text-xs font-black uppercase ${tone.soft} ${tone.text}`}>
                  {zone.id}
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                      {t(`stats.zoneName.${mode}.${zone.id}`)}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                      {formatZoneRange(zone, mode)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                    <div className={`h-full ${tone.bar}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">{zone.percent}%</p>
                  <p className={`font-mono text-[9px] ${zone.deltaPercent > 0 ? 'text-rose-500' : zone.deltaPercent < 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
                    {distribution.previousTotalSeconds > 0
                      ? `${zone.deltaPercent > 0 ? '+' : ''}${zone.deltaPercent}pp`
                      : '—'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/70 p-4 sm:p-5 xl:border-l xl:border-t-0 dark:border-zinc-800 dark:bg-zinc-950/45">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <p className="font-mono text-[10px] text-zinc-500">{t('stats.dominantZone', '主要区间')}</p>
              <p className="mt-1 font-mono text-lg font-black uppercase text-zinc-950 dark:text-zinc-50">
                {dominant?.id ?? '—'} {dominant ? `${dominant.percent}%` : ''}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-zinc-500">{t('stats.zoneTrainingTime', '覆盖时长')}</p>
              <p className="mt-1 font-mono text-lg font-black text-zinc-950 dark:text-zinc-50">
                {formatHours(distribution.totalSeconds)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-zinc-500">{t('stats.lowIntensityShare', '低强度')}</p>
              <p className="mt-1 font-mono text-base font-bold text-sky-700 dark:text-sky-300">
                {distribution.lowIntensityPercent}%
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] text-zinc-500">{t('stats.qualityShare', '质量区')}</p>
              <p className="mt-1 font-mono text-base font-bold text-orange-600 dark:text-orange-300">
                {distribution.qualityPercent}%
              </p>
            </div>
          </div>

          <div className="mt-5 border-l-2 border-blue-500 pl-3">
            <p className="font-mono text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">
              {t('stats.zoneObservation', '区间观察')}
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
              {t(`stats.zoneInsight.${insightKey}`, {
                coverage: distribution.coveragePercent,
                low: distribution.lowIntensityPercent,
                quality: distribution.qualityPercent,
                middle: middlePercent,
              })}
            </p>
          </div>

          <div className="mt-5 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{sourceText}</p>
            <p className="mt-1 font-mono text-[10px] text-zinc-400">
              {t('stats.zoneCoverage', '数据覆盖 {{covered}}/{{total}} 次 · {{percent}}%', {
                covered: distribution.coveredActivities,
                total: distribution.totalActivities,
                percent: distribution.coveragePercent,
              })}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
