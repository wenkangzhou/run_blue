import { getHRZones } from './heartRateZones';
import { getUserProfile } from './userProfile';

export type RaceDistance = '5k' | '10k' | '21k' | '42k';

export interface WeeklyPlan {
  week: number;
  phase: 'base' | 'build' | 'peak' | 'taper' | 'recovery';
  totalDistance: number; // target km
  sessions: TrainingSession[];
  notes: string;
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
  };
  weeks: WeeklyPlan[];
}

const STORAGE_KEY = 'runblue_training_plans';

function getStoredPlans(): TrainingPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStoredPlans(plans: TrainingPlan[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  }
}

export function getStoredTrainingPlans(): TrainingPlan[] {
  const plans = getStoredPlans();
  if (plans.length > 0) {
    console.log(`[Plan Storage] 📦 Loaded ${plans.length} plan(s) from localStorage`);
  }
  return plans;
}

export function getStoredTrainingPlan(id?: string): TrainingPlan | null {
  const plans = getStoredPlans();
  const found = id ? plans.find((p) => p.id === id) : plans[0] || null;
  if (found) {
    console.log(`[Plan Storage] 📦 Loaded plan ${found.id} from localStorage (${found.weeks.length} weeks)`);
  }
  return found || null;
}

export function saveTrainingPlan(plan: TrainingPlan): void {
  const plans = getStoredPlans();
  const existingIndex = plans.findIndex((p) => p.id === plan.id);
  if (existingIndex >= 0) {
    plans[existingIndex] = plan;
  } else {
    plans.unshift(plan);
  }
  setStoredPlans(plans);
}

export function deleteTrainingPlan(id: string): void {
  const plans = getStoredPlans().filter((p) => p.id !== id);
  setStoredPlans(plans);
}

export function clearTrainingPlans(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Backward compat aliases
export function clearTrainingPlan(): void {
  clearTrainingPlans();
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
  const pbPace = pb5kSec / 5;
  return {
    E: { min: pbPace * 1.20, max: pbPace * 1.35, desc: '轻松跑' },
    M: { min: pbPace * 1.05, max: pbPace * 1.15, desc: '马拉松配速' },
    T: { min: pbPace * 0.93, max: pbPace * 0.97, desc: '乳酸阈值' },
    I: { min: pbPace * 0.88, max: pbPace * 0.92, desc: '间歇跑' },
    R: { min: pbPace * 0.82, max: pbPace * 0.87, desc: '重复跑' },
  };
}

/* ── Helpers for building rich session descriptions ── */

function fmtPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
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
  hrZones: ReturnType<typeof getHRZones>,
  en: boolean,
  isMonday: boolean = false
): TrainingSession {
  const paceMin = fmtPace(zones.E.min);
  const paceMax = fmtPace(zones.E.max);
  const dist = Math.round((minutes * 60) / ((zones.E.min + zones.E.max) / 2));
  const monNote = isMonday
    ? (en ? '\nNote: Monday easy run helps build weekly aerobic volume. Keep it truly easy.' : '\n提示：周一轻松跑用于累积周跑量，务必保持轻松体感。')
    : '';
  const desc = en
    ? `Easy run ${minutes}min (~${dist}km)\nPace: ${paceMin}-${paceMax}/km (E zone, ${Math.round((zones.E.min / zones.M.min - 1) * 100)}-${Math.round((zones.E.max / zones.M.min - 1) * 100)}s slower than M pace)\nHR: ${hrZones.z2.min}-${hrZones.z2.max}bpm (Z2, 85-89% LTHR)\nFeel: conversational pace, natural stride, no pushing${monNote}`
    : `轻松跑${minutes}min（约${dist}km）\n配速建议：${paceMin}-${paceMax}/km（E区，慢于M配速${Math.round((zones.E.min / zones.M.min - 1) * 100)}-${Math.round((zones.E.max / zones.M.min - 1) * 100)}s）\n心率建议：${hrZones.z2.min}-${hrZones.z2.max}bpm（Z2，LTHR的85-89%）\n体感：能完整对话的轻松配速，步频自然，不刻意加速${monNote}`;
  const title = isMonday ? (en ? 'Easy' : '轻松跑') : (en ? 'Easy' : '轻松跑');
  return { day, type: 'easy', title, description: desc, distance: dist, paceZone: 'E' };
}

function buildRecoveryRun(
  day: number,
  zones: ReturnType<typeof calculatePaceZones>,
  hrZones: ReturnType<typeof getHRZones>,
  en: boolean,
  minutes: number = 40
): TrainingSession {
  const slowPace = fmtPace(zones.E.max * 1.05);
  const dist = Math.round((minutes * 60) / zones.E.max);
  const desc = en
    ? `Recovery run ${minutes}min (~${dist}km)\nPace: slower than ${slowPace}/km (>60s slower than M pace)\nHR: <${hrZones.z2.min}bpm (Z1, <85% LTHR)\nFeel: very easy, can chat effortlessly, focus on relaxation and breathing\nTip: shorter stride, relaxed shoulders, nasal breathing if possible`
    : `恢复跑${minutes}min（约${dist}km）\n配速建议：慢于${slowPace}/km（慢于M配速60s以上）\n心率建议：<${hrZones.z2.min}bpm（Z1，LTHR的<85%）\n体感：极其轻松，可以边跑边聊天无压力\n要点：缩小步幅、放松肩膀、尝试鼻吸鼻呼`;
  return { day, type: 'easy', title: en ? 'Recovery' : '恢复跑', description: desc, distance: dist, paceZone: 'E' };
}

function buildQualitySession(
  day: number,
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number,
  distance: RaceDistance,
  zones: ReturnType<typeof calculatePaceZones>,
  hrZones: ReturnType<typeof getHRZones>,
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

  return { day, type: 'interval', title, description: desc, distance: dist, paceZone: pz };
}

function buildLSD(
  day: number,
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number,
  distance: RaceDistance,
  targetVol: number,
  zones: ReturnType<typeof calculatePaceZones>,
  hrZones: ReturnType<typeof getHRZones>,
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
        ? `Build phase. Tuesday quality + Sunday LSD. Respect recovery between hard days.`
        : `建立期：周二强度课+周日长距离，重视高强度日之间的恢复。`;
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

export function generateFallbackTrainingPlan(
  distance: RaceDistance,
  targetTimeSeconds: number,
  weeks: number,
  pb5kSec: number,
  weeklyVolume: number,
  locale: string = 'zh'
): TrainingPlan {
  const en = locale.startsWith('en');

  // Get user's LTHR, default 170
  const userProfile = getUserProfile();
  const lthr = userProfile?.lthr || 170;

  // Calculate zones
  const zones = calculatePaceZones(pb5kSec);
  const hrZones = getHRZones(lthr);

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

    const isRecoveryWeek = (phase === 'build' || phase === 'peak') && (w > baseEnd && w > buildEnd && (phase === 'build' ? (w - baseEnd) % 3 === 0 : (w - buildEnd) % 3 === 0));
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

    // Mon: Rest or easy run depending on phase & recovery status
    if (phase === 'taper' && w >= weeks - 1) {
      // Final 2 weeks of taper: rest on Monday
      sessions.push(buildRestDay(0, en));
    } else if (isRecoveryWeek) {
      // Recovery weeks: Monday rest
      sessions.push(buildRestDay(0, en));
    } else {
      // Base/Build/Peak normal weeks: Monday easy run to build volume
      const monMin = Math.max(30, Math.min(50, Math.round(peakVol * 0.08)));
      sessions.push(buildEasyRun(0, monMin, zones, hrZones, en, true));
    }

    // Tue: Easy run
    const tueMin = getEasyRunDuration(phase, w, weeks);
    sessions.push(buildEasyRun(1, tueMin, zones, hrZones, en));

    // Wed: Quality session
    sessions.push(buildQualitySession(2, phase, w, weeks, distance, zones, hrZones, mPace, en));

    // Thu: Recovery run
    sessions.push(buildRecoveryRun(3, zones, hrZones, en, 40));

    // Fri: Recovery run
    sessions.push(buildRecoveryRun(4, zones, hrZones, en, 40));

    // Sat: Easy run (slightly shorter than Tue)
    const satMin = Math.max(30, tueMin - 10);
    sessions.push(buildEasyRun(5, satMin, zones, hrZones, en));

    // Sun: LSD or Race
    if (w === weeks) {
      sessions.push(buildRaceDay(6, distance, targetTimeSeconds, mPace, en));
    } else {
      sessions.push(buildLSD(6, phase, w, weeks, distance, targetVol, zones, hrZones, mPace, en));
    }

    const totalDistance = sessions.reduce((sum, s) => sum + s.distance, 0);
    const notes = buildWeekNotes(phase, w, weeks, distance, isRecoveryWeek, en);

    weeksList.push({
      week: w,
      phase: actualPhase,
      totalDistance,
      notes,
      sessions,
    });
  }

  return {
    id: `plan_${Date.now()}`,
    createdAt: new Date().toISOString(),
    goal: { distance, targetTimeSeconds },
    currentAbility: { pb5k: pb5kSec, weeklyVolume },
    weeks: weeksList,
  };
}
