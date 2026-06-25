'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from '@/components/ui';
import type { RaceDistance } from '@/lib/trainingPlan';
import { estimatePlanWeeks, getRecommendedTargetTime } from '@/lib/trainingPlan';
import type { UserProfilePBs } from '@/lib/userProfile';
import { formatSecondsToTime, parseTimeToSeconds } from '@/lib/userProfile';
import { AlertCircle, CalendarDays, Clock3, Flag, RotateCcw, Sparkles, Target, TimerReset } from 'lucide-react';

interface TrainingPlanFormProps {
  defaultDistance?: RaceDistance;
  defaultTargetTime?: string;
  defaultWeeks?: number;
  defaultRaceDate?: string;
  hasPB: boolean;
  profilePBs?: Partial<UserProfilePBs> | null;
  onSubmit: (data: {
    distance: RaceDistance;
    targetTime: string;
    weeks: number;
    raceDate?: string;
  }) => void;
  isLoading?: boolean;
}

const DISTANCES: Array<{ value: RaceDistance; label: string; hint: string }> = [
  { value: '5k', label: '5K', hint: 'Speed' },
  { value: '10k', label: '10K', hint: 'Threshold' },
  { value: '21k', label: 'Half', hint: 'Endurance' },
  { value: '42k', label: 'Full', hint: 'Marathon' },
];

export function TrainingPlanForm({
  defaultDistance = '10k',
  defaultTargetTime = '',
  defaultWeeks,
  defaultRaceDate = '',
  hasPB,
  profilePBs,
  onSubmit,
  isLoading,
}: TrainingPlanFormProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === 'zh';
  const [distance, setDistance] = React.useState<RaceDistance>(defaultDistance);
  const [targetTime, setTargetTime] = React.useState(defaultTargetTime);
  const [weeks, setWeeks] = React.useState(defaultWeeks ?? estimatePlanWeeks(defaultDistance));
  const [raceDate, setRaceDate] = React.useState(defaultRaceDate);
  const [targetTimeMode, setTargetTimeMode] = React.useState<'auto' | 'manual'>(
    defaultTargetTime ? 'manual' : 'auto'
  );
  const [targetTimeError, setTargetTimeError] = React.useState('');

  const recommendation = React.useMemo(
    () => getRecommendedTargetTime(profilePBs, distance),
    [distance, profilePBs]
  );

  const selectedDistance = DISTANCES.find((item) => item.value === distance) ?? DISTANCES[1];
  const placeholder = distance === '5k' || distance === '10k' ? '42:30' : '1:45:00';

  React.useEffect(() => {
    if (targetTimeMode === 'auto' && recommendation) {
      setTargetTime(formatSecondsToTime(recommendation.seconds));
      setTargetTimeError('');
    }
  }, [recommendation, targetTimeMode]);

  const handleDistanceChange = (value: RaceDistance) => {
    setDistance(value);
    setWeeks(estimatePlanWeeks(value));
    setTargetTimeMode('auto');
    setTargetTimeError('');
  };

  const applyRecommendation = () => {
    if (!recommendation) return;
    setTargetTime(formatSecondsToTime(recommendation.seconds));
    setTargetTimeMode('auto');
    setTargetTimeError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parseTimeToSeconds(targetTime)) {
      setTargetTimeError(t('trainingPlan.invalidTime'));
      return;
    }
    setTargetTimeError('');
    onSubmit({
      distance,
      targetTime,
      weeks,
      raceDate: raceDate || undefined,
    });
  };

  const displayDistanceLabel = (value: RaceDistance) => {
    if (value === '21k') return t('trainingPlan.half', '半马');
    if (value === '42k') return t('trainingPlan.full', '全马');
    return value.toUpperCase();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!hasPB && (
        <div className="border-2 border-amber-300 bg-amber-50 px-3 py-3 dark:border-amber-900/70 dark:bg-amber-950/25">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
            <p className="font-mono text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              {t('trainingPlan.noPBHint', '请先设置个人档案中的 PB，以获得更准确的训练计划')}
            </p>
          </div>
        </div>
      )}

      <section className="border-2 border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
        <div className="mb-3 flex items-center gap-2">
          <Flag size={15} className="text-blue-600 dark:text-blue-300" />
          <div>
            <h3 className="font-mono text-xs font-bold uppercase">{t('trainingPlan.goalDistance', '目标赛事')}</h3>
            <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.goalDistanceHint', '选择要备战的比赛距离')}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DISTANCES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => handleDistanceChange(item.value)}
              className={[
                'min-h-20 border-2 px-3 py-3 text-left transition-colors',
                distance === item.value
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600',
              ].join(' ')}
            >
              <span className="block font-mono text-base font-bold">{displayDistanceLabel(item.value)}</span>
              <span className="mt-1 block font-mono text-[10px] text-zinc-500">
                {isZh
                  ? item.value === '5k'
                    ? '速度'
                    : item.value === '10k'
                      ? '阈值'
                      : item.value === '21k'
                        ? '耐力'
                        : '马拉松'
                  : item.hint}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label
          className={[
            'block border-2 bg-white p-3 dark:bg-zinc-950',
            targetTimeError
              ? 'border-red-400 dark:border-red-700'
              : 'border-zinc-200 dark:border-zinc-800',
          ].join(' ')}
        >
          <div className="mb-2 flex items-center gap-2">
            <Clock3 size={15} className="text-orange-600 dark:text-orange-300" />
            <span className="font-mono text-xs font-bold uppercase">
              {t('trainingPlan.targetTimeRequired')}
            </span>
          </div>
          <input
            type="text"
            inputMode="text"
            required
            placeholder={placeholder}
            value={targetTime}
            onChange={(e) => {
              setTargetTime(e.target.value);
              setTargetTimeMode('manual');
              setTargetTimeError('');
            }}
            aria-invalid={Boolean(targetTimeError)}
            className="w-full border-0 bg-transparent font-mono text-2xl font-bold text-zinc-950 outline-none placeholder:text-zinc-300 dark:text-zinc-50 dark:placeholder:text-zinc-700"
          />
          {recommendation && (
            <div className="mt-2 flex items-start justify-between gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <p className="flex min-w-0 items-start gap-1.5 font-mono text-[10px] leading-relaxed text-blue-600 dark:text-blue-300">
                <Sparkles size={12} className="mt-0.5 shrink-0" />
                <span>
                  {recommendation.estimated
                    ? t('trainingPlan.targetTimeEstimated', {
                        source: displayDistanceLabel(recommendation.sourceDistance),
                        time: formatSecondsToTime(recommendation.sourceSeconds),
                      })
                    : t('trainingPlan.targetTimeFromPB')}
                </span>
              </p>
              {targetTimeMode === 'manual' && (
                <button
                  type="button"
                  onClick={applyRecommendation}
                  className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-300"
                >
                  <RotateCcw size={11} />
                  {t('trainingPlan.useRecommendedTime')}
                </button>
              )}
            </div>
          )}
          <p className={[
            'mt-2 font-mono text-[10px]',
            targetTimeError ? 'text-red-600 dark:text-red-300' : 'text-zinc-500',
          ].join(' ')}>
            {targetTimeError || t('trainingPlan.targetTimeHint')}
          </p>
        </label>

        <label className="block border-2 border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-2 flex items-center gap-2">
            <CalendarDays size={15} className="text-emerald-600 dark:text-emerald-300" />
            <span className="font-mono text-xs font-bold uppercase">{t('trainingPlan.raceDate', '比赛日期（可选）')}</span>
          </div>
          <input
            type="date"
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            className="w-full min-w-0 border-0 bg-transparent font-mono text-base font-bold text-zinc-950 outline-none dark:text-zinc-50"
            style={{ WebkitAppearance: 'none' }}
          />
          <p className="mt-2 font-mono text-[10px] text-zinc-500">
            {t('trainingPlan.raceDateHint')}
          </p>
        </label>
      </section>

      <section className="border-2 border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <TimerReset size={15} className="text-violet-600 dark:text-violet-300" />
            <div>
              <h3 className="font-mono text-xs font-bold uppercase">{t('trainingPlan.weeks', '计划周数')}</h3>
              <p className="font-mono text-[10px] text-zinc-500">
                {t('trainingPlan.weeksHint', '会按目标赛事自动给出建议周期')}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-2xl font-bold">{weeks}</p>
            <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.weeksUnit', '周')}</p>
          </div>
        </div>
        <input
          type="range"
          min={4}
          max={20}
          step={1}
          value={weeks}
          onChange={(e) => setWeeks(parseInt(e.target.value, 10))}
          className="w-full"
        />
        <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-400">
          <span>4</span>
          <span>20</span>
        </div>
      </section>

      <div className="border-2 border-blue-100 bg-blue-50/70 px-3 py-3 dark:border-blue-900/60 dark:bg-blue-950/20">
        <div className="flex items-start gap-2">
          <Target size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" />
          <p className="font-mono text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            {t('trainingPlan.formSummary', '将为 {{distance}} 目标生成 {{weeks}} 周训练计划，包含基础、建立、巅峰和减量周期。', {
              distance: displayDistanceLabel(selectedDistance.value),
              weeks,
            })}
          </p>
        </div>
      </div>

      <PixelButton variant="primary" size="lg" className="w-full" isLoading={isLoading}>
        {isLoading ? t('trainingPlan.generating', '编排中...') : t('trainingPlan.generate', '生成训练计划')}
      </PixelButton>
    </form>
  );
}
