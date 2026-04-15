'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TrainingPlan } from '@/lib/trainingPlan';
import { getDistanceLabel, getDistanceLabelEn, calculatePaceZones } from '@/lib/trainingPlan';
import { TrainingPlanCard } from './TrainingPlanCard';
import { PixelButton } from '@/components/ui';
import { Trash2, RefreshCw } from 'lucide-react';

interface TrainingPlanViewProps {
  plan: TrainingPlan;
  onRegenerate?: () => void;
  onDelete?: () => void;
}

export function TrainingPlanView({ plan, onRegenerate, onDelete }: TrainingPlanViewProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === 'zh';

  const distanceLabel = isZh
    ? getDistanceLabel(plan.goal.distance)
    : getDistanceLabelEn(plan.goal.distance);

  // Calculate current week if race date exists
  let currentWeek: number | undefined;
  if (plan.goal.raceDate) {
    const race = new Date(plan.goal.raceDate);
    const now = new Date();
    const diffDays = Math.ceil((race.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0) {
      const weeksToRace = Math.ceil(diffDays / 7);
      currentWeek = Math.max(1, plan.weeks.length - weeksToRace + 1);
    }
  }

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatPaceSec = (secPerKm: number) => {
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return `${m}'${s.toString().padStart(2, '0')}"`;
  };

  const targetPaceSec = plan.goal.targetTimeSeconds / (plan.goal.distance === '5k' ? 5 : plan.goal.distance === '10k' ? 10 : plan.goal.distance === '21k' ? 21.0975 : 42.195);

  const zones = plan.currentAbility.pb5k ? calculatePaceZones(plan.currentAbility.pb5k) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="p-4 border-4 border-zinc-800 dark:border-zinc-200 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-pixel text-lg font-bold mb-1">
              {distanceLabel} {t('trainingPlan.planTitle', '训练计划')}
            </h2>
            <p className="font-mono text-xs text-zinc-500">
              {t('trainingPlan.targetTime', '目标时间')}: {formatTime(plan.goal.targetTimeSeconds)} · {plan.weeks.length}{t('trainingPlan.weeksUnit', '周')}
            </p>
            <p className="font-mono text-[10px] text-zinc-400 mt-0.5">
              {t('trainingPlan.targetPace', '目标配速')}: {formatPaceSec(targetPaceSec)}/km
            </p>
            {plan.goal.raceDate && (
              <p className="font-mono text-xs text-zinc-500 mt-0.5">
                {t('trainingPlan.raceDate', '比赛日期')}: {plan.goal.raceDate}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onRegenerate && (
              <PixelButton variant="secondary" size="sm" onClick={onRegenerate}>
                <RefreshCw size={14} />
              </PixelButton>
            )}
            {onDelete && (
              <PixelButton variant="outline" size="sm" onClick={onDelete}>
                <Trash2 size={14} />
              </PixelButton>
            )}
          </div>
        </div>
      </div>

      {/* Pace Zones Reference */}
      {zones && (
        <div className="p-3 border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <div className="text-[10px] font-mono text-zinc-500 mb-2 text-center">{t('aiAnalysis.paceZone', 'Pace Zone')}</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(['E','M','T'] as const).map((zone) => (
              <div key={zone} className="px-1 py-1 bg-zinc-50 dark:bg-zinc-800 rounded">
                <div className="text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300">{zone}</div>
                <div className="text-[10px] font-mono text-zinc-500">{formatPaceSec(zones[zone].min)}-{formatPaceSec(zones[zone].max)}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-center mt-2">
            {(['I','R'] as const).map((zone) => (
              <div key={zone} className="px-1 py-1 bg-zinc-50 dark:bg-zinc-800 rounded">
                <div className="text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300">{zone}</div>
                <div className="text-[10px] font-mono text-zinc-500">{formatPaceSec(zones[zone].min)}-{formatPaceSec(zones[zone].max)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Cards */}
      <div className="space-y-3">
        {plan.weeks.map((week) => (
          <TrainingPlanCard
            key={week.week}
            week={week}
            isCurrent={currentWeek === week.week}
          />
        ))}
      </div>
    </div>
  );
}
