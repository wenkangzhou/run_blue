'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge, HeartPulse, Timer } from 'lucide-react';
import type { ActivityStream, StravaActivity } from '@/types';
import { useSessionPageState } from '@/hooks/useSessionPageState';
import { formatPaceSeconds } from '@/lib/paceFormat';
import { formatSecondsToTime, getUserProfile, type UserProfile } from '@/lib/userProfile';
import {
  calculateActivityTrainingZoneDistribution,
  resolveFiveKReference,
  type TrainingZoneMode,
} from '@/lib/trainingZones';

interface ActivityTrainingZonesCardProps {
  activity: StravaActivity;
  activities: StravaActivity[];
  streams: Record<string, ActivityStream> | null;
}

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

function formatZoneRange(min: number, max: number, id: string, mode: TrainingZoneMode): string {
  if (mode === 'heartRate') {
    if (id === 'z1') return `≤ ${max} bpm`;
    if (id === 'z5') return `≥ ${min} bpm`;
    return `${min}–${max} bpm`;
  }
  if (id === 'z1') return `> ${formatPaceSeconds(min)}/km`;
  if (id === 'z6') return `< ${formatPaceSeconds(max)}/km`;
  return `${formatPaceSeconds(min)}–${formatPaceSeconds(max)}/km`;
}

function formatZoneTime(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

export function ActivityTrainingZonesCard({
  activity,
  activities,
  streams,
}: ActivityTrainingZonesCardProps) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mode, setMode] = useSessionPageState<TrainingZoneMode>(
    'run_blue_page:activity:zone-mode',
    'pace',
    isZoneMode
  );

  useEffect(() => {
    setProfile(getUserProfile());
  }, []);

  const fiveKReference = useMemo(
    () => resolveFiveKReference(profile?.pbs, activities),
    [activities, profile?.pbs]
  );
  const distribution = useMemo(() => calculateActivityTrainingZoneDistribution({
    activity,
    streams,
    mode,
    pb5kSeconds: fiveKReference?.seconds,
    lthr: profile?.lthr,
  }), [activity, fiveKReference?.seconds, mode, profile?.lthr, streams]);
  const dominant = distribution.zones.find((zone) => zone.id === distribution.dominantZone) ?? null;
  const hasReference = mode === 'pace' ? Boolean(fiveKReference) : Boolean(profile?.lthr);
  const sourceLabel = t(`activity.zoneSource.${distribution.source}`);
  const referenceLabel = mode === 'pace'
    ? fiveKReference
      ? t(`stats.zoneReference.${fiveKReference.source}`, {
          value: formatSecondsToTime(fiveKReference.seconds),
        })
      : t('stats.zoneReference.nonePace')
    : profile?.lthr
      ? t('stats.zoneReference.lthr', { value: profile.lthr })
      : t('stats.zoneReference.noneHeartRate');

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-100 p-4 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Gauge size={15} className="shrink-0 text-blue-600 dark:text-blue-400" />
              <h2 className="font-mono text-xs font-bold uppercase text-zinc-600 dark:text-zinc-300">
                {t('activity.trainingZones', '本次训练区间')}
              </h2>
            </div>
            <p className="mt-1 font-mono text-[10px] leading-4 text-zinc-400">
              {t('activity.trainingZonesHint', '按运动流中的有效训练时长统计')}
            </p>
          </div>
          {distribution.source !== 'unavailable' && (
            <span className={`shrink-0 rounded-md px-2 py-1 font-mono text-[10px] font-bold ${
              distribution.source === 'stream' || distribution.source === 'splits'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
            }`}>
              {sourceLabel}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-950">
          {(['pace', 'heartRate'] as const).map((value) => {
            const Icon = value === 'pace' ? Timer : HeartPulse;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 font-mono text-[11px] transition-colors ${
                  mode === value
                    ? 'bg-white font-bold text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Icon size={13} />
                <span className="truncate">
                  {value === 'pace' ? t('stats.paceZones', '配速 Z1–Z6') : t('stats.heartRateZones', '心率 Z1–Z5')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!hasReference || distribution.totalSeconds === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="font-mono text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {!hasReference
              ? referenceLabel
              : t(`activity.zoneEmpty.${mode}`, '当前活动没有可用于区间统计的数据')}
          </p>
        </div>
      ) : (
        <>
          {dominant && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 bg-zinc-50 px-4 py-3 dark:bg-zinc-950/50">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase text-zinc-400">
                  {t('activity.dominantZone', '主要位于')}
                </p>
                <p className="mt-1 truncate font-mono text-base font-black text-zinc-950 dark:text-zinc-50">
                  {dominant.id.toUpperCase()} · {t(`stats.zoneName.${mode}.${dominant.id}`)}
                </p>
              </div>
              <p className="font-mono text-2xl font-black text-blue-600 dark:text-blue-400">
                {dominant.percent}%
              </p>
            </div>
          )}

          <div className="space-y-3 p-4">
            {distribution.zones.map((zone) => {
              const tone = ZONE_TONES[zone.id];
              return (
                <div key={zone.id} className="grid grid-cols-[32px_minmax(0,1fr)_48px] items-center gap-2.5">
                  <div className={`flex size-8 items-center justify-center rounded-md font-mono text-[11px] font-black uppercase ${tone.soft} ${tone.text}`}>
                    {zone.id}
                  </div>
                  <div className="min-w-0">
                    <div className="mb-1.5 flex min-w-0 items-baseline justify-between gap-2">
                      <p className="truncate font-mono text-[11px] font-bold text-zinc-700 dark:text-zinc-200">
                        {t(`stats.zoneName.${mode}.${zone.id}`)}
                      </p>
                      <p className="shrink-0 font-mono text-[9px] text-zinc-400">
                        {formatZoneRange(zone.min, zone.max, zone.id, mode)}
                      </p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full ${tone.bar}`}
                        style={{ width: `${zone.percent > 0 ? Math.max(zone.percent, 2) : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs font-black text-zinc-900 dark:text-zinc-100">{zone.percent}%</p>
                    <p className="font-mono text-[9px] text-zinc-400">{formatZoneTime(zone.seconds)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-1 border-t border-zinc-100 px-4 py-3 font-mono text-[9px] leading-4 text-zinc-400 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <span>{referenceLabel}</span>
            <span>{t('activity.zoneCoverage', { percent: distribution.coveragePercent })}</span>
          </div>
        </>
      )}
    </section>
  );
}
