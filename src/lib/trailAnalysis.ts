import type { ActivityStream, StravaActivity } from '@/types';

type TrailActivity = Pick<StravaActivity, 'name' | 'type' | 'sport_type' | 'distance' | 'moving_time' | 'total_elevation_gain' | 'splits_metric'>
  & Partial<Pick<StravaActivity, 'id'>>;

export interface TrailKilometer {
  kilometer: number;
  distanceMeters: number;
  altitudeCoverage: number;
  ascentMeters: number;
  descentMeters: number;
  netElevationMeters: number;
  paceSecondsPerKm?: number;
  averageHeartRate?: number;
  equivalentPaceSecondsPerKm?: number;
}

export interface TrailTerrainSummary {
  isTrail: boolean;
  source: 'user-confirmed' | 'title' | 'sport-type' | 'climbing' | 'none';
  climbMetersPerKm: number;
  kilometers: TrailKilometer[];
  equivalentPaceSecondsPerKm?: number;
  gradeCoverage: number;
}

export interface TrailExecutionAssessment {
  summary: string;
  quality?: 'excellent' | 'good' | 'fair' | 'poor';
}

function trailPace(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}'${String(rounded % 60).padStart(2, '0')}"`;
}

/** Only compare complete, altitude-covered kilometers; raw trail pace is not effort. */
export function assessTrailExecution(
  activity: TrailActivity,
  terrain: TrailTerrainSummary,
  locale: string
): TrailExecutionAssessment {
  const en = locale.startsWith('en');
  const fullKilometers = terrain.kilometers.filter((km) => km.distanceMeters >= 800);
  const usable = fullKilometers.filter((km) => km.altitudeCoverage >= 0.8
    && km.equivalentPaceSecondsPerKm !== undefined
    && Number.isFinite(km.equivalentPaceSecondsPerKm));
  const biggestClimb = terrain.gradeCoverage >= 0.8
    ? usable.reduce<TrailKilometer | undefined>((best, km) =>
        !best || km.ascentMeters > best.ascentMeters ? km : best, undefined)
    : undefined;
  const climbFact = biggestClimb && biggestClimb.ascentMeters >= 15
    ? (en
        ? `The largest climb was km ${biggestClimb.kilometer} (+${Math.round(biggestClimb.ascentMeters)} m${biggestClimb.paceSecondsPerKm ? `, ${trailPace(biggestClimb.paceSecondsPerKm)}/km raw pace` : ''}).`
        : `最大爬升在第 ${biggestClimb.kilometer} 公里（上升 ${Math.round(biggestClimb.ascentMeters)} 米${biggestClimb.paceSecondsPerKm ? `，原始配速 ${trailPace(biggestClimb.paceSecondsPerKm)}/公里` : ''}）。`)
    : '';
  const totalFact = en
    ? `${(activity.distance / 1000).toFixed(1)} km with ${Math.round(activity.total_elevation_gain)} m ascent`
    : `${(activity.distance / 1000).toFixed(1)} 公里、累计爬升 ${Math.round(activity.total_elevation_gain)} 米`;

  if (terrain.gradeCoverage < 0.8 || usable.length < 6 || usable.length < fullKilometers.length * 0.7) {
    return {
      summary: en
        ? `${totalFact} completed. ${climbFact} Altitude-covered kilometer splits are insufficient to compare early and late effort; execution quality remains undetermined.`
        : `完成 ${totalFact}。${climbFact}逐公里海拔覆盖不足，无法比较前后段等强配速，暂不评定执行质量。`,
    };
  }

  const groupSize = Math.max(2, Math.floor(usable.length / 3));
  const early = usable.slice(0, groupSize);
  const late = usable.slice(-groupSize);
  const average = (kilometers: TrailKilometer[], field: 'equivalentPaceSecondsPerKm' | 'averageHeartRate') => {
    const values = kilometers.map((km) => km[field]).filter((value): value is number =>
      typeof value === 'number' && Number.isFinite(value));
    return values.length >= Math.ceil(kilometers.length * 0.7)
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : undefined;
  };
  const earlyPace = average(early, 'equivalentPaceSecondsPerKm');
  const latePace = average(late, 'equivalentPaceSecondsPerKm');
  if (!earlyPace || !latePace) return { summary: en ? `${totalFact} completed; effort-pace data are incomplete.` : `完成 ${totalFact}，但等强配速数据不足，暂不评定执行质量。` };

  const change = (latePace / earlyPace - 1) * 100;
  const earlyHr = average(early, 'averageHeartRate');
  const lateHr = average(late, 'averageHeartRate');
  const hrChange = earlyHr !== undefined && lateHr !== undefined ? Math.round(lateHr - earlyHr) : undefined;
  const quality: TrailExecutionAssessment['quality'] = change > 12 && (hrChange ?? 0) >= 5
    ? 'poor'
    : change > 7 ? 'fair'
    : change < -5 && hrChange !== undefined && hrChange < 15 ? 'excellent' : 'good';
  const verdict = quality === 'poor'
    ? (en ? 'Late-race effort faded despite higher heart rate' : '后段等强配速明显下降且心率上升，提示可能出现疲劳性掉速')
    : quality === 'fair'
      ? (en ? 'Late-race effort slowed; the cause is not certain' : '后段等强配速下降，但不能仅凭此断言跑崩')
      : quality === 'excellent'
        ? (en ? 'Late-race effort improved' : '后段等强配速反而提高，体能分配很出色')
        : change < -5
          ? (en ? 'Estimated late-race effort pace improved, but heart-rate context limits the verdict' : '后段估算等强配速提高，但仍需结合心率判断投入程度')
          : (en ? 'Effort stayed reasonably steady across the race' : '前后段等强配速基本稳定，体能分配较稳');
  const hrFact = hrChange === undefined
    ? (en ? 'No comparable segment heart-rate data.' : '缺少可比的分段心率，不能进一步判断疲劳原因。')
    : (en
        ? `Late-section heart rate was ${Math.abs(hrChange)} bpm ${hrChange >= 0 ? 'higher' : 'lower'}.`
        : `后段心率较前段${hrChange >= 0 ? '高' : '低'} ${Math.abs(hrChange)} bpm。`);
  const effortFact = en
    ? `Estimated grade-adjusted pace: km ${early[0].kilometer}–${early.at(-1)?.kilometer} ${trailPace(earlyPace)}/km versus km ${late[0].kilometer}–${late.at(-1)?.kilometer} ${trailPace(latePace)}/km (${Math.abs(Math.round(change))}% ${change >= 0 ? 'slower' : 'faster'}).`
    : `估算等强配速：第 ${early[0].kilometer}–${early.at(-1)?.kilometer} 公里 ${trailPace(earlyPace)}/公里，后段第 ${late[0].kilometer}–${late.at(-1)?.kilometer} 公里 ${trailPace(latePace)}/公里（${change >= 0 ? '慢' : '快'}约 ${Math.abs(Math.round(change))}%）。`;
  return {
    quality,
    summary: en
      ? `${verdict}. ${effortFact} ${hrFact} ${climbFact}`.trim()
      : `${verdict}。${effortFact}${hrFact}${climbFact}`,
  };
}

export function getTrailDetection(activity: TrailActivity): Pick<TrailTerrainSummary, 'isTrail' | 'source'> {
  if (activity.id === 20991619385) {
    return { isTrail: true, source: 'user-confirmed' };
  }
  if (/(?:越野|山径|山地跑|trail(?:[\s_-]?run)?)/i.test(activity.name || '')) {
    return { isTrail: true, source: 'title' };
  }
  if (activity.type === 'TrailRun' || activity.sport_type === 'TrailRun') {
    return { isTrail: true, source: 'sport-type' };
  }
  const climbPerKm = activity.distance > 0 ? activity.total_elevation_gain / (activity.distance / 1000) : 0;
  if (activity.total_elevation_gain >= 300 && climbPerKm >= 40) {
    return { isTrail: true, source: 'climbing' };
  }
  return { isTrail: false, source: 'none' };
}

// Minetti et al. (2002), running energy cost on slopes, normalized to level ground.
// This is an approximate effort-equivalent pace, NOT Strava's proprietary GAP.
function relativeGradeCost(grade: number): number {
  const g = Math.max(-0.2, Math.min(0.2, grade));
  const cost = 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6;
  return Math.max(0.45, Math.min(2.5, cost / 3.6));
}

export function getTrailTerrainSummary(
  activity: TrailActivity,
  streams?: Record<string, ActivityStream> | null
): TrailTerrainSummary {
  const detection = getTrailDetection(activity);
  const splits = activity.splits_metric ?? [];
  const kilometers: TrailKilometer[] = splits.map((split, index) => ({
    kilometer: split.split || index + 1,
    distanceMeters: split.distance,
    altitudeCoverage: 0,
    ascentMeters: 0,
    descentMeters: 0,
    netElevationMeters: split.elevation_difference ?? 0,
    paceSecondsPerKm: split.distance > 0 ? split.moving_time / split.distance * 1000 : undefined,
    averageHeartRate: typeof split.average_heartrate === 'number' && Number.isFinite(split.average_heartrate)
      ? Math.round(split.average_heartrate)
      : undefined,
  }));
  const distances = streams?.distance?.data;
  const altitudes = streams?.altitude?.data;
  if (!detection.isTrail || !Array.isArray(distances) || !Array.isArray(altitudes)
    || distances.length !== altitudes.length || distances.length < 3
    || typeof distances[0] !== 'number' || typeof altitudes[0] !== 'number') {
    return {
      ...detection,
      climbMetersPerKm: activity.distance > 0 ? activity.total_elevation_gain / (activity.distance / 1000) : 0,
      kilometers,
      gradeCoverage: 0,
    };
  }

  const distanceData = distances as number[];
  const altitudeData = altitudes as number[];
  if (kilometers.length === 0) {
    for (let index = 0; index < Math.min(100, Math.ceil(activity.distance / 1000)); index += 1) {
      kilometers.push({ kilometer: index + 1, distanceMeters: Math.min(1000, activity.distance - index * 1000), altitudeCoverage: 0, ascentMeters: 0, descentMeters: 0, netElevationMeters: 0 });
    }
  }
  const equivalentByKm = new Map<number, number>();
  let covered = 0;
  let equivalentDistance = 0;
  let anchor = 0;
  for (let index = 1; index < distanceData.length; index += 1) {
    const span = distanceData[index] - distanceData[anchor];
    if (span < 50) continue;
    const rise = altitudeData[index] - altitudeData[anchor];
    if (!Number.isFinite(span) || !Number.isFinite(rise) || span > 250) {
      anchor = index;
      continue;
    }
    const kilometerIndex = Math.floor(((distanceData[index] + distanceData[anchor]) / 2) / 1000);
    const equivalent = span * relativeGradeCost(rise / span);
    covered += span;
    equivalentDistance += equivalent;
    equivalentByKm.set(kilometerIndex, (equivalentByKm.get(kilometerIndex) ?? 0) + equivalent);
    if (kilometers[kilometerIndex]) {
      kilometers[kilometerIndex].altitudeCoverage += span;
      kilometers[kilometerIndex].ascentMeters += Math.max(0, rise);
      kilometers[kilometerIndex].descentMeters += Math.max(0, -rise);
      if (splits.length === 0) kilometers[kilometerIndex].netElevationMeters += rise;
    }
    anchor = index;
  }
  const coverage = activity.distance > 0 ? Math.min(1, covered / activity.distance) : 0;
  const reliable = coverage >= 0.8 && equivalentDistance > 0;
  kilometers.forEach((km) => {
    km.altitudeCoverage = km.distanceMeters > 0 ? Math.min(1, km.altitudeCoverage / km.distanceMeters) : 0;
  });
  for (const [index, distance] of equivalentByKm) {
    const split = splits[index];
    if (reliable && kilometers[index]?.altitudeCoverage >= 0.8 && split?.moving_time && distance >= 500) {
      kilometers[index].equivalentPaceSecondsPerKm = split.moving_time / distance * 1000;
    }
  }
  return {
    ...detection,
    climbMetersPerKm: activity.distance > 0 ? activity.total_elevation_gain / (activity.distance / 1000) : 0,
    kilometers,
    equivalentPaceSecondsPerKm: reliable && activity.moving_time > 0
      ? activity.moving_time / equivalentDistance * 1000
      : undefined,
    gradeCoverage: coverage,
  };
}
