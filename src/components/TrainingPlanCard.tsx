'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { TrainingSession, WeeklyPlan } from '@/lib/trainingPlan';
import type { SessionExecution, WeekExecution } from '@/lib/trainingPlanExecution';
import {
  Activity,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  Flag,
  Footprints,
  Gauge,
  Moon,
  Mountain,
  XCircle,
  Zap,
} from 'lucide-react';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SHORT_ZH = ['一', '二', '三', '四', '五', '六', '日'];

const PHASE_STYLES: Record<WeeklyPlan['phase'], string> = {
  base: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300',
  build: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/20 dark:text-orange-300',
  peak: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300',
  taper: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/60 dark:bg-green-950/20 dark:text-green-300',
  recovery: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
};

const TYPE_STYLES: Record<TrainingSession['type'], string> = {
  easy: 'border-blue-100 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/15',
  long: 'border-violet-100 bg-violet-50/80 dark:border-violet-900/50 dark:bg-violet-950/15',
  tempo: 'border-orange-100 bg-orange-50/80 dark:border-orange-900/50 dark:bg-orange-950/15',
  interval: 'border-red-100 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/15',
  recovery: 'border-emerald-100 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/15',
  rest: 'border-zinc-100 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/70',
  race: 'border-amber-100 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/15',
};

const TYPE_ACCENT: Record<TrainingSession['type'], string> = {
  easy: 'text-blue-600 dark:text-blue-300',
  long: 'text-violet-600 dark:text-violet-300',
  tempo: 'text-orange-600 dark:text-orange-300',
  interval: 'text-red-600 dark:text-red-300',
  recovery: 'text-emerald-600 dark:text-emerald-300',
  rest: 'text-zinc-400',
  race: 'text-amber-600 dark:text-amber-300',
};

interface TrainingPlanCardProps {
  week: WeeklyPlan;
  execution?: WeekExecution;
  isCurrent?: boolean;
  defaultExpanded?: boolean;
}

function getFirstLine(text: string) {
  return text.split('\n').find((line) => line.trim().length > 0)?.trim() ?? '';
}

function cleanGuideValue(line?: string) {
  if (!line) return '';
  return line
    .replace(/^(配速建议|心率建议|体感|执行要点|要点|提示|Pace|HR|Feel|Execution|Tip|Note):?\s*/i, '')
    .replace(/^：\s*/, '')
    .trim();
}

function getSessionGuides(description: string) {
  const lines = description.split('\n').map((line) => line.trim()).filter(Boolean);
  const findLine = (patterns: RegExp[]) => lines.find((line) => patterns.some((pattern) => pattern.test(line)));
  return {
    main: lines[0] || '',
    pace: cleanGuideValue(findLine([/^配速建议/, /^Pace/i])),
    heartRate: cleanGuideValue(findLine([/^心率建议/, /^HR/i])),
    feel: cleanGuideValue(findLine([/^体感/, /^Feel/i])),
    tip: cleanGuideValue(findLine([/^执行要点/, /^要点/, /^Tip/i, /^Execution/i])),
  };
}

function getSessionPurpose(type: TrainingSession['type'], isZh: boolean) {
  const purposes: Record<TrainingSession['type'], { zh: string; en: string }> = {
    easy: { zh: '累积有氧，不制造疲劳', en: 'Build aerobic volume without fatigue' },
    long: { zh: '提升耐力和补给熟悉度', en: 'Build endurance and fueling familiarity' },
    tempo: { zh: '提高阈值和目标配速稳定性', en: 'Improve threshold and goal-pace control' },
    interval: { zh: '刺激速度与最大摄氧能力', en: 'Stimulate speed and VO2max' },
    recovery: { zh: '促进恢复，维持跑感', en: 'Recover while keeping running rhythm' },
    rest: { zh: '吸收训练负荷', en: 'Absorb training load' },
    race: { zh: '执行比赛策略', en: 'Execute race strategy' },
  };
  return isZh ? purposes[type].zh : purposes[type].en;
}

function getDowngradeRule(type: TrainingSession['type'], isZh: boolean) {
  if (type === 'rest') return '';
  if (type === 'long') {
    return isZh ? '状态差则缩短 20-30%，不追最后加速' : 'Cut 20-30% if tired; skip late progression';
  }
  if (type === 'tempo' || type === 'interval') {
    return isZh ? '疲劳高则改 40min E 区或休息' : 'Swap for 40min E or rest if fatigue is high';
  }
  if (type === 'race') {
    return isZh ? '按当天体感调整目标配速' : 'Adjust goal pace by race-day feel';
  }
  return isZh ? '心率偏高就降速，必要时缩短' : 'Slow down if HR drifts; shorten if needed';
}

function GuideItem({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="border border-white/60 bg-white/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950/60">
      <p className="font-mono text-[9px] text-zinc-400">{label}</p>
      <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-300">{value}</p>
    </div>
  );
}

export function TrainingPlanCard({ week, execution, isCurrent, defaultExpanded }: TrainingPlanCardProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === 'zh';
  const [expanded, setExpanded] = React.useState(Boolean(defaultExpanded || isCurrent));

  React.useEffect(() => {
    if (isCurrent) setExpanded(true);
  }, [isCurrent]);

  const nonRestSessions = week.sessions.filter((session) => session.type !== 'rest');
  const keySessions = nonRestSessions.filter((session) =>
    ['long', 'tempo', 'interval', 'race'].includes(session.type)
  );
  const longRun = nonRestSessions.reduce<TrainingSession | null>((best, session) => {
    if (!best) return session;
    return session.distance > best.distance ? session : best;
  }, null);
  const executionByDay = React.useMemo(
    () => new Map(execution?.sessions.map((session) => [session.day, session]) || []),
    [execution]
  );

  const phaseLabel: Record<WeeklyPlan['phase'], string> = {
    base: t('trainingPlan.phaseBase', '基础期'),
    build: t('trainingPlan.phaseBuild', '建立期'),
    peak: t('trainingPlan.phasePeak', '巅峰期'),
    taper: t('trainingPlan.phaseTaper', '减量期'),
    recovery: t('trainingPlan.phaseRecovery', '恢复期'),
  };

  const defaultTitle = (type: TrainingSession['type']) => {
    switch (type) {
      case 'race': return t('trainingPlan.raceDay', isZh ? '比赛日' : 'Race');
      case 'interval': return t('trainingPlan.intervalTraining', isZh ? '间歇训练' : 'Intervals');
      case 'tempo': return t('trainingPlan.tempoRun', isZh ? '乳酸阈值跑' : 'Tempo');
      case 'easy': return t('trainingPlan.easyRun', isZh ? '轻松跑' : 'Easy');
      case 'long': return t('trainingPlan.longRun', isZh ? '长距离慢跑' : 'Long Run');
      case 'recovery': return t('trainingPlan.recoveryRun', isZh ? '恢复跑' : 'Recovery');
      case 'rest': return t('trainingPlan.restDay', 'Rest');
      default: return isZh ? '训练' : 'Run';
    }
  };

  const dayLabel = (day: number) => (isZh ? `周${DAY_SHORT_ZH[day]}` : DAY_SHORT[day]);

  const TypeIcon = ({ type }: { type: TrainingSession['type'] }) => {
    if (type === 'rest') return <Moon size={15} />;
    if (type === 'long') return <Mountain size={15} />;
    if (type === 'tempo') return <Gauge size={15} />;
    if (type === 'interval') return <Zap size={15} />;
    if (type === 'race') return <Flag size={15} />;
    if (type === 'recovery') return <Activity size={15} />;
    return <Footprints size={15} />;
  };

  return (
    <section
      className={[
        'border-2 bg-white dark:bg-zinc-950 transition-colors',
        isCurrent
          ? 'border-blue-500 dark:border-blue-400 shadow-[4px_4px_0px_0px_rgba(37,99,235,0.16)]'
          : 'border-zinc-200 dark:border-zinc-800',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full text-left px-3 py-3 sm:px-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-pixel text-sm font-bold text-zinc-950 dark:text-zinc-50">
                {t('trainingPlan.week', { week: week.week, defaultValue: `Week ${week.week}` })}
              </h3>
              <span className={['border px-2 py-0.5 font-mono text-[10px] font-bold', PHASE_STYLES[week.phase]].join(' ')}>
                {phaseLabel[week.phase]}
              </span>
              {isCurrent && (
                <span className="border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                  {t('trainingPlan.currentWeek', '当前周')}
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {week.focus || (keySessions.length > 0
                ? t('trainingPlan.weekFocus', '{{count}} 个关键训练 · 长距离 {{distance}} km', {
                    count: keySessions.length,
                    distance: longRun?.distance ?? 0,
                  })
                : t('trainingPlan.weekRecoveryFocus', '恢复与基础有氧周'))}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-lg font-bold text-zinc-950 dark:text-zinc-50">{week.totalDistance}</p>
            <p className="font-mono text-[10px] text-zinc-500">km</p>
            {execution && execution.dueCount > 0 && (
              <p className="mt-1 font-mono text-[9px] font-bold text-emerald-600 dark:text-emerald-300">
                {execution.completedCount}/{execution.dueCount} {t('trainingPlan.doneShort', '完成')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="border border-zinc-100 px-2 py-2 dark:border-zinc-800">
            <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.runDays', '跑步日')}</p>
            <p className="font-mono text-sm font-bold">{nonRestSessions.length}</p>
          </div>
          <div className="border border-zinc-100 px-2 py-2 dark:border-zinc-800">
            <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.keySessions', '关键课')}</p>
            <p className="font-mono text-sm font-bold">{keySessions.length}</p>
          </div>
          <div className="border border-zinc-100 px-2 py-2 dark:border-zinc-800">
            <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.longestRun', '最长')}</p>
            <p className="font-mono text-sm font-bold">{longRun?.distance ?? 0}km</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t-2 border-zinc-100 px-3 pb-3 dark:border-zinc-800 sm:px-4">
          <div className="grid grid-cols-7 gap-1 py-3">
            {Array.from({ length: 7 }, (_, day) => {
              const session = week.sessions.find((item) => item.day === day);
              const hasSession = Boolean(session && session.type !== 'rest');
              return (
                <div
                  key={day}
                  className={[
                    'h-2 border',
                    hasSession ? TYPE_STYLES[session!.type] : 'border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900',
                  ].join(' ')}
                  title={session?.title || dayLabel(day)}
                />
              );
            })}
          </div>

          <div className="space-y-2">
            {Array.from({ length: 7 }, (_, day) => {
              const session = week.sessions.find((item) => item.day === day);
              if (!session) {
                return (
                  <div key={day} className="flex items-center gap-3 border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                    <span className="w-10 shrink-0 font-mono text-[11px] text-zinc-400">{dayLabel(day)}</span>
                    <span className="font-mono text-xs text-zinc-400">-</span>
                  </div>
                );
              }

              const title = session.title || defaultTitle(session.type);
              const guides = getSessionGuides(session.description);
              const description = guides.main || getFirstLine(session.description);
              const downgrade = getDowngradeRule(session.type, isZh);
              const sessionExecution = executionByDay.get(day);

              return (
                <div
                  key={day}
                  className={['border px-3 py-2', TYPE_STYLES[session.type]].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 shrink-0 font-mono text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                      {dayLabel(day)}
                    </div>
                    <div className={['mt-0.5 shrink-0', TYPE_ACCENT[session.type]].join(' ')}>
                      <TypeIcon type={session.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
                        {session.type !== 'rest' && (
                          <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                            {session.distance > 0 ? `${session.distance}km` : session.duration}
                            {session.paceZone ? ` · ${session.paceZone}` : ''}
                          </p>
                        )}
                        {sessionExecution && <SessionStatus execution={sessionExecution} />}
                      </div>
                      {description && (
                        <p className="mt-1 whitespace-pre-line font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {description}
                        </p>
                      )}
                      {session.type !== 'rest' && (
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          <GuideItem label={isZh ? '目的' : 'Purpose'} value={getSessionPurpose(session.type, isZh)} />
                          <GuideItem label={isZh ? '配速' : 'Pace'} value={guides.pace} />
                          <GuideItem label={isZh ? '心率' : 'HR'} value={guides.heartRate} />
                          <GuideItem label={isZh ? '体感' : 'Feel'} value={guides.feel || guides.tip} />
                          <GuideItem label={isZh ? '降级' : 'Adjust'} value={downgrade} />
                        </div>
                      )}
                      {sessionExecution?.activity && (
                        <Link
                          href={`/activities/${sessionExecution.activity.id}`}
                          className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-300"
                        >
                          {t('trainingPlan.viewMatchedActivity', '查看匹配活动')}
                          <ExternalLink size={11} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {week.notes && (
            <div className="mt-3 border-l-2 border-zinc-300 pl-3 dark:border-zinc-700">
              <p className="font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">{week.notes}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SessionStatus({ execution }: { execution: SessionExecution }) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === 'zh';
  const dateLabel = new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', {
    month: 'numeric',
    day: 'numeric',
  }).format(execution.date);
  const shifted = execution.dateDelta
    ? isZh
      ? ` · 调整${execution.dateDelta > 0 ? '+' : ''}${execution.dateDelta}天`
      : ` · ${execution.dateDelta > 0 ? '+' : ''}${execution.dateDelta}d`
    : '';

  if (execution.status === 'rest') {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[9px] text-zinc-400">
        <Clock3 size={10} />
        {dateLabel}
      </span>
    );
  }

  const config = {
    completed: {
      icon: <CheckCircle2 size={10} />,
      label: t('trainingPlan.sessionCompleted'),
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
    },
    partial: {
      icon: <CircleDashed size={10} />,
      label: t('trainingPlan.sessionPartial'),
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
    },
    missed: {
      icon: <XCircle size={10} />,
      label: t('trainingPlan.sessionMissed'),
      className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300',
    },
    upcoming: {
      icon: <Clock3 size={10} />,
      label: t('trainingPlan.sessionUpcoming'),
      className: 'border-zinc-200 bg-white/70 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-400',
    },
  }[execution.status];

  return (
    <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] font-bold ${config.className}`}>
      {config.icon}
      {dateLabel} · {config.label}{shifted}
    </span>
  );
}
