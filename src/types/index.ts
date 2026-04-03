export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  utc_offset: number;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  achievement_count: number;
  kudos_count: number;
  comment_count: number;
  athlete_count: number;
  photo_count: number;
  map: {
    id: string;
    polyline: string | null;
    summary_polyline: string | null;
  };
  trainer: boolean;
  commute: boolean;
  manual: boolean;
  private: boolean;
  visibility: string;
  flagged: boolean;
  gear_id: string | null;
  gear?: {
    id: string;
    name: string;
    distance: number;
  };
  device_name?: string;
  start_latlng: [number, number] | null;
  end_latlng: [number, number] | null;
  average_speed: number;
  max_speed: number;
  average_cadence?: number;
  average_temp?: number;
  has_heartrate: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  heartrate_opt_out: boolean;
  display_hide_heartrate_option: boolean;
  elev_high?: number;
  elev_low?: number;
  calories?: number;
  upload_id: number;
  upload_id_str: string;
  external_id: string | null;
  from_accepted_tag: boolean;
  pr_count: number;
  total_photo_count: number;
  has_kudoed: boolean;
  // Extended data for detailed view
  splits_metric?: ActivitySplit[];
  laps?: ActivityLap[];
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
}

export interface ActivitySplit {
  distance: number;
  elapsed_time: number;
  elevation_difference: number;
  moving_time: number;
  split: number;
  average_speed: number;
  average_heartrate?: number;
  pace_zone?: number;
}

export type StravaSplit = ActivitySplit;

export interface ActivityLap {
  id: number;
  lap_index: number;
  name: string;
  distance: number;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  total_elevation_gain: number;
}

export type StravaLap = ActivityLap;

export interface ActivityStream {
  type: 'time' | 'distance' | 'latlng' | 'altitude' | 'velocity_smooth' | 'heartrate' | 'cadence' | 'watts' | 'temp' | 'moving' | 'grade_smooth';
  data: number[] | [number, number][];
  series_type: 'distance' | 'time';
  original_size: number;
  resolution: string;
}

export interface StravaAthlete {
  id: number;
  username: string | null;
  resource_state: number;
  firstname: string;
  lastname: string;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  sex: string | null;
  premium: boolean;
  summit: boolean;
  created_at: string;
  updated_at: string;
  badge_type_id: number;
  weight: number;
  profile_medium: string;
  profile: string;
  friend: number | null;
  follower: number | null;
}

export interface StravaToken {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete?: StravaAthlete;
}

export interface User {
  id: string;
  stravaId: number;
  email: string;
  name: string;
  image: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
