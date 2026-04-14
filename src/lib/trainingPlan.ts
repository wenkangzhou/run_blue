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
  let dist = 15;

  if (distance === '42k') {
    if (phase === 'base') {
      dist = Math.min(20, 15 + (w - 1) * 1.5);
    } else if (phase === 'build') {
      const buildStart = Math.floor(weeks * 0.25) + 1;
      const progress = Math.min(1, (w - buildStart) / Math.max(1, Math.floor(weeks * 0.4) - buildStart + 1));
      dist = Math.round(20 + progress * 12);
    } else if (phase === 'peak') {
      if (w === weeks - Math.floor(weeks * 0.15) || w === weeks - Math.floor(weeks * 0.15) + 1) {
        dist = 32;
      } else {
        dist = 30;
      }
    } else {
      // taper
      if (weeksToRace >= 3) dist = 20;
      else if (weeksToRace === 2) dist = 15;
      else dist = 15;
    }
  } else if (distance === '21k') {
    if (phase === 'base') {
      dist = Math.min(16, 15 + (w - 1) * 0.5);
    } else if (phase === 'build') {
      const buildStart = Math.floor(weeks * 0.25) + 1;
      const progress = Math.min(1, (w - buildStart) / Math.max(1, Math.floor(weeks * 0.4) - buildStart + 1));
      dist = Math.round(16 + progress * 4);
    } else if (phase === 'peak') {
      dist = 18;
    } else {
      // taper
      if (weeksToRace >= 2) dist = 15;
      else dist = 15;
    }
  } else if (distance === '10k') {
    if (phase === 'base') dist = Math.min(15, 10 + w);
    else if (phase === 'build') dist = 15;
    else if (phase === 'peak') dist = 15;
    else dist = 15;
  } else {
    // 5k
    if (phase === 'base') dist = Math.min(15, 10 + w);
    else if (phase === 'build') dist = 15;
    else if (phase === 'peak') dist = 15;
    else dist = 15;
  }

  return Math.max(15, Math.round(dist));
}

function getFallbackLabels(locale: string = 'zh') {
  const en = locale.startsWith('en');
  return {
    longRun: en ? 'Long Run' : '长距离慢跑',
    easyRun: en ? 'Easy Run' : '轻松跑',
    speedActivation: en ? 'Speed Activation' : '速度激活',
    tempoRun: en ? 'Tempo Run' : '乳酸阈值跑',
    intervalTraining: en ? 'Interval Training' : '间歇训练',
    strength: en ? 'Strength' : '力量训练',
    rest: en ? 'Rest' : '休息',
    warmUp: en ? 'w/up' : '热身',
    coolDown: en ? 'c/down' : '放松',
    easyPace: en ? 'easy pace' : '放松跑',
    strides: en ? '8x 200m strides + 200m jog rec' : '8组 200m 轻快跑+200m 慢跑恢复',
    totalDistAbout: en ? 'total approx' : '总距离约',
    phaseBase: en ? 'Base' : '基础期',
    phaseBuild: en ? 'Build' : '建立期',
    phasePeak: en ? 'Peak' : '巅峰期',
    phaseTaper: en ? 'Taper' : '减量期',
    pbPace: en ? '5K PB pace' : '5K PB配速',
    targetPace: en ? 'Target pace' : '目标配速',
    restDesc: en ? 'Rest day or light stretching' : '完全休息或轻度拉伸',
    strengthDesc: en ? 'Legs & core strength (~45min)' : '下肢力量 + 核心训练（约45分钟）',
    // weekly hints
    hintBase: en ? 'Focus on aerobic base. Easy runs at conversational pace. Do strength on Wednesday.' : '本周以有氧积累为主，轻松跑保持对话配速，周三进行力量训练。',
    hintBuild: en ? 'Tuesday quality session (see description), long run can start slow and finish fast.' : '周二强度课注意控制配速，长距离建议前慢后快。',
    hintPeak: en ? 'Volume and intensity are highest. Include M-pace blocks in the long run. Prioritize recovery.' : '跑量和强度均达峰值，长距离中加入马配段落，务必重视恢复。',
    hintTaper: en ? 'Reduce volume gradually. Keep muscles active. Add M-pace segments to prepare for race day.' : '逐步降低跑量，保持肌肉弹性，长距离中保留马配段落以维持比赛节奏感。',
    // M pace labels
    mp: en ? 'M pace' : 'M配速',
    longRunProgression: en ? '{{dist}}km Long Run (first {{easy}}km E + last {{m}}km @ {{mp}})' : '{{dist}}km 长距离慢跑（前{{easy}}km E + 后{{m}}km @ {{mp}}）',
    longRunEven: en ? '{{dist}}km Long Run (steady E pace)' : '{{dist}}km 长距离慢跑（全程匀速 E 配速）',
  };
}

function getQualitySession(
  phase: WeeklyPlan['phase'],
  w: number,
  weeks: number,
  distance: RaceDistance,
  pb5kSec: number,
  labels: ReturnType<typeof getFallbackLabels>
): { type: TrainingSession['type']; title: string; description: string; distance: number; paceZone: string } | null {
  if (phase !== 'build' && phase !== 'peak') return null;

  const zones = calculatePaceZones(pb5kSec);
  const tPace = formatPaceSec((zones.T.min + zones.T.max) / 2);
  const iPace = formatPaceSec((zones.I.min + zones.I.max) / 2);

  const baseWeeksEnd = Math.max(1, Math.floor(weeks * 0.25));
  const buildWeeksEnd = Math.max(baseWeeksEnd + 1, Math.floor(weeks * 0.65));
  const buildMid = Math.round((baseWeeksEnd + buildWeeksEnd) / 2);
  const isLateBuild = w > buildMid;
  const isPeak = phase === 'peak';

  // Alternate tempo (even weeks) and interval (odd weeks)
  if (w % 2 === 0) {
    let tempoDist = 5;
    if (distance === '42k') tempoDist = isPeak ? 12 : isLateBuild ? 10 : 8;
    else if (distance === '21k') tempoDist = isPeak ? 10 : isLateBuild ? 8 : 6;
    else if (distance === '10k') tempoDist = isPeak ? 8 : isLateBuild ? 6 : 5;
    else tempoDist = isPeak ? 6 : isLateBuild ? 5 : 4;

    return {
      type: 'tempo',
      title: labels.tempoRun,
      description: `${tempoDist}km @ ${tPace} (${labels.warmUp} 2km + ${labels.coolDown} 1km)`,
      distance: Math.round(tempoDist + 3),
      paceZone: 'T',
    };
  }

  let repDist: number, reps: number;
  if (distance === '42k') {
    if (isPeak) { repDist = 1200; reps = 5; }
    else if (isLateBuild) { repDist = 1000; reps = 6; }
    else { repDist = 800; reps = 6; }
  } else if (distance === '21k') {
    if (isPeak) { repDist = 1000; reps = 5; }
    else if (isLateBuild) { repDist = 1000; reps = 6; }
    else { repDist = 800; reps = 5; }
  } else if (distance === '10k') {
    if (isPeak) { repDist = 800; reps = 6; }
    else if (isLateBuild) { repDist = 600; reps = 6; }
    else { repDist = 400; reps = 8; }
  } else {
    if (isPeak) { repDist = 600; reps = 6; }
    else if (isLateBuild) { repDist = 400; reps = 8; }
    else { repDist = 200; reps = 10; }
  }

  const intervalMain = (repDist * reps) / 1000;
  return {
    type: 'interval',
    title: labels.intervalTraining,
    description: `${reps}×${repDist}m @ ${iPace}, 3min jog rec (${labels.warmUp} 2km + ${labels.coolDown} 1km)`,
    distance: Math.round(intervalMain + 3),
    paceZone: 'I',
  };
}

/**
 * Generate a structured fallback training plan when AI fails.
 *
 * Improvements:
 * - All distances rounded to integers (no decimals like 6.2000).
 * - Easy runs minimum 5km.
 * - Strength training on Wednesday during base/taper.
 * - Higher volume progression (peakVolume up to 1.5x base for marathon).
 * - Quality sessions with specific paces and progression.
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

  // More aggressive volume targets
  const baseVolume = Math.max(weeklyVolume, distance === '42k' ? 40 : distance === '21k' ? 30 : distance === '10k' ? 25 : 20);
  const peakVolume = Math.round(baseVolume * (distance === '42k' ? 1.5 : distance === '21k' ? 1.35 : distance === '10k' ? 1.25 : 1.2));

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

    // Sunday: Long run - with M-pace blocks in late build/peak/taper for marathon/half
    let longDesc: string;
    const isFullOrHalf = distance === '42k' || distance === '21k';
    const shouldAddMPace = isFullOrHalf && (phase === 'peak' || (phase === 'taper' && weeksToRace <= 2) || (phase === 'build' && w > buildWeeksEnd - 2));
    if (shouldAddMPace) {
      const mKm = Math.max(4, Math.round(longRunDist * 0.3));
      const easyKm = longRunDist - mKm;
      longDesc = labels.longRunProgression
        .replace('{{dist}}', String(longRunDist))
        .replace('{{easy}}', String(easyKm))
        .replace('{{m}}', String(mKm))
        .replace('{{mp}}', targetPaceStr);
    } else if (distance === '42k' && longRunDist >= 26) {
      const lastPartKm = Math.min(longRunDist, Math.round(longRunDist * 0.25));
      longDesc = `${longRunDist}km ${labels.longRun}（最后${lastPartKm}km 可加入 ${labels.mp} ${targetPaceStr}）`;
    } else {
      longDesc = labels.longRunEven.replace('{{dist}}', String(longRunDist));
    }
    sessions.push(session(6, 'long', labels.longRun, longDesc, longRunDist, 'E'));

    // Tuesday: Quality session (tempo/interval) or speed activation
    const quality = getQualitySession(phase, w, weeks, distance, pb5kSec, labels);
    if (quality) {
      sessions.push(session(1, quality.type, quality.title, quality.description, quality.distance, quality.paceZone));
    } else {
      const speedDist = Math.max(5, distance === '42k' ? 8 : distance === '21k' ? 6 : 5);
      sessions.push(session(1, 'interval', labels.speedActivation, `${labels.strides}, ${labels.totalDistAbout} ${speedDist}km`, speedDist, 'R'));
    }

    // Saturday: Rest
    sessions.push(session(5, 'rest', labels.rest, labels.restDesc, 0));

    // Wednesday: Strength during base/taper, otherwise easy run
    if (phase === 'base' || phase === 'taper') {
      sessions.push(session(2, 'recovery', labels.strength, labels.strengthDesc, 0));
    }

    // Distribute easy runs across Mon, Thu, Fri (and Wed if build/peak)
    const qualityDist = quality ? quality.distance : (distance === '42k' ? 8 : distance === '21k' ? 6 : 5);
    const fixedDist = longRunDist + qualityDist;
    const remaining = Math.max(15, vol - fixedDist);

    const easyDays = phase === 'base' || phase === 'taper'
      ? [0, 3, 4] // Mon, Thu, Fri
      : [0, 2, 3, 4]; // Mon, Wed, Thu, Fri

    // Allocate easy run distances: Mon slightly longer, Thu medium, Fri shorter
    const monRatio = 0.4;
    const thuRatio = 0.35;
    const otherCount = easyDays.length - 2;
    const monDist = Math.max(5, Math.round(remaining * monRatio));
    const thuDist = Math.max(5, Math.round(remaining * thuRatio));
    const otherTotal = Math.max(5 * otherCount, remaining - monDist - thuDist);
    const otherDist = otherCount > 0 ? Math.max(5, Math.round(otherTotal / otherCount)) : 0;

    easyDays.forEach((d) => {
      let dist = d === 0 ? monDist : d === 3 ? thuDist : otherDist;
      dist = Math.max(5, Math.min(15, dist)); // ensure 5km <= easy run <= 15km
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
        // Adjust Monday if Friday can't absorb
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
