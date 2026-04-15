import { getUserProfile, type UserProfilePBs } from './userProfile';
import { formatPace } from './trainingAnalysis';

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
  return getStoredPlans();
}

export function getStoredTrainingPlan(id?: string): TrainingPlan | null {
  if (!id) {
    const plans = getStoredPlans();
    return plans[0] || null;
  }
  return getStoredPlans().find((p) => p.id === id) || null;
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

function formatPaceSec(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${s.toString().padStart(2, '0')}"`;
}

function session(
  day: number,
  type: TrainingSession['type'],
  title: string,
  description: string,
  distance: number,
  paceZone?: string
): TrainingSession {
  return { day, type, title, description, distance, paceZone };
}

/**
 * Calculate long run distance progression based on race distance and week position.
 */
function calcLongRunDist(
  distance: RaceDistance,
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number
): number {
  const weeksToRace = weeks - w + 1;

  if (distance === '42k') {
    if (phase === 'base') {
      return Math.min(18, 14 + (w - 1) * 1.2);
    } else if (phase === 'build') {
      const buildStart = Math.floor(weeks * 0.25) + 1;
      const progress = Math.min(1, (w - buildStart) / Math.max(1, Math.floor(weeks * 0.4) - buildStart + 1));
      return Math.round(18 + progress * 10);
    } else if (phase === 'peak') {
      return w === weeks - Math.floor(weeks * 0.15) ? 32 : 28;
    } else {
      // taper
      if (weeksToRace >= 3) return 20;
      if (weeksToRace === 2) return 16;
      return 15;
    }
  }

  if (distance === '21k') {
    if (phase === 'base') {
      return Math.min(15, 12 + (w - 1) * 0.6);
    } else if (phase === 'build') {
      const buildStart = Math.floor(weeks * 0.25) + 1;
      const progress = Math.min(1, (w - buildStart) / Math.max(1, Math.floor(weeks * 0.4) - buildStart + 1));
      return Math.round(15 + progress * 3);
    } else if (phase === 'peak') {
      return 18;
    } else {
      // taper
      if (weeksToRace >= 2) return 14;
      return 12;
    }
  }

  if (distance === '10k') {
    if (phase === 'base') {
      return Math.min(10, 8 + (w - 1) * 0.5);
    } else if (phase === 'build') {
      return 11;
    } else if (phase === 'peak') {
      return 12;
    } else {
      // taper
      if (weeksToRace >= 2) return 10;
      return 8;
    }
  }

  // 5k
  if (phase === 'base') {
    return Math.min(8, 6 + (w - 1) * 0.5);
  } else if (phase === 'build') {
    return 9;
  } else if (phase === 'peak') {
    return 10;
  } else {
    // taper
    if (weeksToRace >= 2) return 8;
    return 6;
  }
}

function getFallbackLabels(locale: string = 'zh') {
  const en = locale.startsWith('en');
  return {
    longRun: en ? 'Long' : '长距离',
    steadyRun: en ? 'Steady' : '有氧跑',
    easyRun: en ? 'Easy' : '轻松跑',
    speedActivation: en ? 'Speed' : '速度',
    tempoRun: en ? 'Tempo' : '阈值跑',
    intervalTraining: en ? 'Intervals' : '间歇',
    fartlek: en ? 'Fartlek' : '法特莱克',
    strength: en ? 'Strength' : '力量',
    rest: en ? 'Rest' : '休息',
    warmUp: en ? 'w/up' : '热身',
    coolDown: en ? 'c/down' : '放松',
    easyPace: en ? 'easy' : '放松跑',
    strides: en ? '8×200m strides + 200m jog' : '8组 200m 轻快跑+200m 慢跑',
    totalDistAbout: en ? 'total' : '总约',
    phaseBase: en ? 'Base' : '基础期',
    phaseBuild: en ? 'Build' : '建立期',
    phasePeak: en ? 'Peak' : '巅峰期',
    phaseTaper: en ? 'Taper' : '减量期',
    targetPace: en ? 'Target pace' : '目标配速',
    restDesc: en ? 'Rest day or light stretching' : '完全休息或轻度拉伸',
    strengthDesc: en ? 'Legs & core (~45min)' : '下肢力量+核心（约45分钟）',
    // weekly hints
    hintBase: en ? 'Focus on aerobic base. Easy runs at conversational pace.' : '本周以有氧积累为主，轻松跑保持对话配速。',
    hintBuild: en ? 'Tuesday quality session (see description), maintain good form.' : '周二强度课注意控制配速，保持技术动作。',
    hintPeak: en ? 'Volume and intensity are highest. Prioritize recovery.' : '跑量和强度均达峰值，务必重视恢复。',
    hintTaper: en ? 'Reduce volume gradually. Keep muscles active.' : '逐步降低跑量，保持肌肉弹性。',
    // M pace labels (marathon/half only)
    mp: en ? 'M pace' : 'M配速',
    longRunProgression: en ? '{{dist}}km ({{easy}}km E + {{m}}km @ {{mp}})' : '{{dist}}km（前{{easy}}km E + 后{{m}}km @ {{mp}}）',
    longRunEven: en ? '{{dist}}km steady E' : '{{dist}}km 匀速 E',
  };
}

/**
 * Build a speed-activation session (strides / short reps)
 */
function getSpeedActivation(
  distance: RaceDistance,
  labels: ReturnType<typeof getFallbackLabels>
): TrainingSession {
  const speedDist = distance === '42k' ? 8 : distance === '21k' ? 6 : 5;
  return session(1, 'interval', labels.speedActivation, `${labels.strides}, ${labels.totalDistAbout} ${speedDist}km`, speedDist, 'R');
}

/**
 * Build Tuesday quality session.
 */
function getTuesdaySession(
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number,
  distance: RaceDistance,
  pb5kSec: number,
  labels: ReturnType<typeof getFallbackLabels>
): TrainingSession | null {
  if (phase !== 'build' && phase !== 'peak') return null;

  const zones = calculatePaceZones(pb5kSec);
  const tPace = formatPaceSec((zones.T.min + zones.T.max) / 2);
  const iPace = formatPaceSec((zones.I.min + zones.I.max) / 2);
  const rPace = formatPaceSec((zones.R.min + zones.R.max) / 2);

  const baseWeeksEnd = Math.max(1, Math.floor(weeks * 0.25));
  const buildWeeksEnd = Math.max(baseWeeksEnd + 1, Math.floor(weeks * 0.65));
  const buildMid = Math.round((baseWeeksEnd + buildWeeksEnd) / 2);
  const isLateBuild = w > buildMid;
  const isPeak = phase === 'peak';

  // Marathon: tempo / interval alternate
  if (distance === '42k') {
    if (w % 2 === 0) {
      const tempoDist = isPeak ? 12 : isLateBuild ? 10 : 8;
      return session(1, 'tempo', labels.tempoRun, `${tempoDist}km @ ${tPace} (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round(tempoDist + 3), 'T');
    }
    const repDist = isPeak ? 1200 : isLateBuild ? 1000 : 800;
    const reps = isPeak ? 5 : 6;
    const intervalMain = (repDist * reps) / 1000;
    return session(1, 'interval', labels.intervalTraining, `${reps}×${repDist}m @ ${iPace}, 3min jog rec (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round(intervalMain + 3), 'I');
  }

  // Half marathon: interval / tempo alternate
  if (distance === '21k') {
    if (w % 2 === 0) {
      const tempoDist = isPeak ? 10 : isLateBuild ? 8 : 6;
      return session(1, 'tempo', labels.tempoRun, `${tempoDist}km @ ${tPace} (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round(tempoDist + 3), 'T');
    }
    const repDist = isPeak ? 1000 : isLateBuild ? 800 : 600;
    const reps = isPeak ? 6 : isLateBuild ? 7 : 8;
    const intervalMain = (repDist * reps) / 1000;
    return session(1, 'interval', labels.intervalTraining, `${reps}×${repDist}m @ ${iPace}, 2.5min jog rec (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round(intervalMain + 3), 'I');
  }

  // 10k: cruise intervals / intervals (emphasize speed endurance)
  if (distance === '10k') {
    if (w % 2 === 0) {
      const reps = isPeak ? 5 : isLateBuild ? 4 : 4;
      const totalInterval = reps * 1.6; // 1km fast + 400m jog ≈ 1.6km each
      return session(1, 'interval', labels.intervalTraining, `${reps}×(1km @ ${tPace} + 2min jog), ${labels.warmUp} 2km + ${labels.coolDown} 1km`, Math.round(totalInterval + 3), 'T');
    }
    const repDist = isPeak ? 800 : isLateBuild ? 800 : 600;
    const reps = isPeak ? 6 : isLateBuild ? 6 : 8;
    const intervalMain = (repDist * reps) / 1000;
    return session(1, 'interval', labels.intervalTraining, `${reps}×${repDist}m @ ${iPace}, 3min jog rec (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round(intervalMain + 3), 'I');
  }

  // 5k: short reps / short intervals alternate (emphasize raw speed)
  if (w % 2 === 0) {
    const reps = isPeak ? 10 : isLateBuild ? 8 : 6;
    return session(1, 'interval', labels.intervalTraining, `${reps}×400m @ ${iPace}, 90s jog rec (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round((reps * 0.4) + 3), 'I');
  }
  const reps = isPeak ? 10 : isLateBuild ? 12 : 10;
  return session(1, 'interval', labels.speedActivation, `${reps}×200m @ ${rPace}, 200m jog rec (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round((reps * 0.4) + 3), 'R');
}

/**
 * Build Thursday session.
 */
function getThursdaySession(
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number,
  distance: RaceDistance,
  pb5kSec: number,
  labels: ReturnType<typeof getFallbackLabels>
): TrainingSession | null {
  if (phase !== 'build' && phase !== 'peak') return null;

  const zones = calculatePaceZones(pb5kSec);
  const tPace = formatPaceSec((zones.T.min + zones.T.max) / 2);
  const iPace = formatPaceSec((zones.I.min + zones.I.max) / 2);

  const baseWeeksEnd = Math.max(1, Math.floor(weeks * 0.25));
  const buildWeeksEnd = Math.max(baseWeeksEnd + 1, Math.floor(weeks * 0.65));
  const buildMid = Math.round((baseWeeksEnd + buildWeeksEnd) / 2);
  const isLateBuild = w > buildMid;
  const isPeak = phase === 'peak';

  // Marathon: easy run on Thursday (only 2 hard sessions per week)
  if (distance === '42k') return null;

  // Half marathon: tempo on Thursday
  if (distance === '21k') {
    const tempoDist = isPeak ? 8 : isLateBuild ? 6 : 5;
    return session(3, 'tempo', labels.tempoRun, `${tempoDist}km @ ${tPace} (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round(tempoDist + 3), 'T');
  }

  // 10k: tempo or fartlek on Thursday
  if (distance === '10k') {
    if (w % 2 === 0) {
      const tempoDist = isPeak ? 5 : isLateBuild ? 4 : 4;
      return session(3, 'tempo', labels.tempoRun, `${tempoDist}km @ ${tPace} (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round(tempoDist + 3), 'T');
    }
    return session(3, 'interval', labels.fartlek, `1min fast / 1min easy ×${isPeak ? 10 : 8}, ${labels.totalDistAbout} 7km`, 7, 'I');
  }

  // 5k: short tempo on Thursday
  const tempoDist = isPeak ? 4 : isLateBuild ? 3 : 3;
  return session(3, 'tempo', labels.tempoRun, `${tempoDist}km @ ${tPace} (${labels.warmUp} 2km + ${labels.coolDown} 1km)`, Math.round(tempoDist + 3), 'T');
}

/**
 * Generate a structured fallback training plan when AI fails.
 */
export function generateFallbackTrainingPlan(
  distance: RaceDistance,
  targetTimeSeconds: number,
  weeks: number,
  pb5kSec: number,
  weeklyVolume: number,
  locale: string = 'zh'
): TrainingPlan {
  const targetPace = (() => {
    const d = distance === '5k' ? 5 : distance === '10k' ? 10 : distance === '21k' ? 21.0975 : 42.195;
    return targetTimeSeconds / d;
  })();

  const labels = getFallbackLabels(locale);
  const targetPaceStr = formatPaceSec(targetPace);

  // Volume targets vary by distance (5k/10k much lower than marathon)
  const baseVolume = Math.max(
    weeklyVolume,
    distance === '42k' ? 40 : distance === '21k' ? 30 : distance === '10k' ? 20 : 15
  );
  const peakVolume = Math.round(
    baseVolume * (distance === '42k' ? 1.5 : distance === '21k' ? 1.35 : distance === '10k' ? 1.2 : 1.15)
  );

  const baseWeeksEnd = Math.max(1, Math.floor(weeks * 0.25));
  const buildWeeksEnd = Math.max(baseWeeksEnd + 1, Math.floor(weeks * 0.65));
  const peakWeeksEnd = Math.max(buildWeeksEnd + 1, Math.floor(weeks * 0.85));

  const weeksList: WeeklyPlan[] = [];

  for (let w = 1; w <= weeks; w++) {
    let phase: WeeklyPlan['phase'];
    if (w <= baseWeeksEnd) phase = 'base';
    else if (w <= buildWeeksEnd) phase = 'build';
    else if (w <= peakWeeksEnd) phase = 'peak';
    else phase = 'taper';

    const weeksToRace = weeks - w + 1;

    // Volume progression
    let vol: number;
    if (phase === 'base') {
      const p = (w - 1) / Math.max(1, baseWeeksEnd - 1);
      vol = Math.round(baseVolume + (peakVolume * 0.8 - baseVolume) * p);
    } else if (phase === 'build') {
      const p = (w - baseWeeksEnd) / Math.max(1, buildWeeksEnd - baseWeeksEnd);
      vol = Math.round(peakVolume * 0.8 + (peakVolume - peakVolume * 0.8) * p);
    } else if (phase === 'peak') {
      vol = peakVolume;
    } else {
      const taperStart = peakWeeksEnd + 1;
      const p = (w - taperStart) / Math.max(1, weeks - taperStart);
      vol = Math.round(peakVolume * (1 - p * 0.3));
    }

    const longRunDist = Math.round(calcLongRunDist(distance, phase, w, weeks));
    const sessions: TrainingSession[] = [];

    // Sunday: Long run for marathon/half; steady aerobic run for 10k/5k
    const isMarathonOrHalf = distance === '42k' || distance === '21k';
    const longTitle = isMarathonOrHalf ? labels.longRun : labels.steadyRun;
    let longDesc: string;
    if (isMarathonOrHalf && (phase === 'peak' || (phase === 'taper' && weeksToRace <= 2) || (phase === 'build' && w > buildWeeksEnd - 2))) {
      const mKm = Math.max(3, Math.round(longRunDist * 0.25));
      const easyKm = longRunDist - mKm;
      longDesc = labels.longRunProgression
        .replace('{{dist}}', String(longRunDist))
        .replace('{{easy}}', String(easyKm))
        .replace('{{m}}', String(mKm))
        .replace('{{mp}}', targetPaceStr);
    } else {
      longDesc = labels.longRunEven.replace('{{dist}}', String(longRunDist));
    }
    sessions.push(session(6, 'long', longTitle, longDesc, longRunDist, 'E'));

    // Tuesday: Quality session
    const tueSession = getTuesdaySession(phase, w, weeks, distance, pb5kSec, labels);
    if (tueSession) {
      sessions.push(tueSession);
    } else {
      sessions.push(getSpeedActivation(distance, labels));
    }

    // Thursday: Quality session (for 10k/half/5k) or easy run (for marathon)
    const thuSession = getThursdaySession(phase, w, weeks, distance, pb5kSec, labels);
    if (thuSession) {
      sessions.push(thuSession);
    }

    // Saturday: Rest
    sessions.push(session(5, 'rest', labels.rest, labels.restDesc, 0));

    // Wednesday: Strength during base/taper for all distances
    if (phase === 'base' || phase === 'taper') {
      sessions.push(session(2, 'recovery', labels.strength, labels.strengthDesc, 0));
    }

    // Easy runs fill remaining days (skip days already occupied)
    const fixedDist = sessions.reduce((sum, s) => sum + s.distance, 0);
    const remaining = Math.max(0, vol - fixedDist);

    const occupiedDays = new Set(sessions.map((s) => s.day));
    const candidateEasyDays = phase === 'base' || phase === 'taper'
      ? [0, 3, 4] // Mon, Thu, Fri
      : [0, 2, 3, 4]; // Mon, Wed, Thu, Fri
    const easyDays = candidateEasyDays.filter((d) => !occupiedDays.has(d));

    const monRatio = 0.4;
    const thuRatio = 0.35;
    const hasMon = easyDays.includes(0);
    const hasThu = easyDays.includes(3);
    const otherCount = easyDays.length - (hasMon ? 1 : 0) - (hasThu ? 1 : 0);
    const monDist = hasMon ? Math.max(5, Math.min(15, Math.round(remaining * monRatio))) : 0;
    const thuDist = hasThu ? Math.max(5, Math.min(15, Math.round(remaining * thuRatio))) : 0;
    const otherTotal = Math.max(5 * otherCount, remaining - monDist - thuDist);
    const otherDist = otherCount > 0 ? Math.max(5, Math.min(15, Math.round(otherTotal / otherCount))) : 0;

    easyDays.forEach((d) => {
      let dist = d === 0 ? monDist : d === 3 ? thuDist : otherDist;
      dist = Math.max(5, Math.min(15, dist));
      sessions.push(session(d, 'easy', labels.easyRun, `${dist}km ${labels.easyPace}`, dist, 'E'));
    });

    // Re-balance to hit target volume exactly by adjusting Friday
    const currentTotal = sessions.reduce((sum, s) => sum + s.distance, 0);
    if (currentTotal !== vol) {
      const diff = vol - currentTotal;
      const fri = sessions.find((s) => s.day === 4 && s.type === 'easy');
      if (fri && fri.distance + diff >= 5) {
        fri.distance = Math.max(5, Math.min(15, fri.distance + diff));
        fri.description = `${fri.distance}km ${labels.easyPace}`;
      } else {
        const mon = sessions.find((s) => s.day === 0 && s.type === 'easy');
        if (mon && mon.distance + diff >= 5) {
          mon.distance = Math.max(5, Math.min(15, mon.distance + diff));
          mon.description = `${mon.distance}km ${labels.easyPace}`;
        }
      }
    }

    sessions.sort((a, b) => a.day - b.day);

    const phaseName = phase === 'base' ? labels.phaseBase : phase === 'build' ? labels.phaseBuild : phase === 'peak' ? labels.phasePeak : labels.phaseTaper;
    const hint = phase === 'base' ? labels.hintBase : phase === 'build' ? labels.hintBuild : phase === 'peak' ? labels.hintPeak : labels.hintTaper;
    weeksList.push({
      week: w,
      phase,
      totalDistance: sessions.reduce((sum, s) => sum + s.distance, 0),
      notes: `${phaseName}: ${hint}`,
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
