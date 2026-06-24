'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TrainingPlan, TrainingSession, WeeklyPlan } from '@/lib/trainingPlan';
import type { StravaActivity } from '@/types';
import { calculateTrainingPlanExecution } from '@/lib/trainingPlanExecution';
import {
  calculatePaceZones,
  getDistanceLabel,
  getDistanceLabelEn,
  getTrainingAbilityGroup,
} from '@/lib/trainingPlan';
import { TrainingPlanCard } from './TrainingPlanCard';
import { PixelButton } from '@/components/ui';
import {
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Flag,
  Gauge,
  LineChart,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  XCircle,
} from 'lucide-react';

interface TrainingPlanViewProps {
  plan: TrainingPlan;
  activities?: StravaActivity[];
  onRegenerate?: () => void;
  onDelete?: () => void;
}

const PHASE_BAR: Record<WeeklyPlan['phase'], string> = {
  base: 'bg-blue-500',
  build: 'bg-orange-500',
  peak: 'bg-red-500',
  taper: 'bg-green-500',
  recovery: 'bg-zinc-400',
};

const DISTANCE_KM: Record<TrainingPlan['goal']['distance'], number> = {
  '5k': 5,
  '10k': 10,
  '21k': 21.0975,
  '42k': 42.195,
};

const DAY_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const DAY_LABELS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPaceSec(secPerKm: number) {
  const rounded = Math.round(secPerKm);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

function getPlanTiming(plan: TrainingPlan) {
  if (!plan.goal.raceDate) return { currentWeek: undefined, daysToRace: undefined };

  const race = new Date(`${plan.goal.raceDate}T00:00:00`);
  const now = new Date();
  const diffDays = Math.ceil((race.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { currentWeek: plan.weeks.length, daysToRace: diffDays };
  }

  const weeksToRace = Math.max(0, Math.ceil(diffDays / 7));
  const currentWeek = Math.min(
    plan.weeks.length,
    Math.max(1, plan.weeks.length - weeksToRace + 1)
  );
  return { currentWeek, daysToRace: diffDays };
}

function getWeekKeySessions(week?: WeeklyPlan) {
  if (!week) return [];
  return week.sessions.filter((session) =>
    ['long', 'tempo', 'interval', 'race'].includes(session.type)
  );
}

function getSessionTitle(session: TrainingSession, isZh: boolean, t: ReturnType<typeof useTranslation>['t']) {
  if (session.title) return session.title;
  switch (session.type) {
    case 'race': return t('trainingPlan.raceDay', isZh ? '比赛日' : 'Race');
    case 'interval': return t('trainingPlan.intervalTraining', isZh ? '间歇训练' : 'Intervals');
    case 'tempo': return t('trainingPlan.tempoRun', isZh ? '乳酸阈值跑' : 'Tempo');
    case 'long': return t('trainingPlan.longRun', isZh ? '长距离慢跑' : 'Long Run');
    case 'recovery': return t('trainingPlan.recoveryRun', isZh ? '恢复跑' : 'Recovery');
    case 'rest': return t('trainingPlan.restDay', 'Rest');
    default: return t('trainingPlan.easyRun', isZh ? '轻松跑' : 'Easy Run');
  }
}

function StatTile({
  icon,
  label,
  value,
  accent = 'text-zinc-900 dark:text-zinc-50',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="border-2 border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase text-zinc-500">
        <span className={accent}>{icon}</span>
        {label}
      </div>
      <p className="font-mono text-lg font-bold text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function getDayLabel(day: number, isZh: boolean) {
  return isZh ? DAY_LABELS_ZH[day] : DAY_LABELS_EN[day];
}

function getSessionShort(session: TrainingSession, isZh: boolean) {
  if (session.type === 'rest') return isZh ? '休' : 'Rest';
  if (session.type === 'long') return isZh ? '长' : 'Long';
  if (session.type === 'interval') return isZh ? '间' : 'VO2';
  if (session.type === 'tempo') return isZh ? '阈' : 'T';
  if (session.type === 'recovery') return isZh ? '恢' : 'Rec';
  if (session.type === 'race') return isZh ? '赛' : 'Race';
  return isZh ? '轻' : 'Easy';
}

function getSessionTone(type: TrainingSession['type']) {
  const tones: Record<TrainingSession['type'], string> = {
    easy: 'border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300',
    long: 'border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-300',
    tempo: 'border-orange-100 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300',
    interval: 'border-red-100 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300',
    recovery: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300',
    rest: 'border-zinc-100 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500',
    race: 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300',
  };
  return tones[type];
}

function getPlanGuardrails(isZh: boolean) {
  return isZh
    ? ['疲劳高：质量课改 40min E 区', '心率飘高：降速，不硬顶配速', '疼痛出现：休息，不补课']
    : ['High fatigue: swap quality for 40min E', 'HR drift: slow down, do not force pace', 'Pain: rest, do not make up missed work'];
}

function ClassSchedulePreview({
  week,
  isZh,
  t,
}: {
  week?: WeeklyPlan;
  isZh: boolean;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (!week) return null;

  return (
    <div className="border border-blue-100 bg-white p-3 dark:border-blue-900/50 dark:bg-zinc-950">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-pixel text-xs font-bold text-zinc-950 dark:text-zinc-50">
            {t('trainingPlan.classSchedule', isZh ? '本周课表' : 'Week Schedule')}
          </p>
          <p className="mt-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
            {week.focus || week.notes}
          </p>
        </div>
        <ListChecks size={16} className="shrink-0 text-blue-600 dark:text-blue-300" />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, day) => {
          const session = week.sessions.find((item) => item.day === day);
          return (
            <div
              key={day}
              className={[
                'min-h-[74px] border px-1.5 py-2',
                session ? getSessionTone(session.type) : 'border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900',
              ].join(' ')}
            >
              <p className="font-mono text-[9px] font-bold text-zinc-500 dark:text-zinc-400">
                {getDayLabel(day, isZh)}
              </p>
              <p className="mt-2 font-mono text-base font-black">{session ? getSessionShort(session, isZh) : '-'}</p>
              {session && session.type !== 'rest' && (
                <p className="mt-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                  {session.distance > 0 ? `${session.distance}km` : session.duration}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrainingPlanView({ plan, activities = [], onRegenerate, onDelete }: TrainingPlanViewProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === 'zh';
  const distanceLabel = isZh
    ? getDistanceLabel(plan.goal.distance)
    : getDistanceLabelEn(plan.goal.distance);
  const targetPaceSec = plan.goal.targetTimeSeconds / DISTANCE_KM[plan.goal.distance];
  const totalDistance = plan.weeks.reduce((sum, week) => sum + week.totalDistance, 0);
  const peakWeek = plan.weeks.reduce((best, week) => (
    week.totalDistance > best.totalDistance ? week : best
  ), plan.weeks[0]);
  const averageWeeklyDistance = Math.round(totalDistance / Math.max(1, plan.weeks.length));
  const zones = plan.currentAbility.pb5k ? calculatePaceZones(plan.currentAbility.pb5k) : null;
  const execution = React.useMemo(
    () => calculateTrainingPlanExecution(plan, activities),
    [plan, activities]
  );
  const nextSession = execution.sessions.find((session) => session.status === 'upcoming');
  const timing = getPlanTiming(plan);
  const currentWeek = execution.currentWeek ?? timing.currentWeek;
  const daysToRace = timing.daysToRace;
  const currentWeekPlan = currentWeek
    ? plan.weeks.find((week) => week.week === currentWeek)
    : plan.weeks[0];
  const currentKeySessions = getWeekKeySessions(currentWeekPlan);
  const maxWeekDistance = Math.max(...plan.weeks.map((week) => week.totalDistance), 1);
  const abilityGroup = plan.currentAbility.abilityGroup
    ?? getTrainingAbilityGroup(plan.currentAbility.pb5k, plan.currentAbility.weeklyVolume, i18n.language);
  const weeklyRhythm = isZh
    ? '周一休息 / 周三质量 / 周日长距离'
    : 'Mon rest / Wed quality / Sun long run';
  const guardrails = getPlanGuardrails(isZh);

  const phaseLabel: Record<WeeklyPlan['phase'], string> = {
    base: t('trainingPlan.phaseBase', '基础期'),
    build: t('trainingPlan.phaseBuild', '建立期'),
    peak: t('trainingPlan.phasePeak', '巅峰期'),
    taper: t('trainingPlan.phaseTaper', '减量期'),
    recovery: t('trainingPlan.phaseRecovery', '恢复期'),
  };

  return (
    <div className="space-y-5">
      <section className="border-4 border-zinc-900 bg-white dark:border-zinc-100 dark:bg-zinc-950">
        <div className="border-b-2 border-zinc-100 px-4 py-4 dark:border-zinc-800">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-[10px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                <Target size={12} />
                {t('trainingPlan.goalRace', '目标赛事')}
              </div>
              <h2 className="font-pixel text-xl font-bold leading-tight text-zinc-950 dark:text-zinc-50">
                {distanceLabel} {t('trainingPlan.planTitle', '训练计划')}
              </h2>
              <p className="mt-2 font-mono text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {t('trainingPlan.planSubtitle', '围绕目标配速、关键训练和恢复周编排的周期化计划')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onRegenerate && (
                <PixelButton variant="secondary" size="sm" onClick={onRegenerate} title={t('trainingPlan.regenerate', '重新生成')}>
                  <RefreshCw size={14} />
                </PixelButton>
              )}
              {onDelete && (
                <PixelButton variant="outline" size="sm" onClick={onDelete} title={t('common.delete')}>
                  <Trash2 size={14} />
                </PixelButton>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          <StatTile
            icon={<Flag size={14} />}
            label={t('trainingPlan.targetTime', '目标时间')}
            value={formatTime(plan.goal.targetTimeSeconds)}
            accent="text-red-600 dark:text-red-300"
          />
          <StatTile
            icon={<Gauge size={14} />}
            label={t('trainingPlan.targetPace', '目标配速')}
            value={`${formatPaceSec(targetPaceSec)}/km`}
            accent="text-orange-600 dark:text-orange-300"
          />
          <StatTile
            icon={<CalendarDays size={14} />}
            label={t('trainingPlan.planLength', '计划周期')}
            value={`${plan.weeks.length}${t('trainingPlan.weeksUnit', '周')}`}
            accent="text-blue-600 dark:text-blue-300"
          />
          <StatTile
            icon={<TrendingUp size={14} />}
            label={t('trainingPlan.avgWeeklyDistance', '平均周量')}
            value={`${averageWeeklyDistance}km`}
            accent="text-emerald-600 dark:text-emerald-300"
          />
        </div>

        <div className="border-t-2 border-zinc-100 p-3 dark:border-zinc-800">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="border border-zinc-100 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="font-mono text-[10px] text-zinc-500">
                {t('trainingPlan.abilityGroup', isZh ? '能力分组' : 'Ability Group')}
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="font-pixel text-lg font-bold text-zinc-950 dark:text-zinc-50">{abilityGroup.label}</p>
                <span className="border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                  {abilityGroup.target10k}
                </span>
              </div>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {abilityGroup.description}
              </p>
            </div>
            <div className="border border-zinc-100 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <p className="font-mono text-[10px] text-zinc-500">
                {t('trainingPlan.weekRhythm', isZh ? '固定周节奏' : 'Weekly Rhythm')}
              </p>
              <p className="mt-2 font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50">{weeklyRhythm}</p>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {isZh
                  ? '把强度、恢复和长距离错开，减少临时补课和连续疲劳。'
                  : 'Hard days, recovery, and long run are separated to avoid stacked fatigue.'}
              </p>
            </div>
            <div className="border border-zinc-100 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-300" />
                <p className="font-mono text-[10px] text-zinc-500">
                  {t('trainingPlan.guardrails', isZh ? '执行边界' : 'Guardrails')}
                </p>
              </div>
              <div className="mt-2 space-y-1.5">
                {guardrails.map((item) => (
                  <p key={item} className="font-mono text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-2 border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={17} className="text-emerald-600 dark:text-emerald-300" />
              <h3 className="font-pixel text-sm font-bold">
                {t('trainingPlan.executionProgress', '计划执行')}
              </h3>
            </div>
            <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {t('trainingPlan.executionProgressHint', '自动匹配计划日期前后一天内的 Strava 跑步记录')}
            </p>
          </div>
          <p className="font-mono text-2xl font-black text-zinc-950 dark:text-zinc-50">
            {execution.dueCount > 0
              ? `${execution.completionRate}%`
              : t('trainingPlan.notStarted')}
          </p>
        </div>

        <div className="mt-4 h-2 overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-emerald-500 transition-[width]"
            style={{ width: `${execution.completionRate}%` }}
          />
        </div>
        {execution.dueCount > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ExecutionMetric
              icon={<CheckCircle2 size={13} className="text-emerald-600" />}
              label={t('trainingPlan.completedSessions', '已完成')}
              value={`${execution.completedCount}/${execution.dueCount}`}
            />
            <ExecutionMetric
              icon={<CircleDashed size={13} className="text-amber-600" />}
              label={t('trainingPlan.partialSessions', '部分完成')}
              value={String(execution.partialCount)}
            />
            <ExecutionMetric
              icon={<XCircle size={13} className="text-red-500" />}
              label={t('trainingPlan.missedSessions', '未完成')}
              value={String(execution.missedCount)}
            />
            <ExecutionMetric
              icon={<TrendingUp size={13} className="text-blue-600" />}
              label={t('trainingPlan.actualVsPlanned', '实际 / 计划')}
              value={`${Math.round(execution.actualDueDistance)}/${Math.round(execution.plannedDueDistance)}km`}
            />
          </div>
        ) : (
          <div className="mt-4 border border-zinc-100 bg-zinc-50 px-3 py-3 font-mono text-[11px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
            {nextSession
              ? t('trainingPlan.firstSessionOn', {
                  date: new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', {
                    month: 'short',
                    day: 'numeric',
                  }).format(nextSession.date),
                })
              : t('trainingPlan.noSessionsDue')}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-[1.2fr_0.8fr]">
        <div className="border-2 border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-pixel text-sm font-bold">{t('trainingPlan.volumeRamp', '周跑量节奏')}</h3>
              <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {t('trainingPlan.volumeRampHint', '先建立容量，再进入专项和减量')}
              </p>
            </div>
            <div className="shrink-0 text-right font-mono">
              <p className="text-lg font-bold">{totalDistance}km</p>
              <p className="text-[10px] text-zinc-500">{t('trainingPlan.totalVolume', '总量')}</p>
            </div>
          </div>
          <div className="flex h-28 items-end gap-1">
            {plan.weeks.map((week) => (
              <div key={week.week} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={[
                    'w-full min-w-0 border border-white/40',
                    PHASE_BAR[week.phase],
                    currentWeek === week.week ? 'ring-2 ring-zinc-900 dark:ring-zinc-100' : '',
                  ].join(' ')}
                  style={{ height: `${Math.max(12, (week.totalDistance / maxWeekDistance) * 96)}px` }}
                  title={`${t('trainingPlan.week', { week: week.week, defaultValue: `Week ${week.week}` })}: ${week.totalDistance}km`}
                />
                <span className="font-mono text-[9px] text-zinc-400">{week.week}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(PHASE_BAR) as WeeklyPlan['phase'][]).map((phase) => (
              <span key={phase} className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                <span className={['h-2 w-2 border border-white/40', PHASE_BAR[phase]].join(' ')} />
                {phaseLabel[phase]}
              </span>
            ))}
          </div>
        </div>

        <div className="border-2 border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="font-pixel text-sm font-bold">{t('trainingPlan.raceCountdown', '比赛节奏')}</h3>
          <div className="mt-3 space-y-3">
            <div className="border border-zinc-100 px-3 py-3 dark:border-zinc-800">
              <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.raceDate', '比赛日期')}</p>
              <p className="mt-1 font-mono text-base font-bold">
                {plan.goal.raceDate || t('trainingPlan.noRaceDate', '未设置')}
              </p>
            </div>
            <div className="border border-zinc-100 px-3 py-3 dark:border-zinc-800">
              <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.daysToRace', '距离比赛')}</p>
              <p className="mt-1 font-mono text-base font-bold">
                {typeof daysToRace === 'number'
                  ? daysToRace >= 0
                    ? t('trainingPlan.daysCount', '{{days}} 天', { days: daysToRace })
                    : t('trainingPlan.racePassed', '已结束')
                  : t('trainingPlan.followPlanByWeek', '按周推进')}
              </p>
            </div>
            <div className="border border-zinc-100 px-3 py-3 dark:border-zinc-800">
              <p className="font-mono text-[10px] text-zinc-500">{t('trainingPlan.peakWeek', '峰值周')}</p>
              <p className="mt-1 font-mono text-base font-bold">
                {t('trainingPlan.week', { week: peakWeek.week, defaultValue: `Week ${peakWeek.week}` })} · {peakWeek.totalDistance}km
              </p>
            </div>
          </div>
        </div>
      </section>

      {currentWeekPlan && (
        <section className="border-2 border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/20">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-pixel text-sm font-bold text-zinc-950 dark:text-zinc-50">
                {t('trainingPlan.thisWeekFocus', '本周重点')}
              </h3>
              <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {t('trainingPlan.week', { week: currentWeekPlan.week, defaultValue: `Week ${currentWeekPlan.week}` })} · {phaseLabel[currentWeekPlan.phase]} · {currentWeekPlan.totalDistance}km
              </p>
            </div>
            <LineChart size={18} className="text-blue-600 dark:text-blue-300" />
          </div>

          <ClassSchedulePreview week={currentWeekPlan} isZh={isZh} t={t} />

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(currentKeySessions.length > 0 ? currentKeySessions : currentWeekPlan.sessions.filter((session) => session.type !== 'rest').slice(0, 2)).map((session) => (
              <div key={`${session.day}-${session.type}`} className="border border-blue-100 bg-white px-3 py-3 dark:border-blue-900/50 dark:bg-zinc-950">
                <p className="font-mono text-[10px] text-zinc-500">
                  {getDayLabel(session.day, isZh)}
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50">
                  {getSessionTitle(session, isZh, t)}
                </p>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {session.distance > 0 ? `${session.distance}km` : session.duration}
                  {session.paceZone ? ` · ${session.paceZone}` : ''}
                </p>
              </div>
            ))}
          </div>
          {currentWeekPlan.notes && (
            <p className="mt-3 border-l-2 border-blue-300 pl-3 font-mono text-[11px] leading-relaxed text-zinc-600 dark:border-blue-800 dark:text-zinc-300">
              {currentWeekPlan.notes}
            </p>
          )}
        </section>
      )}

      {zones && (
        <section className="border-2 border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-pixel text-sm font-bold">{t('aiAnalysis.paceZone', '配速区间')}</h3>
              <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {t('trainingPlan.paceZoneHint', '基于 5K PB 推算，用于判断每天训练强度')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(['E', 'M', 'T', 'I', 'R'] as const).map((zone) => (
              <div key={zone} className="border border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <p className="font-mono text-xs font-bold text-zinc-950 dark:text-zinc-50">{zone}</p>
                <p className="mt-1 font-mono text-[11px] text-zinc-500">
                  {formatPaceSec(zones[zone].min)}-{formatPaceSec(zones[zone].max)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="font-pixel text-sm font-bold">{t('trainingPlan.weeklySchedule', '周计划')}</h3>
            <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {t('trainingPlan.weeklyScheduleHint', '展开每周查看训练日、关键课和恢复安排')}
            </p>
          </div>
        </div>
        {plan.weeks.map((week) => (
          <TrainingPlanCard
            key={week.week}
            week={week}
            execution={execution.weeks.find((item) => item.week === week.week)}
            isCurrent={currentWeek === week.week}
            defaultExpanded={week.week === 1 && !currentWeek}
          />
        ))}
      </section>
    </div>
  );
}

function ExecutionMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-zinc-100 px-3 py-2.5 dark:border-zinc-800">
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase text-zinc-400">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1.5 truncate font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
