'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { WeeklyPlan } from '@/lib/trainingPlan';

const PHASE_COLORS: Record<WeeklyPlan['phase'], string> = {
  base: 'bg-blue-100 text-blue-800 border-blue-300',
  build: 'bg-orange-100 text-orange-800 border-orange-300',
  peak: 'bg-red-100 text-red-800 border-red-300',
  taper: 'bg-green-100 text-green-800 border-green-300',
  recovery: 'bg-zinc-100 text-zinc-800 border-zinc-300',
};

const TYPE_COLORS: Record<string, string> = {
  easy: 'bg-blue-50 border-blue-200',
  long: 'bg-purple-50 border-purple-200',
  tempo: 'bg-orange-50 border-orange-200',
  interval: 'bg-red-50 border-red-200',
  recovery: 'bg-green-50 border-green-200',
  rest: 'bg-zinc-50 border-zinc-200 opacity-60',
  race: 'bg-amber-50 border-amber-200',
};

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SHORT_ZH = ['一', '二', '三', '四', '五', '六', '日'];

interface TrainingPlanCardProps {
  week: WeeklyPlan;
  isCurrent?: boolean;
}

export function TrainingPlanCard({ week, isCurrent }: TrainingPlanCardProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === 'zh';

  const phaseLabel: Record<string, string> = {
    base: t('trainingPlan.phaseBase', '基础期'),
    build: t('trainingPlan.phaseBuild', '建立期'),
    peak: t('trainingPlan.phasePeak', '巅峰期'),
    taper: t('trainingPlan.phaseTaper', '减量期'),
    recovery: t('trainingPlan.phaseRecovery', '恢复期'),
  };

  return (
    <div className={[
      'border-4 bg-white dark:bg-zinc-900 transition-all',
      isCurrent ? 'border-blue-600 shadow-[4px_4px_0px_0px_rgba(37,99,235,0.2)]' : 'border-zinc-200 dark:border-zinc-700',
    ].join(' ')}>
      {/* Header */}
      <div className="p-3 border-b-2 border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-pixel text-sm font-bold">
            {t('trainingPlan.week', { week: week.week, defaultValue: `Week ${week.week}` })}
          </span>
          <span className={[
            'px-2 py-0.5 text-[10px] font-mono font-bold uppercase border',
            PHASE_COLORS[week.phase],
          ].join(' ')}>
            {phaseLabel[week.phase]}
          </span>
        </div>
        <span className="font-mono text-xs text-zinc-500">
          {week.totalDistance}km
        </span>
      </div>

      {/* Sessions */}
      <div className="p-2">
        <div className="grid grid-cols-7 gap-1">
          {week.sessions.map((session, idx) => (
            <div
              key={idx}
              className={[
                'border p-1.5 min-h-[72px] flex flex-col',
                TYPE_COLORS[session.type] || 'bg-white border-zinc-200',
              ].join(' ')}
            >
              <span className="text-[10px] font-mono text-zinc-400 mb-1">
                {isZh ? `周${DAY_SHORT_ZH[session.day]}` : DAY_SHORT[session.day]}
              </span>
              {session.type !== 'rest' ? (
                <>
                  <span className="text-[10px] font-mono font-bold leading-tight" title={session.description}>
                    {session.title}
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500 leading-tight mt-0.5 line-clamp-2" title={session.description}>
                    {session.type === 'easy' || session.type === 'long'
                      ? `${session.distance > 0 ? `${session.distance}km` : ''}${session.paceZone ? ` · ${session.paceZone}` : ''}`
                      : session.description}
                  </span>
                </>
              ) : (
                <span className="text-[10px] font-mono text-zinc-400" title={session.description}>
                  {t('trainingPlan.restDay', 'Rest')}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* Daily Details */}
        <div className="mt-2 border-t border-zinc-100 dark:border-zinc-800 pt-2 space-y-1">
          {week.sessions
            .filter((s) => s.type !== 'rest' && s.type !== 'easy' && s.type !== 'long')
            .map((s, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-[10px] font-mono text-zinc-600 dark:text-zinc-400 px-1">
                <span className="text-zinc-400 shrink-0">{isZh ? `周${DAY_SHORT_ZH[s.day]}` : DAY_SHORT[s.day]}</span>
                <span className="font-bold text-zinc-700 dark:text-zinc-300 shrink-0">{s.title}</span>
                <span className="text-zinc-500">{s.description}</span>
              </div>
            ))}
        </div>

        {week.notes && (
          <p className="mt-2 font-mono text-[10px] text-zinc-500 px-1">
            {week.notes}
          </p>
        )}
      </div>
    </div>
  );
}
