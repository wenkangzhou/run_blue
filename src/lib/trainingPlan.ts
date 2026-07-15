import { getLthrHRZones } from './heartRateZones';
import { calculateSemanticPaceZones } from './trainingZones';
import { formatPaceSeconds } from './paceFormat';
import { formatSecondsToTime, getUserProfile } from './userProfile';

export type RaceDistance = '5k' | '10k' | '21k' | '42k';
export type AbilityGroupCode = 'A+' | 'A' | 'B' | 'C' | 'D' | 'N' | 'E';

export interface AbilityGroup {
  code: AbilityGroupCode;
  label: string;
  target10k: string;
  equivalent10k: string;
  target10kPace: string;
  volumeBand: string;
  description: string;
}

export interface WeeklyPlan {
  week: number;
  phase: 'base' | 'build' | 'peak' | 'taper' | 'recovery';
  totalDistance: number; // target km
  sessions: TrainingSession[];
  notes: string;
  focus?: string;
}

export interface TrainingSession {
  day: number; // 0=Monday ~ 6=Sunday
  type: 'easy' | 'long' | 'tempo' | 'interval' | 'recovery' | 'rest' | 'race';
  title: string;
  description: string;
  distance: number; // km
  duration?: string;
  paceZone?: string;
}

export interface TrainingSessionExecutionOverride {
  matchMode?: 'manual' | 'none';
  activityId?: number;
  skipped?: boolean;
  dateOffsetDays?: number;
  updatedAt: string;
}

export interface TrainingPlan {
  id: string;
  createdAt: string;
  goal: {
    distance: RaceDistance;
    targetTimeSeconds: number;
    raceDate?: string;
  };
  currentAbility: {
    pb5k?: number;
    pb10k?: number;
    pb21k?: number;
    pb42k?: number;
    weeklyVolume: number;
    lthr?: number;
    abilityGroup?: AbilityGroup;
  };
  weeks: WeeklyPlan[];
  executionOverrides?: Record<string, TrainingSessionExecutionOverride>;
}

export class TrainingPlanInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrainingPlanInputError';
  }
}

const STORAGE_KEY = 'runblue_training_plans';
const TRAINING_PLAN_DB = 'run_blue_training_plan_cache';
const TRAINING_PLAN_STORE = 'training_plans';
const TRAINING_PLAN_DB_VERSION = 1;

function isBrowser() {
  return typeof window !== 'undefined';
}

function hasIndexedDb() {
  return isBrowser() && typeof window.indexedDB !== 'undefined';
}

function normalizeStoredPlans(value: unknown): TrainingPlan[] {
  return Array.isArray(value) ? value : [];
}

function readLegacyStoredPlans(): TrainingPlan[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeStoredPlans(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeLegacyStoredPlans(plans: TrainingPlan[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // Plan generation still succeeds when caching cannot be written.
  }
}

function removeLegacyStoredPlans() {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}

function openTrainingPlanDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(TRAINING_PLAN_DB, TRAINING_PLAN_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRAINING_PLAN_STORE)) {
        db.createObjectStore(TRAINING_PLAN_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`IndexedDB "${TRAINING_PLAN_DB}" upgrade is blocked`));
  });
}

async function runTrainingPlanOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const db = await openTrainingPlanDatabase();
  if (!db) return null;

  return new Promise<T | null>((resolve, reject) => {
    const transaction = db.transaction(TRAINING_PLAN_STORE, mode);
    const store = transaction.objectStore(TRAINING_PLAN_STORE);
    let result: T | null = null;

    try {
      const request = operation(store);
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getIndexedStoredPlans(): Promise<TrainingPlan[] | null> {
  const indexedValue = await runTrainingPlanOperation<TrainingPlan[]>(
    'readonly',
    (store) => store.get(STORAGE_KEY)
  );
  return indexedValue ? normalizeStoredPlans(indexedValue) : null;
}

async function writeIndexedStoredPlans(plans: TrainingPlan[]): Promise<void> {
  await runTrainingPlanOperation<IDBValidKey>(
    'readwrite',
    (store) => store.put(plans, STORAGE_KEY)
  );
}

async function deleteIndexedStoredPlans(): Promise<void> {
  await runTrainingPlanOperation<undefined>(
    'readwrite',
    (store) => store.delete(STORAGE_KEY)
  );
}

async function getStoredPlans(): Promise<TrainingPlan[]> {
  if (!isBrowser()) return [];

  try {
    const indexedPlans = await getIndexedStoredPlans();
    if (indexedPlans) return indexedPlans;
  } catch {
    // Fall back to legacy localStorage below.
  }

  const legacyPlans = readLegacyStoredPlans();
  if (legacyPlans.length > 0 && hasIndexedDb()) {
    try {
      await writeIndexedStoredPlans(legacyPlans);
      removeLegacyStoredPlans();
    } catch {
      // Keep localStorage data if migration fails.
    }
  }
  return legacyPlans;
}

async function setStoredPlans(plans: TrainingPlan[]): Promise<void> {
  if (!isBrowser()) return;

  if (hasIndexedDb()) {
    try {
      await writeIndexedStoredPlans(plans);
      removeLegacyStoredPlans();
      return;
    } catch {
      // Fall through to legacy localStorage.
    }
  }

  writeLegacyStoredPlans(plans);
}

export function getStoredTrainingPlans(): Promise<TrainingPlan[]> {
  return getStoredPlans();
}

export async function getStoredTrainingPlan(id?: string): Promise<TrainingPlan | null> {
  const plans = await getStoredPlans();
  const found = id ? plans.find((p) => p.id === id) : plans[0] || null;
  return found || null;
}

export async function saveTrainingPlan(plan: TrainingPlan): Promise<void> {
  const plans = await getStoredPlans();
  const existingIndex = plans.findIndex((p) => p.id === plan.id);
  if (existingIndex >= 0) {
    plans[existingIndex] = plan;
  } else {
    plans.unshift(plan);
  }
  await setStoredPlans(plans);
}

export async function deleteTrainingPlan(id: string): Promise<void> {
  const plans = (await getStoredPlans()).filter((p) => p.id !== id);
  await setStoredPlans(plans);
}

export async function clearTrainingPlans(): Promise<void> {
  if (!isBrowser()) return;

  try {
    await deleteIndexedStoredPlans();
  } catch {
    // Ignore IndexedDB cleanup failures.
  }

  removeLegacyStoredPlans();
}

// Backward compat aliases
export function clearTrainingPlan(): Promise<void> {
  return clearTrainingPlans();
}

export function estimatePlanWeeks(distance: RaceDistance): number {
  switch (distance) {
    case '5k': return 8;
    case '10k': return 10;
    case '21k': return 12;
    case '42k': return 16;
    default: return 12;
  }
}

export function getDistanceLabel(distance: RaceDistance): string {
  const labels: Record<RaceDistance, string> = {
    '5k': '5公里',
    '10k': '10公里',
    '21k': '半程马拉松',
    '42k': '全程马拉松',
  };
  return labels[distance];
}

export function getDistanceLabelEn(distance: RaceDistance): string {
  const labels: Record<RaceDistance, string> = {
    '5k': '5K',
    '10k': '10K',
    '21k': 'Half Marathon',
    '42k': 'Full Marathon',
  };
  return labels[distance];
}

export function calculatePaceZones(pb5kSec: number) {
  const zones = calculateSemanticPaceZones(pb5kSec);
  return {
    E: { min: zones.easy.min, max: zones.easy.max, desc: '轻松跑' },
    M: { min: zones.marathon.min, max: zones.marathon.max, desc: '稳态/马拉松配速' },
    T: { min: zones.threshold.min, max: zones.threshold.max, desc: '乳酸阈值' },
    I: { min: zones.interval.min, max: zones.interval.max, desc: '间歇跑' },
    R: { min: zones.repetition.min, max: zones.repetition.max, desc: '重复跑' },
  };
}

/**
 * Riegel formula: predict equivalent performance at another distance.
 * T2 = T1 * (D2/D1)^1.06
 */
function predictTimeFrom5K(pb5kSec: number, targetDistanceKm: number): number {
  const ratio = targetDistanceKm / 5;
  return pb5kSec * Math.pow(ratio, 1.06);
}

interface GoalAssessment {
  realistic: boolean;
  profile: 'elite' | 'maintain' | 'breakthrough' | 'mass_completion' | 'too_conservative';
  profileLabel: string;
  equivalentTime: number;
  gapPercent: number;
  message: string;
}

function getRaceDistanceKm(distance: RaceDistance): number {
  return distance === '5k' ? 5 : distance === '10k' ? 10 : distance === '21k' ? 21.0975 : 42.195;
}

export interface RecommendedTargetTime {
  seconds: number;
  sourceDistance: RaceDistance;
  sourceSeconds: number;
  estimated: boolean;
}

export function getRecommendedTargetTime(
  pbs: Partial<Record<RaceDistance, number | null>> | null | undefined,
  targetDistance: RaceDistance
): RecommendedTargetTime | null {
  if (!pbs) return null;

  const exact = pbs[targetDistance];
  if (typeof exact === 'number' && Number.isFinite(exact) && exact > 0) {
    return {
      seconds: Math.round(exact),
      sourceDistance: targetDistance,
      sourceSeconds: Math.round(exact),
      estimated: false,
    };
  }

  const targetKm = getRaceDistanceKm(targetDistance);
  const candidates = (Object.keys(pbs) as RaceDistance[])
    .map((distance) => ({
      distance,
      seconds: pbs[distance],
      km: getRaceDistanceKm(distance),
    }))
    .filter((candidate): candidate is { distance: RaceDistance; seconds: number; km: number } => (
      typeof candidate.seconds === 'number'
      && Number.isFinite(candidate.seconds)
      && candidate.seconds > 0
    ))
    .sort((left, right) => (
      Math.abs(Math.log(targetKm / left.km)) - Math.abs(Math.log(targetKm / right.km))
    ));

  const source = candidates[0];
  if (!source) return null;

  return {
    seconds: Math.round(source.seconds * Math.pow(targetKm / source.km, 1.06)),
    sourceDistance: source.distance,
    sourceSeconds: Math.round(source.seconds),
    estimated: true,
  };
}

function getRaceDistanceName(distance: RaceDistance, en: boolean): string {
  if (en) {
    return distance === '42k'
      ? 'marathon'
      : distance === '21k'
        ? 'half marathon'
        : distance === '10k'
          ? '10K'
          : '5K';
  }
  return distance === '42k'
    ? '全马'
    : distance === '21k'
      ? '半马'
      : distance === '10k'
        ? '10公里'
        : '5公里';
}

function getWeeklyVolumeBand(weeklyVolume: number, en: boolean): string {
  if (weeklyVolume >= 65) return en ? 'High volume' : '高跑量';
  if (weeklyVolume >= 45) return en ? 'Solid volume' : '稳定跑量';
  if (weeklyVolume >= 25) return en ? 'Base volume' : '基础跑量';
  return en ? 'Low volume' : '低跑量';
}

export function getTrainingAbilityGroup(
  pb5kSec?: number,
  weeklyVolume: number = 0,
  locale: string = 'zh'
): AbilityGroup {
  const en = locale.startsWith('en');
  const volumeBand = getWeeklyVolumeBand(weeklyVolume, en);

  if (!pb5kSec || pb5kSec <= 0) {
    return {
      code: 'E',
      label: en ? 'Entry group' : '入门组',
      target10k: en ? 'Build consistency' : '先建立连续训练',
      equivalent10k: '--',
      target10kPace: '--',
      volumeBand,
      description: en
        ? `No 5K PB yet. Use ${volumeBand.toLowerCase()} as the first anchor and keep most runs easy.`
        : `尚未填写 5K PB，先以${volumeBand}为锚点，绝大多数训练保持轻松。`,
    };
  }

  const equivalent10kSec = Math.round(predictTimeFrom5K(pb5kSec, 10));
  const groups: Array<{ code: AbilityGroupCode; max10k: number; target: string; label: string }> = [
    { code: 'A+', max10k: 36 * 60, target: 'sub36', label: en ? 'A+ group' : 'A+组' },
    { code: 'A', max10k: 39 * 60, target: 'sub39', label: en ? 'A group' : 'A组' },
    { code: 'B', max10k: 43 * 60, target: 'sub43', label: en ? 'B group' : 'B组' },
    { code: 'C', max10k: 47 * 60, target: 'sub47', label: en ? 'C group' : 'C组' },
    { code: 'D', max10k: 52 * 60, target: 'sub52', label: en ? 'D group' : 'D组' },
    { code: 'N', max10k: 59 * 60, target: 'sub59', label: en ? 'New runner group' : '萌新组' },
  ];
  const group = groups.find((item) => equivalent10kSec <= item.max10k)
    ?? { code: 'E' as const, max10k: 65 * 60, target: en ? 'finish strong' : '稳定完赛', label: en ? 'Entry group' : '入门组' };
  const equivalent10k = formatSecondsToTime(equivalent10kSec);

  return {
    code: group.code,
    label: group.label,
    target10k: group.target,
    equivalent10k,
    target10kPace: formatPaceSeconds(group.max10k / 10),
    volumeBand,
    description: en
      ? `Estimated 10K is ${equivalent10k}. Use ${group.label} paces with a ${volumeBand.toLowerCase()} guardrail.`
      : `5K PB 推算 10K 约 ${equivalent10k}，按${group.label}配速组织训练，并用${volumeBand}控制负荷。`,
  };
}

function assessGoal(
  distance: RaceDistance,
  targetTimeSeconds: number,
  pb5kSec: number,
  locale: string = 'zh'
): GoalAssessment {
  const en = locale.startsWith('en');
  const equiv = predictTimeFrom5K(pb5kSec, getRaceDistanceKm(distance));
  const gap = ((targetTimeSeconds - equiv) / equiv) * 100;

  let profile: GoalAssessment['profile'];
  let label: string;
  let msg: string;

  if (gap < -5) {
    profile = 'elite';
    label = en ? 'Elite-level goal' : '精英级目标';
    msg = en
      ? 'Your goal is faster than your 5K PB equivalency. This is extremely ambitious and likely unrealistic unless your 5K PB is outdated.'
      : '你的目标比 5K PB 推算的等效成绩还快，这个目标极具挑战性。除非你的 5K PB 已经过时，否则不太现实。';
  } else if (gap <= 5) {
    profile = 'maintain';
    label = en ? 'Maintain / sharpen' : '维持/精进型';
    msg = en
      ? 'Your goal is close to your 5K PB equivalency. Focus on pace familiarity, race-specific workouts, and fine-tuning.'
      : '你的目标接近 5K PB 推算的等效成绩，课表侧重配速熟练度、比赛模拟和细节调整。';
  } else if (gap <= 15) {
    profile = 'breakthrough';
    label = en ? 'Breakthrough' : '突破型';
    msg = en
      ? 'Your goal is 5-15% slower than equivalency — a solid, achievable target.'
      : '你的目标比等效成绩慢 5-15%，是一个合理且有挑战的目标。';
  } else if (gap <= 30) {
    profile = 'mass_completion';
    label = en ? 'Completion focused' : '完赛型';
    msg = en
      ? 'Your goal is 15-30% slower than equivalency — a conservative, completion-focused target.'
      : '你的目标比等效成绩慢 15-30%，是一个偏保守、以完赛为导向的目标。';
  } else {
    profile = 'too_conservative';
    label = en ? 'Very conservative' : '过于保守';
    msg = en
      ? 'Your goal is more than 30% slower than equivalency. Consider setting a more challenging goal.'
      : '你的目标比等效成绩慢超过 30%，你完全有能力跑得更快。建议设定一个更有挑战性的目标。';
  }

  return {
    realistic: gap < 30 && gap > -10,
    profile,
    profileLabel: label,
    equivalentTime: Math.round(equiv),
    gapPercent: Math.round(gap * 10) / 10,
    message: msg,
  };
}

/* ── Helpers for building rich session descriptions ── */

function fmtPace(sec: number): string {
  return formatPaceSeconds(sec);
}

function buildRestDay(day: number, en: boolean): TrainingSession {
  return {
    day,
    type: 'rest',
    title: en ? 'Rest' : '跑休日',
    description: en
      ? 'Rest day. Complete rest. Light stretching, foam rolling, or yoga optional. Good day for extra sleep.'
      : '完全休息日。可选轻度拉伸、泡沫轴放松或瑜伽。适合补觉。',
    distance: 0,
  };
}

function buildEasyRun(
  day: number,
  minutes: number,
  zones: ReturnType<typeof calculatePaceZones>,
  hrZones: ReturnType<typeof getLthrHRZones>,
  en: boolean,
  isMonday: boolean = false
): TrainingSession {
  const paceMin = fmtPace(zones.E.min);
  const paceMax = fmtPace(zones.E.max);
  const dist = Math.round((minutes * 60) / ((zones.E.min + zones.E.max) / 2));
  const slowerMinPct = Math.round((zones.E.min / zones.M.min - 1) * 100);
  const slowerMaxPct = Math.round((zones.E.max / zones.M.min - 1) * 100);
  const monNote = isMonday
    ? (en ? '\nNote: Monday easy run helps build weekly aerobic volume. Keep it truly easy.' : '\n提示：周一轻松跑用于累积周跑量，务必保持轻松体感。')
    : '';
  const desc = en
    ? `Easy run ${minutes}min (~${dist}km)\nPace: ${paceMin}-${paceMax}/km (E zone, about ${slowerMinPct}-${slowerMaxPct}% slower than M pace)\nHR: ${hrZones.z2.min}-${hrZones.z2.max}bpm (Z2, 85-89% LTHR)\nFeel: conversational pace, natural stride, no pushing${monNote}`
    : `轻松跑${minutes}min（约${dist}km）\n配速建议：${paceMin}-${paceMax}/km（E区，约慢于M配速${slowerMinPct}-${slowerMaxPct}%）\n心率建议：${hrZones.z2.min}-${hrZones.z2.max}bpm（Z2，LTHR的85-89%）\n体感：能完整对话的轻松配速，步频自然，不刻意加速${monNote}`;
  const title = isMonday ? (en ? 'Easy' : '轻松跑') : (en ? 'Easy' : '轻松跑');
  return { day, type: 'easy', title, description: desc, distance: dist, paceZone: 'E' };
}

function buildRecoveryRun(
  day: number,
  zones: ReturnType<typeof calculatePaceZones>,
  hrZones: ReturnType<typeof getLthrHRZones>,
  en: boolean,
  minutes: number = 40
): TrainingSession {
  const slowPace = fmtPace(zones.E.max * 1.05);
  const dist = Math.round((minutes * 60) / zones.E.max);
  const desc = en
    ? `Recovery run ${minutes}min (~${dist}km)\nPace: slower than ${slowPace}/km (>60s slower than M pace)\nHR: <${hrZones.z2.min}bpm (Z1, <85% LTHR)\nFeel: very easy, can chat effortlessly, focus on relaxation and breathing\nTip: shorter stride, relaxed shoulders, nasal breathing if possible`
    : `恢复跑${minutes}min（约${dist}km）\n配速建议：慢于${slowPace}/km（慢于M配速60s以上）\n心率建议：<${hrZones.z2.min}bpm（Z1，LTHR的<85%）\n体感：极其轻松，可以边跑边聊天无压力\n要点：缩小步幅、放松肩膀、尝试鼻吸鼻呼`;
  return { day, type: 'recovery', title: en ? 'Recovery' : '恢复跑', description: desc, distance: dist, paceZone: 'E' };
}

function buildQualitySession(
  day: number,
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number,
  distance: RaceDistance,
  zones: ReturnType<typeof calculatePaceZones>,
  hrZones: ReturnType<typeof getLthrHRZones>,
  mPace: number,
  en: boolean
): TrainingSession {
  const baseEnd = Math.max(1, Math.floor(weeks * 0.25));
  const buildEnd = Math.max(baseEnd + 1, Math.floor(weeks * 0.65));
  const peakEnd = Math.max(buildEnd + 1, Math.floor(weeks * 0.85));
  const buildWeek = w - baseEnd;
  const peakWeek = w - buildEnd;

  const ePace = fmtPace((zones.E.min + zones.E.max) / 2);
  const tPace = fmtPace((zones.T.min + zones.T.max) / 2);
  const iPace = fmtPace((zones.I.min + zones.I.max) / 2);
  const rPace = fmtPace((zones.R.min + zones.R.max) / 2);
  const mPaceStr = fmtPace(mPace);

  const strength = en ? '\n+ Strength: legs & core 20min' : '\n+ 力量：下肢+核心 20min';

  let title: string;
  let desc: string;
  let dist: number;
  let pz: string | undefined;

  if (phase === 'base') {
    // Base: aerobic + light quality
    if (buildWeek % 4 === 1) {
      title = en ? 'Aerobic + Intervals' : '有氧节奏+间歇';
      desc = en
        ? `Aerobic + VO2max\n4km @ ${ePace} + 800m×4 @ ${iPace}, 2min jog rec\nPace: I zone ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\nHR: ≥${hrZones.z5.min}bpm (≥100% LTHR, Z5)${strength}`
        : `有氧节奏+间歇\n4km @ ${ePace} + 800m×4 @ ${iPace}，组休2min\n配速建议：I区 ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\n心率建议：≥${hrZones.z5.min}bpm（LTHR的≥100%，Z5 VO2max）${strength}`;
      dist = Math.round(4 + 4 * 0.8 + 2);
      pz = 'I';
    } else if (buildWeek % 4 === 2) {
      title = en ? 'Aerobic + Tempo' : '有氧节奏+阈值';
      desc = en
        ? `Aerobic + Threshold\n4km @ ${ePace} + 1km×3 @ ${tPace}, 2min jog rec\nPace: T zone ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}/km\nHR: ${hrZones.z4.min}-${hrZones.z4.max}bpm (95-99% LTHR, Z4)${strength}`
        : `有氧节奏+阈值\n4km @ ${ePace} + 1km×3 @ ${tPace}，组休2min\n配速建议：T区 ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}/km\n心率建议：${hrZones.z4.min}-${hrZones.z4.max}bpm（LTHR的95-99%，Z4阈值）${strength}`;
      dist = Math.round(4 + 3 + 2);
      pz = 'T';
    } else if (buildWeek % 4 === 3) {
      title = en ? 'Aerobic + Intervals' : '有氧节奏+间歇';
      desc = en
        ? `Aerobic + VO2max\n3km @ ${ePace} + 800m×6 @ ${iPace}, 2min jog rec\nPace: I zone ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\nHR: ≥${hrZones.z5.min}bpm (≥100% LTHR, Z5)${strength}`
        : `有氧节奏+间歇\n3km @ ${ePace} + 800m×6 @ ${iPace}，组休2min\n配速建议：I区 ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\n心率建议：≥${hrZones.z5.min}bpm（LTHR的≥100%，Z5 VO2max）${strength}`;
      dist = Math.round(3 + 6 * 0.8 + 2);
      pz = 'I';
    } else {
      title = en ? 'Mixed Quality' : '复合强度';
      desc = en
        ? `Mixed session\n2km @ ${ePace} + 1.2km×3 @ ${tPace} + 400m×4 @ ${rPace}, 90s jog rec\nPace: T ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}, R ${fmtPace(zones.R.min)}-${fmtPace(zones.R.max)}/km\nHR: ${hrZones.z4.min}-${hrZones.z5.min}bpm (Z4-Z5)${strength}`
        : `复合强度课\n2km @ ${ePace} + 1.2km×3 @ ${tPace} + 400m×4 @ ${rPace}，组休90s\n配速建议：T区 ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}，R区 ${fmtPace(zones.R.min)}-${fmtPace(zones.R.max)}/km\n心率建议：${hrZones.z4.min}-${hrZones.z5.min}bpm（Z4-Z5）${strength}`;
      dist = Math.round(2 + 3.6 + 1.6 + 2);
      pz = 'T';
    }
  } else if (phase === 'build') {
    const isRecovery = buildWeek % 3 === 0 && buildWeek > 0;
    if (isRecovery) {
      title = en ? 'Light Quality' : '轻强度';
      desc = en
        ? `Light activation\n3km @ ${ePace} + 800m×4 @ ${iPace}, 2min jog rec\nPace: I zone ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\nHR: ≥${hrZones.z5.min}bpm (≥100% LTHR, Z5)${strength}`
        : `轻量激活\n3km @ ${ePace} + 800m×4 @ ${iPace}，组休2min\n配速建议：I区 ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\n心率建议：≥${hrZones.z5.min}bpm（LTHR的≥100%，Z5 VO2max）${strength}`;
      dist = Math.round(3 + 4 * 0.8 + 2);
      pz = 'I';
    } else if (buildWeek % 3 === 1) {
      // Interval focus
      if (distance === '42k') {
        title = en ? 'Intervals' : '间歇训练';
        const reps = w < buildEnd - 1 ? 6 : 5;
        const repDist = w < buildEnd - 1 ? 800 : 1000;
        desc = en
          ? `Intervals\n${reps}×${repDist}m @ ${iPace}, 2-3min jog rec\nPace: I zone ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\nHR: ≥${hrZones.z5.min}bpm (≥100% LTHR, Z5)${strength}`
          : `间歇训练\n${reps}×${repDist}m @ ${iPace}，组休2-3min\n配速建议：I区 ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\n心率建议：≥${hrZones.z5.min}bpm（LTHR的≥100%，Z5 VO2max）${strength}`;
        dist = Math.round((reps * repDist) / 1000 * 0.8 + 3);
        pz = 'I';
      } else {
        title = en ? 'Intervals' : '间歇训练';
        desc = en
          ? `Intervals\n5×1000m @ ${iPace}, 2.5min jog rec\nPace: I zone ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\nHR: ≥${hrZones.z5.min}bpm (≥100% LTHR, Z5)${strength}`
          : `间歇训练\n5×1000m @ ${iPace}，组休2.5min\n配速建议：I区 ${fmtPace(zones.I.min)}-${fmtPace(zones.I.max)}/km\n心率建议：≥${hrZones.z5.min}bpm（LTHR的≥100%，Z5 VO2max）${strength}`;
        dist = Math.round(5 + 3);
        pz = 'I';
      }
    } else {
      // Tempo focus
      title = en ? 'Tempo' : '阈值跑';
      const tempoDist = w < buildEnd - 2 ? 8 : w < buildEnd - 1 ? 10 : 12;
      desc = en
        ? `Tempo run\n${tempoDist}km @ ${tPace}\nPace: T zone ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}/km\nHR: ${hrZones.z4.min}-${hrZones.z4.max}bpm (95-99% LTHR, Z4)${strength}`
        : `阈值跑\n${tempoDist}km @ ${tPace}\n配速建议：T区 ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}/km\n心率建议：${hrZones.z4.min}-${hrZones.z4.max}bpm（LTHR的95-99%，Z4阈值）${strength}`;
      dist = Math.round(tempoDist + 3);
      pz = 'T';
    }
  } else if (phase === 'peak') {
    const isRecovery = peakWeek % 3 === 0 && peakWeek > 0;
    if (isRecovery) {
      title = en ? 'Light Quality' : '轻强度';
      desc = en
        ? `Light activation\n3km @ ${ePace} + 1km×2 @ ${tPace}, 2min jog rec\nPace: T zone ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}/km\nHR: ${hrZones.z4.min}-${hrZones.z4.max}bpm (Z4)${strength}`
        : `轻量激活\n3km @ ${ePace} + 1km×2 @ ${tPace}，组休2min\n配速建议：T区 ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}/km\n心率建议：${hrZones.z4.min}-${hrZones.z4.max}bpm（Z4阈值）${strength}`;
      dist = Math.round(3 + 2 + 2);
      pz = 'T';
    } else if (peakWeek % 3 === 1) {
      title = en ? 'Tempo' : '阈值跑';
      desc = en
        ? `Tempo run\n1×5km @ ${tPace} + 2km @ ${ePace}\nPace: T zone ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}/km\nHR: ${hrZones.z4.min}-${hrZones.z4.max}bpm (95-99% LTHR, Z4)${strength}`
        : `阈值跑\n1×5km @ ${tPace} + 2km @ ${ePace}\n配速建议：T区 ${fmtPace(zones.T.min)}-${fmtPace(zones.T.max)}/km\n心率建议：${hrZones.z4.min}-${hrZones.z4.max}bpm（LTHR的95-99%，Z4阈值）${strength}`;
      dist = Math.round(5 + 2 + 2);
      pz = 'T';
    } else {
      title = en ? 'Race Pace' : '比赛配速';
      desc = en
        ? `Race pace blocks\n5km @ ${mPaceStr} (M pace) + 3km @ ${ePace}\nPace: M zone ${fmtPace(zones.M.min)}-${fmtPace(zones.M.max)}/km\nHR: ${hrZones.z3.min}-${hrZones.z3.max}bpm (90-94% LTHR, Z3)${strength}`
        : `比赛配速段落\n5km @ ${mPaceStr}（M配速）+ 3km @ ${ePace}\n配速建议：M区 ${fmtPace(zones.M.min)}-${fmtPace(zones.M.max)}/km\n心率建议：${hrZones.z3.min}-${hrZones.z3.max}bpm（LTHR的90-94%，Z3马拉松配速）${strength}`;
      dist = Math.round(5 + 3 + 2);
      pz = 'M';
    }
  } else {
    // Taper
    if (w === weeks) {
      title = en ? 'Light Activation' : '轻量激活';
      desc = en ? 'Light jog 20-30min, optional strides' : '轻度慢跑20-30min，可选轻快跑';
      dist = 3;
      pz = 'E';
    } else if ((w - peakEnd) % 2 === 1) {
      title = en ? 'Speed' : '轻速度';
      desc = en
        ? `Speed activation\n6×400m @ ${rPace}, 90s jog rec\nPace: R zone ${fmtPace(zones.R.min)}-${fmtPace(zones.R.max)}/km\nHR: ≥${hrZones.z5.min}bpm (Z5)${strength}`
        : `速度激活\n6×400m @ ${rPace}，组休90s\n配速建议：R区 ${fmtPace(zones.R.min)}-${fmtPace(zones.R.max)}/km\n心率建议：≥${hrZones.z5.min}bpm（Z5 VO2max）${strength}`;
      dist = Math.round(6 * 0.4 + 2);
      pz = 'R';
    } else {
      title = en ? 'Speed' : '轻速度';
      desc = en
        ? `Speed activation\n8×200m @ ${rPace} + 2km @ ${ePace}\nPace: R zone ${fmtPace(zones.R.min)}-${fmtPace(zones.R.max)}/km\nHR: ≥${hrZones.z5.min}bpm (Z5)${strength}`
        : `速度激活\n8×200m @ ${rPace} + 2km @ ${ePace}\n配速建议：R区 ${fmtPace(zones.R.min)}-${fmtPace(zones.R.max)}/km\n心率建议：≥${hrZones.z5.min}bpm（Z5 VO2max）${strength}`;
      dist = Math.round(8 * 0.2 + 2 + 2);
      pz = 'R';
    }
  }

  const type: TrainingSession['type'] = pz === 'T' || pz === 'M' ? 'tempo' : 'interval';
  return { day, type, title, description: desc, distance: dist, paceZone: pz };
}

function buildLSD(
  day: number,
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number,
  distance: RaceDistance,
  targetVol: number,
  zones: ReturnType<typeof calculatePaceZones>,
  hrZones: ReturnType<typeof getLthrHRZones>,
  mPace: number,
  en: boolean
): TrainingSession {
  const baseEnd = Math.max(1, Math.floor(weeks * 0.25));
  const buildEnd = Math.max(baseEnd + 1, Math.floor(weeks * 0.65));
  const peakEnd = Math.max(buildEnd + 1, Math.floor(weeks * 0.85));

  // LSD distance: roughly 35-45% of weekly volume
  let lsdDist: number;
  if (phase === 'base') {
    const p = (w - 1) / Math.max(1, baseEnd - 1);
    lsdDist = Math.round(targetVol * (0.32 + p * 0.08));
  } else if (phase === 'build') {
    const p = (w - baseEnd) / Math.max(1, buildEnd - baseEnd);
    lsdDist = Math.round(targetVol * (0.38 + p * 0.05));
  } else if (phase === 'peak') {
    lsdDist = Math.round(targetVol * 0.42);
  } else {
    const taperStart = peakEnd + 1;
    const p = (w - taperStart) / Math.max(1, weeks - taperStart);
    lsdDist = Math.round(targetVol * (0.35 - p * 0.15));
  }
  lsdDist = Math.max(8, Math.min(distance === '42k' ? 35 : distance === '21k' ? 25 : distance === '10k' ? 15 : 12, lsdDist));

  const ePaceMin = fmtPace(zones.E.min);
  const ePaceMax = fmtPace(zones.E.max);
  const minutes = Math.round((lsdDist * ((zones.E.min + zones.E.max) / 2)) / 60);

  let desc: string;
  const lsdTips = en
    ? '\nExecution: first 1/3 very easy, middle 1/3 steady, last 1/5 do NOT speed up. Hydrate every 20-30min. Fuel if >90min.'
    : '\n执行要点：前1/3极轻松起步，中段稳定配速，最后1/5绝不加速。每20-30min补水，超过90min需补给能量。';

  const isBuildLate = phase === 'build' && (w - baseEnd) / Math.max(1, buildEnd - baseEnd) >= 0.6;
  const hasMPaceBlock = (phase === 'peak' || isBuildLate) && distance !== '5k' && lsdDist >= 15;

  if (hasMPaceBlock) {
    // Progression LSD: middle M-pace block
    const mPaceStr = fmtPace(mPace);
    let mKm: number;
    if (lsdDist >= 28) mKm = 10;
    else if (lsdDist >= 22) mKm = 8;
    else if (lsdDist >= 18) mKm = 6;
    else mKm = 5;
    const easyBefore = Math.max(3, Math.round((lsdDist - mKm) * 0.45));
    const easyAfter = lsdDist - easyBefore - mKm;
    desc = en
      ? `Progression LSD ${minutes}min (~${lsdDist}km)\n${easyBefore}km E @ ${ePaceMin}-${ePaceMax}/km + ${mKm}km M @ ${mPaceStr} + ${easyAfter}km E\nHR: ${hrZones.z2.min}-${hrZones.z3.max}bpm (Z2-Z3)\nFeel: relaxed early, focused in M block, easy finish${lsdTips}`
      : `渐进LSD ${minutes}min（约${lsdDist}km）\n${easyBefore}km E @ ${ePaceMin}-${ePaceMax}/km + ${mKm}km M @ ${mPaceStr} + ${easyAfter}km E\n心率建议：${hrZones.z2.min}-${hrZones.z3.max}bpm（Z2-Z3）\n体感：前段放松，M配速段专注控制，结束段回到放松${lsdTips}`;
  } else {
    // Even-pace LSD
    desc = en
      ? `Even-pace LSD ${minutes}min (~${lsdDist}km)\nPace: ${ePaceMin}-${ePaceMax}/km (E zone)\nHR: ${hrZones.z2.min}-${hrZones.z2.max}bpm (Z2)\nFeel: relaxed, should feel "too easy" at start${lsdTips}`
      : `匀速LSD ${minutes}min（约${lsdDist}km）\n配速建议：${ePaceMin}-${ePaceMax}/km（E区）\n心率建议：${hrZones.z2.min}-${hrZones.z2.max}bpm（Z2有氧基础）\n体感：全程放松，起步应感觉"太慢"${lsdTips}`;
  }

  return { day, type: 'long', title: en ? 'LSD' : '长距离', description: desc, distance: lsdDist, paceZone: 'E' };
}

function buildRaceDay(
  day: number,
  distance: RaceDistance,
  targetTimeSeconds: number,
  mPace: number,
  en: boolean
): TrainingSession {
  const raceDistKm = distance === '5k' ? 5 : distance === '10k' ? 10 : distance === '21k' ? 21.0975 : 42.195;
  const dist = Math.round(raceDistKm);
  const raceName = distance === '42k' ? (en ? 'Marathon' : '全程马拉松')
    : distance === '21k' ? (en ? 'Half Marathon' : '半程马拉松')
    : distance === '10k' ? (en ? '10K' : '10公里')
    : (en ? '5K' : '5公里');
  const h = Math.floor(targetTimeSeconds / 3600);
  const m = Math.floor((targetTimeSeconds % 3600) / 60);
  const s = targetTimeSeconds % 60;
  const timeStr = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  const desc = en
    ? `Race Day\n${raceName} — target ${timeStr}\nTarget pace: ${fmtPace(mPace)}/km (M zone)`
    : `比赛日\n${raceName} — 目标 ${timeStr}\n目标配速：${fmtPace(mPace)}/km（M区）`;
  return { day, type: 'race', title: en ? 'Race Day' : '比赛日', description: desc, distance: dist, paceZone: 'M' };
}

function buildWeekNotes(
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number,
  distance: RaceDistance,
  isRecovery: boolean,
  en: boolean
): string {
  if (isRecovery) {
    return en
      ? `Recovery week: vol -25%. Shorten quality. Prioritize sleep & nutrition.`
      : `恢复周：跑量-25%，缩短强度课，优先保证睡眠和营养。`;
  }
  switch (phase) {
    case 'base':
      return en
        ? `Base phase. Build aerobic capacity. All easy runs at conversational pace.`
        : `基础期：以有氧积累为主，所有轻松跑保持对话配速。`;
    case 'build':
      return en
        ? `Build phase. Wednesday quality + Sunday LSD. Respect recovery between hard days.`
        : `建立期：周三强度课+周日长距离，重视高强度日之间的恢复。`;
    case 'peak':
      return en
        ? `Peak phase. Highest volume & intensity. Race-pace blocks in Sunday LSD.`
        : `巅峰期：跑量和强度均达峰值，周日长距离加入比赛配速段落。`;
    case 'taper':
      if (w === weeks) {
        const taperTips = en
          ? 'Carb-load 2 days before. Sleep 8h+. No new gear. Race morning: light breakfast 2-3h before.'
          : '赛前2天充碳，保证8小时睡眠，不尝试新装备。比赛当天：提前2-3小时吃清淡早餐。';
        return en
          ? `Race week: vol -40%. Cancel long run. Keep sharp. ${taperTips}`
          : `比赛周：跑量-40%，取消长距离，保持神经募集。${taperTips}`;
      }
      return en
        ? `Taper: vol -30-40%. Keep neuromuscular sharpness. Light quality only.`
        : `减量期：跑量-30-40%，保持神经募集，仅保留轻量强度。`;
    default:
      return '';
  }
}

function buildWeekFocus(
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number,
  distance: RaceDistance,
  en: boolean
): string {
  const raceName = getRaceDistanceName(distance, en);
  if (phase === 'recovery') {
    return en
      ? 'Recovery week: absorb the previous load and keep rhythm.'
      : '恢复周：吸收前期训练负荷，保留跑步节奏。';
  }
  if (phase === 'base') {
    return en
      ? 'Base speed phase: build aerobic volume and relaxed mechanics.'
      : '基础速度期：建立有氧容量和轻松跑姿。';
  }
  if (phase === 'build') {
    return en
      ? `${raceName} build phase: progress threshold and VO2max work without stacking fatigue.`
      : `${raceName}专项建立期：推进阈值与 VO2max，但避免疲劳堆叠。`;
  }
  if (phase === 'peak') {
    return en
      ? `${raceName} peak phase: rehearse goal pace and protect the long run.`
      : `${raceName}峰值专项期：熟悉目标配速，保护长距离质量。`;
  }
  if (w === weeks) {
    return en
      ? 'Race week: stay sharp, sleep well, and do not chase fitness.'
      : '比赛周：保持锐度，保证睡眠，不再追求临时涨能力。';
  }
  return en
    ? 'Taper phase: reduce volume while keeping light speed.'
    : '赛前减量期：降低跑量，保留轻量速度刺激。';
}

function getEasyRunDuration(phase: WeeklyPlan['phase'], w: number, weeks: number): number {
  const baseEnd = Math.max(1, Math.floor(weeks * 0.25));
  const buildEnd = Math.max(baseEnd + 1, Math.floor(weeks * 0.65));
  if (phase === 'base') {
    return 50 + Math.round((w - 1) * 2.5);
  } else if (phase === 'build') {
    return 55 + Math.round((w - baseEnd) * 2);
  } else if (phase === 'peak') {
    return 60;
  } else {
    const taperStart = buildEnd + 1;
    const p = (w - taperStart) / Math.max(1, weeks - taperStart);
    return Math.round(60 - p * 20);
  }
}

/* ── Main generation function ── */

/**
 * Generate a deterministic, algorithmic training plan.
 * AI copy can be layered on later, but the schedule itself stays predictable.
 */
export async function generateTrainingPlan(
  distance: RaceDistance,
  targetTimeSeconds: number,
  weeks: number,
  pb5kSec: number,
  weeklyVolume: number,
  raceDate?: string,
  locale: string = 'zh',
  lthr?: number | null
): Promise<TrainingPlan> {
  const assessment = assessGoal(distance, targetTimeSeconds, pb5kSec, locale);
  if (!assessment.realistic) {
    const en = locale.startsWith('en');
    const raceName = getRaceDistanceName(distance, en);
    const equivalentTime = formatSecondsToTime(assessment.equivalentTime);
    const targetTime = formatSecondsToTime(targetTimeSeconds);
    const pb5kTime = formatSecondsToTime(pb5kSec);
    throw new TrainingPlanInputError(
      en
        ? `Goal seems unrealistic. Your 5K PB (${pb5kTime}) suggests an equivalent ${raceName} time of ~${equivalentTime}, but your target is ${targetTime} (${assessment.gapPercent > 0 ? '+' : ''}${assessment.gapPercent}%). Consider adjusting your goal or updating your PB in profile.`
        : `目标不太现实。你的 5K PB（${pb5kTime}）推算的等效${raceName}成绩约为 ${equivalentTime}，但你的目标是 ${targetTime}（${assessment.gapPercent > 0 ? '+' : ''}${assessment.gapPercent}%）。建议调整目标或在跑者档案中更新 PB。`
    );
  }

  const plan = generateFallbackTrainingPlan(
    distance,
    targetTimeSeconds,
    weeks,
    pb5kSec,
    weeklyVolume,
    locale,
    lthr
  );
  if (raceDate) {
    plan.goal.raceDate = raceDate;
  }
  return plan;
}

export function generateFallbackTrainingPlan(
  distance: RaceDistance,
  targetTimeSeconds: number,
  weeks: number,
  pb5kSec: number,
  weeklyVolume: number,
  locale: string = 'zh',
  lthr?: number | null
): TrainingPlan {
  const en = locale.startsWith('en');

  // Use request-provided LTHR first. Browser profile lookup stays as a
  // compatibility fallback for direct client-side callers.
  const userProfile = lthr ? null : getUserProfile();
  const effectiveLthr = lthr && lthr > 0 ? lthr : userProfile?.lthr || 170;

  // Calculate zones
  const zones = calculatePaceZones(pb5kSec);
  const hrZones = getLthrHRZones(effectiveLthr);
  const abilityGroup = getTrainingAbilityGroup(pb5kSec, weeklyVolume, locale);

  // Target M pace
  const targetDistKm = distance === '5k' ? 5 : distance === '10k' ? 10 : distance === '21k' ? 21.0975 : 42.195;
  const mPace = targetTimeSeconds / targetDistKm;

  // Phase boundaries
  const baseEnd = Math.max(1, Math.floor(weeks * 0.25));
  const buildEnd = Math.max(baseEnd + 1, Math.floor(weeks * 0.65));
  const peakEnd = Math.max(buildEnd + 1, Math.floor(weeks * 0.85));

  // Volume progression
  const baseVol = Math.max(weeklyVolume, distance === '42k' ? 40 : distance === '21k' ? 30 : distance === '10k' ? 20 : 15);
  const peakVol = Math.round(baseVol * (distance === '42k' ? 1.5 : distance === '21k' ? 1.35 : distance === '10k' ? 1.2 : 1.15));

  const weeksList: WeeklyPlan[] = [];

  for (let w = 1; w <= weeks; w++) {
    let phase: WeeklyPlan['phase'];
    if (w <= baseEnd) phase = 'base';
    else if (w <= buildEnd) phase = 'build';
    else if (w <= peakEnd) phase = 'peak';
    else phase = 'taper';

    const isRecoveryWeek =
      (phase === 'build' && w > baseEnd && (w - baseEnd) % 3 === 0)
      || (phase === 'peak' && w > buildEnd && (w - buildEnd) % 3 === 0);
    const actualPhase = isRecoveryWeek ? 'recovery' : phase;

    // Target volume
    let targetVol: number;
    if (phase === 'base') {
      const p = (w - 1) / Math.max(1, baseEnd - 1);
      targetVol = Math.round(baseVol + (peakVol * 0.8 - baseVol) * p);
    } else if (phase === 'build') {
      if (isRecoveryWeek) {
        targetVol = Math.round(peakVol * 0.75);
      } else {
        const p = (w - baseEnd) / Math.max(1, buildEnd - baseEnd);
        targetVol = Math.round(peakVol * 0.8 + (peakVol - peakVol * 0.8) * p);
      }
    } else if (phase === 'peak') {
      if (isRecoveryWeek) {
        targetVol = Math.round(peakVol * 0.8);
      } else {
        targetVol = peakVol;
      }
    } else {
      const taperStart = peakEnd + 1;
      const p = (w - taperStart) / Math.max(1, weeks - taperStart);
      targetVol = Math.round(peakVol * (1 - p * 0.35));
    }

    const sessions: TrainingSession[] = [];

    // Mon: fixed rest day to keep the weekly rhythm easy to follow.
    sessions.push(buildRestDay(0, en));

    // Tue: Easy run
    const tueMin = getEasyRunDuration(phase, w, weeks);
    sessions.push(buildEasyRun(1, tueMin, zones, hrZones, en));

    // Wed: Quality session
    const qualityPhase = isRecoveryWeek ? 'taper' : phase;
    sessions.push(buildQualitySession(2, qualityPhase, w, weeks, distance, zones, hrZones, mPace, en));

    // Thu: Recovery run
    sessions.push(buildRecoveryRun(3, zones, hrZones, en, 40));

    // Fri: second aerobic support day. Recovery weeks keep it intentionally light.
    const friMin = isRecoveryWeek ? 35 : Math.max(40, tueMin - 10);
    sessions.push(isRecoveryWeek
      ? buildRecoveryRun(4, zones, hrZones, en, friMin)
      : buildEasyRun(4, friMin, zones, hrZones, en));

    // Sat: recovery buffer before Sunday long run.
    if (actualPhase === 'recovery' || (phase === 'taper' && w >= weeks - 1)) {
      sessions.push(buildRestDay(5, en));
    } else {
      sessions.push(buildRecoveryRun(5, zones, hrZones, en, 40));
    }

    // Sun: LSD or Race
    if (w === weeks) {
      sessions.push(buildRaceDay(6, distance, targetTimeSeconds, mPace, en));
    } else {
      sessions.push(buildLSD(6, phase, w, weeks, distance, targetVol, zones, hrZones, mPace, en));
    }

    const totalDistance = sessions.reduce((sum, s) => sum + s.distance, 0);
    const notes = buildWeekNotes(phase, w, weeks, distance, isRecoveryWeek, en);
    const focus = buildWeekFocus(actualPhase, w, weeks, distance, en);

    weeksList.push({
      week: w,
      phase: actualPhase,
      totalDistance,
      notes,
      focus,
      sessions,
    });
  }

  return {
    id: `plan_${Date.now()}`,
    createdAt: new Date().toISOString(),
    goal: { distance, targetTimeSeconds },
    currentAbility: { pb5k: pb5kSec, weeklyVolume, lthr: effectiveLthr, abilityGroup },
    weeks: weeksList,
  };
}
