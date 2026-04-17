import type { StravaActivity } from '@/types';

export type WrappedPeriod = 'year' | 'quarter';

export interface WrappedData {
  year: number;
  quarter?: number;
  totalDistanceKm: number;
  totalRuns: number;
  totalDurationSec: number;
  longestRunKm: number;
  longestRunDate: string;
  avgPaceSecPerKm: number;
  totalElevationGainM: number;
  favoriteMonth: { month: number; distanceKm: number };
  timeOfDay: {
    morning: number;
    afternoon: number;
    evening: number;
    night: number;
  };
  longestStreakDays: number;
  monthlyDistances: { month: number; distanceKm: number }[];
  bestPaceSecPerKm: number;
  bestPaceDate: string;
  persona: { title: string; desc: string };
  funFacts: string[];
  extremes: {
    highestElevation: { value: number; date: string; name: string } | null;
    highestHeartRate: { value: number; date: string; name: string } | null;
    earliestStart: { value: string; date: string; name: string } | null;
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function secToPaceSec(distanceM: number, movingTimeSec: number): number {
  if (!distanceM || !movingTimeSec) return 0;
  return movingTimeSec / (distanceM / 1000);
}

function getPersona(
  isZh: boolean,
  timeOfDay: WrappedData['timeOfDay'],
  totalDistance: number,
  totalElevation: number,
  longestStreak: number,
  longestRun: number,
  paces: number[]
): WrappedData['persona'] {
  const total = timeOfDay.morning + timeOfDay.afternoon + timeOfDay.evening + timeOfDay.night;
  const morningRatio = total > 0 ? timeOfDay.morning / total : 0;
  const eveningRatio = total > 0 ? timeOfDay.evening / total : 0;
  const elevationDensity = totalDistance > 0 ? totalElevation / totalDistance : 0;

  const paceStd = paces.length > 1
    ? Math.sqrt(paces.reduce((sq, n) => sq + Math.pow(n - paces.reduce((a, b) => a + b, 0) / paces.length, 2), 0) / paces.length)
    : Infinity;

  if (longestStreak >= 30) {
    return isZh
      ? { title: '连续打卡狂魔', desc: '风雨无阻，日复一日，跑道就是你的第二个家。' }
      : { title: 'Streak Master', desc: 'Day after day, the road is your second home.' };
  }
  if (elevationDensity > 40) {
    return isZh
      ? { title: '爬升之王', desc: '平地不够刺激，你的战场在山坡与天际线之间。' }
      : { title: 'Elevation King', desc: 'Flat ground is boring. You conquer hills and skylines.' };
  }
  if (longestRun >= 30) {
    return isZh
      ? { title: '长距离收割机', desc: '别人畏惧的 LSD，是你每周的固定节目。' }
      : { title: 'Long Run Hunter', desc: 'What others fear, you call a regular Sunday.' };
  }
  if (morningRatio > 0.5) {
    return isZh
      ? { title: '晨跑永动机', desc: '城市还在沉睡，你已经用脚步声叫醒了街道。' }
      : { title: 'Morning Machine', desc: 'While the city sleeps, your footsteps wake the streets.' };
  }
  if (eveningRatio > 0.5) {
    return isZh
      ? { title: '夜行追风者', desc: '路灯是你的观众，夜色是你的披风。' }
      : { title: 'Night Hunter', desc: 'Streetlights are your audience, darkness your cape.' };
  }
  if (paceStd < 15 && totalDistance > 100) {
    return isZh
      ? { title: '配速稳定器', desc: '无论多远，你的配速都像瑞士钟表一样精准。' }
      : { title: 'Pace Stabilizer', desc: 'Your pace is as precise as a Swiss watch.' };
  }
  return isZh
    ? { title: '年度跑者', desc: '每一步都算数，这一年你留下了坚实的足迹。' }
    : { title: 'Year Runner', desc: 'Every step counts. You left solid footprints this year.' };
}

function getFunFacts(isZh: boolean, totalDistanceKm: number, totalElevationM: number, totalDurationSec: number): string[] {
  const facts: string[] = [];
  const laps = Math.round(totalDistanceKm / 0.4);
  facts.push(isZh ? `相当于绕 400m 操场 ${laps} 圈` : `Equivalent to ${laps} laps around a 400m track`);

  const cities = [
    { dist: 21, zh: '半程马拉松', en: 'a half marathon' },
    { dist: 42.195, zh: '全程马拉松', en: 'a full marathon' },
    { dist: 100, zh: '广州 ⇄ 深圳', en: 'Guangzhou ↔ Shenzhen' },
    { dist: 173, zh: '上海 → 杭州', en: 'Shanghai → Hangzhou' },
    { dist: 274, zh: '北京 → 天津往返', en: 'Beijing ↔ Tianjin' },
    { dist: 308, zh: '成都 → 重庆', en: 'Chengdu → Chongqing' },
    { dist: 500, zh: '北京 → 上海', en: 'Beijing → Shanghai' },
  ];
  const city = cities.slice().reverse().find((c) => totalDistanceKm >= c.dist);
  if (city) {
    facts.push(isZh ? `相当于 ${city.zh}` : `Equivalent to ${city.en}`);
  }

  const dongfang = totalElevationM / 468;
  if (dongfang >= 1) {
    facts.push(isZh ? `爬升相当于 ${dongfang.toFixed(1)} 座东方明珠` : `Climbed ${dongfang.toFixed(1)} Oriental Pearl Towers`);
  }

  const everest = totalElevationM / 8848;
  if (everest >= 1) {
    facts.push(isZh ? `爬升相当于 ${everest.toFixed(1)} 座珠穆朗玛峰` : `Climbed ${everest.toFixed(1)} Mount Everests`);
  }

  const movies = Math.round(totalDurationSec / 7200);
  if (movies >= 1) {
    facts.push(isZh ? `跑步时长相当于看了 ${movies} 部电影` : `Running time = ${movies} movies`);
  }

  return facts.slice(0, 3);
}

export function calculateWrapped(
  activities: StravaActivity[],
  period: WrappedPeriod,
  year: number,
  quarter?: number,
  locale: string = 'zh'
): WrappedData | null {
  const isZh = locale.startsWith('zh');

  const runs = activities.filter((a) => {
    if (a.type !== 'Run') return false;
    const date = new Date(a.start_date_local);
    if (date.getFullYear() !== year) return false;
    if (period === 'quarter' && quarter) {
      const m = date.getMonth() + 1;
      const q = Math.ceil(m / 3);
      if (q !== quarter) return false;
    }
    return true;
  });

  if (runs.length === 0) return null;

  let totalDistance = 0;
  let totalDuration = 0;
  let totalElevation = 0;
  let longestRun = 0;
  let longestRunDate = '';
  let bestPace = Infinity;
  let bestPaceDate = '';
  const monthMap = new Map<number, number>();
  const timeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const dateSet = new Set<string>();
  const paces: number[] = [];

  let highestElevation: WrappedData['extremes']['highestElevation'] = null;
  let highestHeartRate: WrappedData['extremes']['highestHeartRate'] = null;
  let earliestStart: WrappedData['extremes']['earliestStart'] = null;

  runs.forEach((run) => {
    const distKm = run.distance / 1000;
    totalDistance += distKm;
    totalDuration += run.moving_time;
    totalElevation += run.total_elevation_gain || 0;

    if (distKm > longestRun) {
      longestRun = distKm;
      longestRunDate = formatDate(run.start_date_local);
    }

    const pace = secToPaceSec(run.distance, run.moving_time);
    if (pace > 0) {
      paces.push(pace);
      if (pace < bestPace) {
        bestPace = pace;
        bestPaceDate = formatDate(run.start_date_local);
      }
    }

    const date = new Date(run.start_date_local);
    const month = date.getMonth() + 1;
    monthMap.set(month, (monthMap.get(month) || 0) + distKm);

    const hour = date.getHours();
    if (hour >= 5 && hour < 11) timeOfDay.morning += distKm;
    else if (hour >= 11 && hour < 17) timeOfDay.afternoon += distKm;
    else if (hour >= 17 && hour < 22) timeOfDay.evening += distKm;
    else timeOfDay.night += distKm;

    const dateKey = run.start_date_local.split('T')[0];
    dateSet.add(dateKey);

    // Extremes
    if (run.elev_high && (!highestElevation || run.elev_high > highestElevation.value)) {
      highestElevation = { value: Math.round(run.elev_high), date: formatDate(run.start_date_local), name: run.name };
    }
    if (run.max_heartrate && (!highestHeartRate || run.max_heartrate > highestHeartRate.value)) {
      highestHeartRate = { value: run.max_heartrate, date: formatDate(run.start_date_local), name: run.name };
    }
    const startHour = date.getHours();
    const startMinute = date.getMinutes();
    if (!earliestStart || startHour < parseInt(earliestStart.value.split(':')[0]) || (startHour === parseInt(earliestStart.value.split(':')[0]) && startMinute < parseInt(earliestStart.value.split(':')[1]))) {
      earliestStart = { value: formatTime(startHour, startMinute), date: formatDate(run.start_date_local), name: run.name };
    }
  });

  // streak calculation
  const sortedDates = Array.from(dateSet).sort();
  let longestStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }
  if (sortedDates.length === 0) longestStreak = 0;

  let favoriteMonth = { month: 1, distanceKm: 0 };
  monthMap.forEach((dist, m) => {
    if (dist > favoriteMonth.distanceKm) {
      favoriteMonth = { month: m, distanceKm: dist };
    }
  });

  const monthlyDistances: { month: number; distanceKm: number }[] = [];
  if (period === 'year') {
    for (let m = 1; m <= 12; m++) {
      monthlyDistances.push({ month: m, distanceKm: Math.round((monthMap.get(m) || 0) * 10) / 10 });
    }
  } else if (quarter) {
    const startMonth = (quarter - 1) * 3 + 1;
    for (let m = startMonth; m <= startMonth + 2; m++) {
      monthlyDistances.push({ month: m, distanceKm: Math.round((monthMap.get(m) || 0) * 10) / 10 });
    }
  }

  const persona = getPersona(isZh, timeOfDay, totalDistance, totalElevation, longestStreak, longestRun, paces);
  const funFacts = getFunFacts(isZh, totalDistance, totalElevation, totalDuration);

  return {
    year,
    quarter,
    totalDistanceKm: Math.round(totalDistance * 10) / 10,
    totalRuns: runs.length,
    totalDurationSec: totalDuration,
    longestRunKm: Math.round(longestRun * 10) / 10,
    longestRunDate,
    avgPaceSecPerKm: totalDistance > 0 ? Math.round(totalDuration / totalDistance) : 0,
    totalElevationGainM: Math.round(totalElevation),
    favoriteMonth,
    timeOfDay,
    longestStreakDays: longestStreak,
    monthlyDistances,
    bestPaceSecPerKm: bestPace === Infinity ? 0 : Math.round(bestPace),
    bestPaceDate: bestPace === Infinity ? '' : bestPaceDate,
    persona,
    funFacts,
    extremes: { highestElevation, highestHeartRate, earliestStart },
  };
}

export function getAvailableWrappedYears(activities: StravaActivity[]): number[] {
  const years = new Set<number>();
  activities.forEach((a) => {
    if (a.type === 'Run') {
      years.add(new Date(a.start_date_local).getFullYear());
    }
  });
  return Array.from(years).sort((a, b) => b - a);
}
