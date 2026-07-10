import type { ActivityLap, ActivitySplit, ActivityStream, StravaActivity } from '@/types';
import type {
  ActivityClassification,
  TrainingProfile,
} from '@/lib/trainingAnalysis';
import type { UserPhysique } from '@/lib/aiTypes';
import { buildActivityWeatherContext } from '@/lib/weather';

const MAX_LAPS = 40;
const MAX_SPLITS = 50;

type PromptTrainingProfile = Pick<
  TrainingProfile,
  'estimatedPBs' | 'paceZones' | 'patterns' | 'recentLoad' | 'similarStats' | 'thermalStats' | 'totalRunsAnalyzed'
>;

export interface AITrainingSnapshot {
  schemaVersion: '3';
  workout: {
    distanceMeters: number;
    movingTimeSeconds: number;
    elapsedTimeSeconds: number;
    elevationGainMeters: number;
    type: string;
    sportType: string;
    averageTemperatureC?: number;
    weatherContext?: ReturnType<typeof buildActivityWeatherContext>;
    hasHeartRate: boolean;
    averageHeartRate?: number;
    maxHeartRate?: number;
    laps: Array<Pick<ActivityLap, 'lap_index' | 'distance' | 'moving_time' | 'elapsed_time' | 'average_speed' | 'max_speed' | 'average_heartrate' | 'max_heartrate' | 'total_elevation_gain'>>;
    splits: Array<Pick<ActivitySplit, 'split' | 'distance' | 'moving_time' | 'elapsed_time' | 'average_speed' | 'average_heartrate' | 'elevation_difference'>>;
  };
  classification: ActivityClassification;
  profile: PromptTrainingProfile;
  physique?: UserPhysique;
  lthr?: number | null;
  streamSummary?: string;
  hasStreamEvidence: boolean;
}

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeLaps(laps: ActivityLap[] | undefined): AITrainingSnapshot['workout']['laps'] {
  return (laps ?? []).slice(0, MAX_LAPS).map((lap) => ({
    lap_index: lap.lap_index,
    distance: lap.distance,
    moving_time: lap.moving_time,
    elapsed_time: lap.elapsed_time,
    average_speed: lap.average_speed,
    max_speed: lap.max_speed,
    average_heartrate: finiteNumber(lap.average_heartrate),
    max_heartrate: finiteNumber(lap.max_heartrate),
    total_elevation_gain: lap.total_elevation_gain,
  }));
}

function sanitizeSplits(splits: ActivitySplit[] | undefined): AITrainingSnapshot['workout']['splits'] {
  return (splits ?? []).slice(0, MAX_SPLITS).map((split) => ({
    split: split.split,
    distance: split.distance,
    moving_time: split.moving_time,
    elapsed_time: split.elapsed_time,
    average_speed: split.average_speed,
    average_heartrate: finiteNumber(split.average_heartrate),
    elevation_difference: split.elevation_difference,
  }));
}

export function buildAITrainingSnapshot(input: {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
  trainingProfile: TrainingProfile;
  classification: ActivityClassification;
  physique?: UserPhysique;
  lthr?: number | null;
  streamSummary?: string;
}): AITrainingSnapshot {
  const { activity, streams, trainingProfile, classification, physique, lthr, streamSummary } = input;
  const weatherContext = buildActivityWeatherContext(activity, streams);

  return {
    schemaVersion: '3',
    workout: {
      distanceMeters: activity.distance,
      movingTimeSeconds: activity.moving_time,
      elapsedTimeSeconds: activity.elapsed_time,
      elevationGainMeters: activity.total_elevation_gain,
      type: activity.type,
      sportType: activity.sport_type,
      averageTemperatureC: finiteNumber(activity.average_temp),
      weatherContext: weatherContext.hasWeather ? weatherContext : undefined,
      hasHeartRate: activity.has_heartrate,
      averageHeartRate: finiteNumber(activity.average_heartrate),
      maxHeartRate: finiteNumber(activity.max_heartrate),
      laps: sanitizeLaps(activity.laps),
      splits: sanitizeSplits(activity.splits_metric),
    },
    classification,
    profile: {
      estimatedPBs: trainingProfile.estimatedPBs,
      paceZones: trainingProfile.paceZones,
      patterns: trainingProfile.patterns,
      recentLoad: trainingProfile.recentLoad.slice(-4).map((week, index, weeks) => ({
        ...week,
        week: `relative-${weeks.length - index - 1}`,
      })),
      similarStats: trainingProfile.similarStats,
      thermalStats: trainingProfile.thermalStats,
      totalRunsAnalyzed: trainingProfile.totalRunsAnalyzed,
    },
    physique,
    lthr,
    streamSummary,
    hasStreamEvidence: Boolean(streams && Object.keys(streams).length > 0),
  };
}

export function getPromptInputsFromSnapshot(snapshot: AITrainingSnapshot): {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
  trainingProfile: TrainingProfile;
} {
  const activity = {
    distance: snapshot.workout.distanceMeters,
    moving_time: snapshot.workout.movingTimeSeconds,
    elapsed_time: snapshot.workout.elapsedTimeSeconds,
    total_elevation_gain: snapshot.workout.elevationGainMeters,
    type: snapshot.workout.type,
    sport_type: snapshot.workout.sportType,
    average_temp: snapshot.workout.averageTemperatureC,
    weather_context: snapshot.workout.weatherContext,
    has_heartrate: snapshot.workout.hasHeartRate,
    average_heartrate: snapshot.workout.averageHeartRate,
    max_heartrate: snapshot.workout.maxHeartRate,
    laps: snapshot.workout.laps,
    splits_metric: snapshot.workout.splits,
  } as StravaActivity;

  const streams = snapshot.hasStreamEvidence
    ? {
        summary: {
          type: 'time',
          data: [],
          series_type: 'time',
          original_size: 0,
          resolution: 'summary',
        } as ActivityStream,
      }
    : null;

  const trainingProfile = {
    ...snapshot.profile,
    physiologyMetrics: {} as TrainingProfile['physiologyMetrics'],
    dateRange: { start: '', end: '' },
  };

  return { activity, streams, trainingProfile };
}
