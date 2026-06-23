import type { ActivityStream, StravaActivity, User } from '@/types';
import type { SavedRoute } from '@/store/routes';
import {
  generateFallbackTrainingPlan,
  type RaceDistance,
  type TrainingPlan,
} from '@/lib/trainingPlan';

export const GUEST_ACCESS_TOKEN = 'runblue_guest_demo_token';

export const GUEST_USER: User = {
  id: 'guest-demo',
  stravaId: 0,
  email: 'guest@runblue.local',
  name: '游客体验',
  image: null,
  accessToken: GUEST_ACCESS_TOKEN,
  refreshToken: '',
  expiresAt: 4102444800,
  isGuest: true,
};

const GUEST_PLANS_STORAGE_KEY = 'runblue_guest_training_plans';

interface GuestRouteDefinition {
  id: string;
  name: string;
  points: [number, number][];
  elevationGain: number;
}

interface GuestActivitySpec {
  id: number;
  routeId: string;
  name: string;
  date: string;
  distance: number;
  movingTime: number;
  elevationGain: number;
  averageHr: number;
  maxHr: number;
  workoutType?: number;
  gearId?: string;
  gearName?: string;
  description?: string;
  laps?: 'interval' | 'steady';
}

const GEAR = {
  vomero: { id: 'guest_vomero', name: 'Nike Vomero 18 GTX', distance: 182400 },
  pegasus: { id: 'guest_pegasus', name: 'Nike Pegasus Plus', distance: 96500 },
};

const ROUTES: GuestRouteDefinition[] = [
  {
    id: 'creek',
    name: '苏州河晨跑',
    elevationGain: 24,
    points: [
      [31.2328, 121.4078],
      [31.2362, 121.4215],
      [31.2384, 121.4386],
      [31.2362, 121.4542],
      [31.2319, 121.4706],
      [31.2268, 121.4862],
    ],
  },
  {
    id: 'track',
    name: '操场间歇',
    elevationGain: 8,
    points: repeatLoop([
      [31.2298, 121.4028],
      [31.2305, 121.4042],
      [31.2291, 121.4051],
      [31.2284, 121.4035],
      [31.2298, 121.4028],
    ], 5),
  },
  {
    id: 'long',
    name: '外滩长距离',
    elevationGain: 55,
    points: [
      [31.2188, 121.4312],
      [31.2296, 121.4468],
      [31.2404, 121.4636],
      [31.2462, 121.4865],
      [31.2358, 121.5046],
      [31.2185, 121.4938],
      [31.2069, 121.4684],
      [31.2115, 121.4438],
      [31.2188, 121.4312],
    ],
  },
  {
    id: 'park',
    name: '世纪公园节奏跑',
    elevationGain: 18,
    points: [
      [31.2163, 121.5458],
      [31.2224, 121.5532],
      [31.2208, 121.5668],
      [31.2117, 121.5694],
      [31.2078, 121.5582],
      [31.2115, 121.5484],
      [31.2163, 121.5458],
    ],
  },
];

const SPECS: GuestActivitySpec[] = [
  {
    id: 910001,
    routeId: 'creek',
    name: 'Morning Run',
    date: '2026-06-21T06:20:00Z',
    distance: 7200,
    movingTime: 2544,
    elevationGain: 23,
    averageHr: 142,
    maxHr: 158,
    workoutType: 3,
    gearId: GEAR.vomero.id,
    gearName: GEAR.vomero.name,
    description: '示例：一次普通晨跑，适合查看活动详情、地图和路线收藏。',
  },
  {
    id: 910002,
    routeId: 'track',
    name: 'Track Intervals',
    date: '2026-06-18T19:05:00Z',
    distance: 6400,
    movingTime: 2144,
    elevationGain: 8,
    averageHr: 156,
    maxHr: 181,
    workoutType: 3,
    gearId: GEAR.pegasus.id,
    gearName: GEAR.pegasus.name,
    description: '示例：圈数超过 3 的间歇课，用来体验分圈和 AI 分析结构。',
    laps: 'interval',
  },
  {
    id: 910003,
    routeId: 'long',
    name: 'Long Run',
    date: '2026-06-15T07:10:00Z',
    distance: 18200,
    movingTime: 6780,
    elevationGain: 58,
    averageHr: 148,
    maxHr: 166,
    workoutType: 2,
    gearId: GEAR.vomero.id,
    gearName: GEAR.vomero.name,
    laps: 'steady',
  },
  {
    id: 910004,
    routeId: 'park',
    name: 'Tempo Run',
    date: '2026-06-12T18:45:00Z',
    distance: 9800,
    movingTime: 3038,
    elevationGain: 18,
    averageHr: 163,
    maxHr: 178,
    workoutType: 3,
    gearId: GEAR.pegasus.id,
    gearName: GEAR.pegasus.name,
  },
  {
    id: 910005,
    routeId: 'creek',
    name: 'Morning Run',
    date: '2026-06-08T06:28:00Z',
    distance: 7180,
    movingTime: 2621,
    elevationGain: 22,
    averageHr: 139,
    maxHr: 154,
    workoutType: 3,
    gearId: GEAR.vomero.id,
    gearName: GEAR.vomero.name,
  },
  {
    id: 910006,
    routeId: 'track',
    name: 'Afternoon Run',
    date: '2026-06-05T18:58:00Z',
    distance: 5200,
    movingTime: 1780,
    elevationGain: 7,
    averageHr: 151,
    maxHr: 174,
    workoutType: 3,
    gearId: GEAR.pegasus.id,
    gearName: GEAR.pegasus.name,
    laps: 'interval',
  },
  {
    id: 910007,
    routeId: 'creek',
    name: 'Easy Run',
    date: '2026-05-31T07:18:00Z',
    distance: 7240,
    movingTime: 2700,
    elevationGain: 25,
    averageHr: 136,
    maxHr: 150,
    workoutType: 3,
    gearId: GEAR.vomero.id,
    gearName: GEAR.vomero.name,
  },
  {
    id: 910008,
    routeId: 'long',
    name: 'Sunday LSD',
    date: '2026-05-25T06:50:00Z',
    distance: 16800,
    movingTime: 6398,
    elevationGain: 52,
    averageHr: 145,
    maxHr: 160,
    workoutType: 2,
    gearId: GEAR.vomero.id,
    gearName: GEAR.vomero.name,
    laps: 'steady',
  },
  {
    id: 910009,
    routeId: 'park',
    name: 'Progression Run',
    date: '2026-05-21T19:12:00Z',
    distance: 10000,
    movingTime: 3220,
    elevationGain: 17,
    averageHr: 158,
    maxHr: 174,
    workoutType: 3,
    gearId: GEAR.pegasus.id,
    gearName: GEAR.pegasus.name,
  },
  {
    id: 910010,
    routeId: 'creek',
    name: 'Morning Run',
    date: '2026-05-17T06:32:00Z',
    distance: 7190,
    movingTime: 2662,
    elevationGain: 21,
    averageHr: 138,
    maxHr: 153,
    workoutType: 3,
    gearId: GEAR.vomero.id,
    gearName: GEAR.vomero.name,
  },
  {
    id: 910011,
    routeId: 'track',
    name: 'Intervals 6x800m',
    date: '2026-05-14T19:00:00Z',
    distance: 7600,
    movingTime: 2536,
    elevationGain: 9,
    averageHr: 159,
    maxHr: 184,
    workoutType: 3,
    gearId: GEAR.pegasus.id,
    gearName: GEAR.pegasus.name,
    laps: 'interval',
  },
  {
    id: 910012,
    routeId: 'long',
    name: 'Long Run',
    date: '2026-05-10T07:04:00Z',
    distance: 19500,
    movingTime: 7380,
    elevationGain: 62,
    averageHr: 149,
    maxHr: 168,
    workoutType: 2,
    gearId: GEAR.vomero.id,
    gearName: GEAR.vomero.name,
    laps: 'steady',
  },
];

const ROUTE_BY_ID = new Map(ROUTES.map((route) => [route.id, route]));
const POLYLINE_BY_ROUTE = new Map(ROUTES.map((route) => [route.id, encodePolyline(route.points)]));

const GUEST_ACTIVITIES = SPECS
  .map(createGuestActivity)
  .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

const GUEST_ROUTES = buildGuestRoutes();

export function isGuestUser(user: Pick<User, 'id' | 'isGuest'> | null | undefined): boolean {
  return Boolean(user?.isGuest || user?.id === GUEST_USER.id);
}

export function getGuestActivities(): StravaActivity[] {
  return GUEST_ACTIVITIES;
}

export function getGuestActivity(activityId: number): StravaActivity | null {
  return GUEST_ACTIVITIES.find((activity) => activity.id === activityId) ?? null;
}

export function getGuestActivityStreams(activityId: number): Record<string, ActivityStream> | null {
  const activity = getGuestActivity(activityId);
  if (!activity) return null;

  const route = ROUTE_BY_ID.get(getRouteIdForActivity(activity.id));
  if (!route) return null;

  return buildStreams(activity, route.points);
}

export function getGuestSavedRoutes(): SavedRoute[] {
  return GUEST_ROUTES;
}

export function getGuestTrainingPlans(locale = 'zh'): TrainingPlan[] {
  const stored = readGuestPlans();
  if (stored.length > 0) return stored;

  const seeded = [createGuestTrainingPlan(locale)];
  writeGuestPlans(seeded);
  return seeded;
}

export function getGuestTrainingPlan(id?: string, locale = 'zh'): TrainingPlan | null {
  return getGuestTrainingPlans(locale).find((plan) => !id || plan.id === id) ?? null;
}

export function saveGuestTrainingPlan(plan: TrainingPlan): void {
  const plans = readGuestPlans();
  const existingIndex = plans.findIndex((candidate) => candidate.id === plan.id);
  if (existingIndex >= 0) {
    plans[existingIndex] = plan;
  } else {
    plans.unshift(plan);
  }
  writeGuestPlans(plans);
}

export function deleteGuestTrainingPlan(id: string): void {
  writeGuestPlans(readGuestPlans().filter((plan) => plan.id !== id));
}

function createGuestTrainingPlan(locale: string): TrainingPlan {
  const plan = generateFallbackTrainingPlan('10k', 3000, 8, 1500, 38, locale, 172);
  return {
    ...plan,
    id: 'guest_plan_10k',
    createdAt: '2026-06-01T00:00:00.000Z',
  };
}

export function generateGuestTrainingPlan(input: {
  distance: RaceDistance;
  targetTimeSeconds: number;
  weeks: number;
  pb5kSec: number;
  weeklyVolume: number;
  locale?: string;
  lthr?: number | null;
  raceDate?: string;
}): TrainingPlan {
  const plan = generateFallbackTrainingPlan(
    input.distance,
    input.targetTimeSeconds,
    input.weeks,
    input.pb5kSec,
    input.weeklyVolume,
    input.locale ?? 'zh',
    input.lthr
  );
  return {
    ...plan,
    id: `guest_plan_${Date.now()}`,
    goal: {
      ...plan.goal,
      raceDate: input.raceDate,
    },
  };
}

function readGuestPlans(): TrainingPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(GUEST_PLANS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGuestPlans(plans: TrainingPlan[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(GUEST_PLANS_STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // Guest plans are disposable, so storage failure should not block the demo.
  }
}

function createGuestActivity(spec: GuestActivitySpec): StravaActivity {
  const route = ROUTE_BY_ID.get(spec.routeId);
  if (!route) throw new Error(`Missing guest route: ${spec.routeId}`);

  const polyline = POLYLINE_BY_ROUTE.get(spec.routeId) ?? encodePolyline(route.points);
  const gear = spec.gearId === GEAR.pegasus.id ? GEAR.pegasus : GEAR.vomero;
  const start = route.points[0];
  const end = route.points[route.points.length - 1];
  const averageSpeed = spec.distance / spec.movingTime;

  return {
    id: spec.id,
    name: spec.name,
    distance: spec.distance,
    moving_time: spec.movingTime,
    elapsed_time: spec.movingTime + 90,
    total_elevation_gain: spec.elevationGain,
    type: 'Run',
    sport_type: 'Run',
    start_date: spec.date,
    start_date_local: spec.date,
    timezone: '(GMT+08:00) Asia/Shanghai',
    utc_offset: 28800,
    location_city: 'Shanghai',
    location_state: 'Shanghai',
    location_country: 'China',
    achievement_count: spec.workoutType === 2 ? 2 : 0,
    kudos_count: 12,
    comment_count: 0,
    athlete_count: 1,
    photo_count: 0,
    map: {
      id: `guest_map_${spec.id}`,
      polyline,
      summary_polyline: polyline,
    },
    trainer: false,
    commute: false,
    manual: false,
    private: false,
    visibility: 'everyone',
    flagged: false,
    gear_id: spec.gearId ?? GEAR.vomero.id,
    gear: {
      id: spec.gearId ?? gear.id,
      name: spec.gearName ?? gear.name,
      distance: gear.distance,
    },
    device_name: 'Run Blue Demo Watch',
    start_latlng: start,
    end_latlng: end,
    average_speed: averageSpeed,
    max_speed: averageSpeed * (spec.laps === 'interval' ? 1.45 : 1.22),
    average_cadence: spec.laps === 'interval' ? 176 : 170,
    average_temp: 24,
    has_heartrate: true,
    average_heartrate: spec.averageHr,
    max_heartrate: spec.maxHr,
    heartrate_opt_out: false,
    display_hide_heartrate_option: false,
    elev_high: 22 + spec.elevationGain,
    elev_low: 5,
    calories: Math.round(spec.distance / 1000 * 65),
    description: spec.description,
    upload_id: spec.id,
    upload_id_str: `${spec.id}`,
    external_id: `guest_${spec.id}.fit`,
    from_accepted_tag: false,
    pr_count: spec.workoutType === 1 ? 1 : 0,
    total_photo_count: 0,
    has_kudoed: false,
    workout_type: spec.workoutType,
    splits_metric: buildSplits(spec.distance, spec.movingTime, spec.averageHr),
    laps: spec.laps ? buildLaps(spec) : undefined,
    best_efforts: buildBestEfforts(spec),
  };
}

function buildGuestRoutes(): SavedRoute[] {
  return ROUTES.map((route) => {
    const routeActivities = GUEST_ACTIVITIES.filter((activity) => getRouteIdForActivity(activity.id) === route.id);
    const reference = routeActivities[0];
    const activityIds = routeActivities.map((activity) => activity.id);
    const avgDistance = Math.round(
      routeActivities.reduce((sum, activity) => sum + activity.distance, 0) / Math.max(routeActivities.length, 1)
    );

    return {
      key: `guest-${route.id}`,
      name: route.name,
      activityIds,
      createdAt: new Date(reference?.start_date ?? '2026-06-01T00:00:00Z').getTime(),
      referenceActivityId: reference?.id ?? 0,
      polyline: POLYLINE_BY_ROUTE.get(route.id),
      distance: avgDistance,
      elevationGain: route.elevationGain,
    };
  }).filter((route) => route.activityIds.length > 0);
}

function getRouteIdForActivity(activityId: number): string {
  return SPECS.find((spec) => spec.id === activityId)?.routeId ?? '';
}

function buildSplits(distance: number, movingTime: number, averageHr: number) {
  const splits = [];
  const fullKm = Math.floor(distance / 1000);
  const remainder = distance - fullKm * 1000;
  const pace = movingTime / (distance / 1000);

  for (let i = 1; i <= fullKm; i++) {
    const splitTime = Math.round(pace + Math.sin(i) * 8);
    splits.push({
      distance: 1000,
      elapsed_time: splitTime,
      elevation_difference: Math.round(Math.sin(i / 2) * 3),
      moving_time: splitTime,
      split: i,
      average_speed: 1000 / splitTime,
      average_heartrate: Math.round(averageHr + Math.sin(i / 1.7) * 5),
      pace_zone: 0,
    });
  }

  if (remainder > 20) {
    const splitTime = Math.round(pace * (remainder / 1000));
    splits.push({
      distance: remainder,
      elapsed_time: splitTime,
      elevation_difference: 0,
      moving_time: splitTime,
      split: fullKm + 1,
      average_speed: remainder / splitTime,
      average_heartrate: averageHr,
      pace_zone: 0,
    });
  }

  return splits;
}

function buildLaps(spec: GuestActivitySpec) {
  const lapCount = spec.laps === 'interval' ? 8 : Math.max(4, Math.round(spec.distance / 5000));
  const distancePerLap = spec.distance / lapCount;
  const timePerLap = spec.movingTime / lapCount;

  return Array.from({ length: lapCount }, (_, index) => {
    const isFast = spec.laps === 'interval' && index % 2 === 0;
    const movingTime = Math.round(timePerLap * (isFast ? 0.82 : 1.18));
    return {
      id: spec.id * 100 + index,
      lap_index: index + 1,
      name: `Lap ${index + 1}`,
      distance: distancePerLap,
      elapsed_time: movingTime + 12,
      moving_time: movingTime,
      start_date: spec.date,
      average_speed: distancePerLap / movingTime,
      max_speed: distancePerLap / movingTime * (isFast ? 1.18 : 1.08),
      average_heartrate: Math.round(spec.averageHr + (isFast ? 10 : -6)),
      max_heartrate: Math.round(spec.maxHr - (isFast ? 0 : 12)),
      total_elevation_gain: 0,
    };
  });
}

function buildBestEfforts(spec: GuestActivitySpec) {
  if (spec.distance < 5000) return undefined;
  const pace = spec.movingTime / (spec.distance / 1000);
  return [
    { name: '1k', elapsed_time: Math.round(pace * 0.94), distance: 1000 },
    { name: '5k', elapsed_time: Math.round(pace * 5 * (spec.laps === 'interval' ? 0.96 : 1)), distance: 5000 },
  ];
}

function buildStreams(activity: StravaActivity, routePoints: [number, number][]): Record<string, ActivityStream> {
  const size = Math.max(60, Math.min(180, Math.round(activity.distance / 90)));
  const latlng = interpolateRoute(routePoints, size);
  const time = Array.from({ length: size }, (_, index) => Math.round(index / (size - 1) * activity.moving_time));
  const distance = Array.from({ length: size }, (_, index) => index / (size - 1) * activity.distance);
  const baseSpeed = activity.distance / activity.moving_time;
  const velocity = Array.from({ length: size }, (_, index) => {
    const wave = Math.sin(index / 5) * 0.08;
    const intervalKick = activity.laps && index % 18 < 8 ? 0.18 : 0;
    return Math.max(1.8, baseSpeed * (1 + wave + intervalKick));
  });
  const heartrate = Array.from({ length: size }, (_, index) => {
    const warmup = Math.min(1, index / Math.max(12, size * 0.18));
    const wave = Math.sin(index / 6) * 4;
    return Math.round((activity.average_heartrate ?? 145) - 10 + warmup * 14 + wave);
  });
  const altitude = Array.from({ length: size }, (_, index) => 8 + Math.sin(index / 9) * 4 + index / size * 3);

  return {
    time: makeStream('time', time),
    distance: makeStream('distance', distance),
    latlng: makeStream('latlng', latlng),
    altitude: makeStream('altitude', altitude),
    velocity_smooth: makeStream('velocity_smooth', velocity),
    heartrate: makeStream('heartrate', heartrate),
  };
}

function makeStream<T extends number[] | [number, number][]>(
  type: ActivityStream['type'],
  data: T
): ActivityStream {
  return {
    type,
    data,
    series_type: 'time',
    original_size: data.length,
    resolution: 'high',
  };
}

function interpolateRoute(points: [number, number][], count: number): [number, number][] {
  if (points.length <= 1) return points;
  const segments = points.length - 1;
  return Array.from({ length: count }, (_, index) => {
    const position = index / Math.max(1, count - 1) * segments;
    const segmentIndex = Math.min(Math.floor(position), segments - 1);
    const t = position - segmentIndex;
    const from = points[segmentIndex];
    const to = points[segmentIndex + 1];
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ];
  });
}

function repeatLoop(points: [number, number][], count: number): [number, number][] {
  const result: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    result.push(...(i === 0 ? points : points.slice(1)));
  }
  return result;
}

function encodePolyline(points: [number, number][]): string {
  let previousLat = 0;
  let previousLng = 0;

  return points.map(([lat, lng]) => {
    const scaledLat = Math.round(lat * 1e5);
    const scaledLng = Math.round(lng * 1e5);
    const encoded = encodeSignedNumber(scaledLat - previousLat) + encodeSignedNumber(scaledLng - previousLng);
    previousLat = scaledLat;
    previousLng = scaledLng;
    return encoded;
  }).join('');
}

function encodeSignedNumber(value: number): string {
  let shifted = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (shifted >= 0x20) {
    output += String.fromCharCode((0x20 | (shifted & 0x1f)) + 63);
    shifted >>= 5;
  }
  output += String.fromCharCode(shifted + 63);
  return output;
}
