'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from '@/components/ui';
import type { RaceDistance } from '@/lib/trainingPlan';
import { estimatePlanWeeks } from '@/lib/trainingPlan';
import { AlertCircle } from 'lucide-react';

interface TrainingPlanFormProps {
  defaultDistance?: RaceDistance;
  defaultTargetTime?: string;
  defaultWeeks?: number;
  defaultRaceDate?: string;
  hasPB: boolean;
  onSubmit: (data: {
    distance: RaceDistance;
    targetTime: string;
    weeks: number;
    raceDate?: string;
  }) => void;
  isLoading?: boolean;
}

const DISTANCES: RaceDistance[] = ['5k', '10k', '21k', '42k'];

export function TrainingPlanForm({
  defaultDistance = '10k',
  defaultTargetTime = '',
  defaultWeeks,
  defaultRaceDate = '',
  hasPB,
  onSubmit,
  isLoading,
}: TrainingPlanFormProps) {
  const { t } = useTranslation();
  const [distance, setDistance] = React.useState<RaceDistance>(defaultDistance);
  const [targetTime, setTargetTime] = React.useState(defaultTargetTime);
  const [weeks, setWeeks] = React.useState(defaultWeeks ?? estimatePlanWeeks(defaultDistance));
  const [raceDate, setRaceDate] = React.useState(defaultRaceDate);

  React.useEffect(() => {
    setWeeks(estimatePlanWeeks(distance));
  }, [distance]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      distance,
      targetTime,
      weeks,
      raceDate: raceDate || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!hasPB && (
        <div className="p-3 border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="font-mono text-xs text-amber-700 dark:text-amber-300">
            {t('trainingPlan.noPBHint', '请先设置个人档案中的 PB，以获得更准确的训练计划')}
          </p>
        </div>
      )}

      {/* Distance */}
      <div>
        <label className="block font-mono text-xs font-bold uppercase mb-1.5">
          {t('trainingPlan.goalDistance', '目标赛事')}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DISTANCES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDistance(d)}
              className={[
                'px-3 py-2 font-mono text-sm font-bold border-2 transition-colors',
                distance === d
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800',
              ].join(' ')}
            >
              {d === '5k' && '5K'}
              {d === '10k' && '10K'}
              {d === '21k' && t('trainingPlan.half', '半马')}
              {d === '42k' && t('trainingPlan.full', '全马')}
            </button>
          ))}
        </div>
      </div>

      {/* Target Time */}
      <div>
        <label className="block font-mono text-xs font-bold uppercase mb-1.5">
          {t('trainingPlan.targetTime', '目标时间')}
        </label>
        <input
          type="text"
          inputMode="text"
          required
          placeholder={t('profile.timeFormat', '格式：分:秒 或 时:分:秒')}
          value={targetTime}
          onChange={(e) => setTargetTime(e.target.value)}
          className="w-full px-3 py-2 font-mono text-base border-4 border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 outline-none focus:border-blue-500 dark:focus:border-blue-400"
        />
      </div>

      {/* Weeks */}
      <div>
        <label className="block font-mono text-xs font-bold uppercase mb-1.5">
          {t('trainingPlan.weeks', '计划周数')}
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={4}
            max={20}
            step={1}
            value={weeks}
            onChange={(e) => setWeeks(parseInt(e.target.value, 10))}
            className="flex-1"
          />
          <span className="w-12 font-mono text-sm font-bold text-right">{weeks}</span>
        </div>
      </div>

      {/* Race Date */}
      <div>
        <label className="block font-mono text-xs font-bold uppercase mb-1.5">
          {t('trainingPlan.raceDate', '比赛日期（可选）')}
        </label>
        <input
          type="date"
          value={raceDate}
          onChange={(e) => setRaceDate(e.target.value)}
          className="w-full min-w-0 px-3 py-2 font-mono text-base border-4 border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 outline-none focus:border-blue-500 dark:focus:border-blue-400"
        />
      </div>

      <PixelButton variant="primary" size="lg" className="w-full" isLoading={isLoading}>
        {isLoading ? t('trainingPlan.generating', '生成中...') : t('trainingPlan.generate', '生成训练计划')}
      </PixelButton>
    </form>
  );
}
