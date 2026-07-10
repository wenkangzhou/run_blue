import type {
  ActivityStream,
  ActivityThermalSeverity,
  ActivityWeatherContext,
  ActivityWeatherSource,
  StravaActivity,
} from '@/types';

type UnknownRecord = Record<string, unknown>;

export interface ThermalContext {
  level: ActivityThermalSeverity;
  label: string;
  guidance: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function normalizedTemperature(value: unknown): number | undefined {
  const n = finiteNumber(value);
  if (n === undefined || n < -50 || n > 70) return undefined;
  return Math.round(n * 10) / 10;
}

function normalizedPercent(value: unknown): number | undefined {
  const n = finiteNumber(value);
  if (n === undefined || n < 0 || n > 100) return undefined;
  return Math.round(n);
}

function normalizedSpeed(value: unknown): number | undefined {
  const n = finiteNumber(value);
  if (n === undefined || n < 0 || n > 200) return undefined;
  return Math.round(n * 10) / 10;
}

function normalizedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function firstNumber(record: UnknownRecord, keys: string[], normalize = finiteNumber): number | undefined {
  for (const key of keys) {
    const value = normalize(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function firstString(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = normalizedText(record[key]);
    if (value) return value;
  }
  return undefined;
}

function averageTempFromStream(streams?: Record<string, ActivityStream> | null): number | undefined {
  const values = streams?.temp?.data;
  if (!Array.isArray(values)) return undefined;

  const valid = values.filter((value): value is number => (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > -50 &&
    value < 70
  ));
  if (valid.length === 0) return undefined;

  const avg = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return Math.round(avg * 10) / 10;
}

function parseDescriptionWeather(description?: string): Partial<ActivityWeatherContext> | null {
  if (!description) return null;

  const result: Partial<ActivityWeatherContext> = {};
  const tempPatterns = [
    /🌡️?\s*(-?\d+(?:\.\d+)?)\s*[°℃]?\s*C/i,
    /气温[:：\s]*(-?\d+(?:\.\d+)?)\s*[°℃]?\s*C?/i,
    /Temp(?:erature)?[:：\s]*(-?\d+(?:\.\d+)?)\s*[°℃]?\s*C?/i,
  ];
  const feelsPatterns = [
    /Feels like\s*(-?\d+(?:\.\d+)?)\s*[°℃]?\s*C?/i,
    /体感(?:温度)?[:：\s]*(-?\d+(?:\.\d+)?)\s*[°℃]?\s*C?/i,
  ];
  const humidityPatterns = [
    /💧\s*(\d{1,3})\s*%/,
    /湿度[:：\s]*(\d{1,3})\s*%?/i,
    /Humidity[:：\s]*(\d{1,3})\s*%?/i,
  ];
  const windPatterns = [
    /💨\s*(\d+(?:\.\d+)?)\s*km\/h/i,
    /风速[:：\s]*(\d+(?:\.\d+)?)\s*km\/h/i,
    /Wind[:：\s]*(\d+(?:\.\d+)?)\s*km\/h/i,
  ];
  const conditionPatterns = [
    /天气[:：\s]*([^\n,，。]+)/i,
    /Weather[:：\s]*([^\n,，。]+)/i,
  ];

  for (const pattern of tempPatterns) {
    const match = description.match(pattern);
    const value = normalizedTemperature(match ? Number(match[1]) : undefined);
    if (value !== undefined) {
      result.temperatureC = value;
      break;
    }
  }

  for (const pattern of feelsPatterns) {
    const match = description.match(pattern);
    const value = normalizedTemperature(match ? Number(match[1]) : undefined);
    if (value !== undefined) {
      result.feelsLikeC = value;
      break;
    }
  }

  for (const pattern of humidityPatterns) {
    const match = description.match(pattern);
    const value = normalizedPercent(match ? Number(match[1]) : undefined);
    if (value !== undefined) {
      result.humidityPercent = value;
      break;
    }
  }

  for (const pattern of windPatterns) {
    const match = description.match(pattern);
    const value = normalizedSpeed(match ? Number(match[1]) : undefined);
    if (value !== undefined) {
      result.windSpeedKmh = value;
      break;
    }
  }

  for (const pattern of conditionPatterns) {
    const match = description.match(pattern);
    if (match?.[1]) {
      const condition = match[1]
        .replace(/\s*(?:体感|湿度|风速|Feels like|Humidity|Wind).*$/i, '')
        .trim();
      result.condition = condition.length > 0 ? condition : match[1].trim();
      break;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function extractStravaWeatherFields(activity: StravaActivity): Partial<ActivityWeatherContext> | null {
  const activityRecord = activity as unknown as UnknownRecord;
  const weather = isRecord(activityRecord.weather) ? activityRecord.weather : null;
  const result: Partial<ActivityWeatherContext> = {};

  if (weather) {
    result.temperatureC = firstNumber(weather, [
      'temperature',
      'temperature_c',
      'temp',
      'temp_c',
      'average_temp',
    ], normalizedTemperature);
    result.feelsLikeC = firstNumber(weather, [
      'feels_like',
      'feels_like_c',
      'apparent_temperature',
      'apparent_temperature_c',
    ], normalizedTemperature);
    result.humidityPercent = firstNumber(weather, [
      'humidity',
      'relative_humidity',
      'humidity_percent',
    ], normalizedPercent);
    result.windSpeedKmh = firstNumber(weather, [
      'wind_speed',
      'wind_speed_kmh',
      'wind_kmh',
    ], normalizedSpeed);
    result.condition = firstString(weather, ['condition', 'summary', 'description', 'icon']);
  }

  result.temperatureC ??= firstNumber(activityRecord, [
    'weather_temperature',
    'temperature',
    'temperature_c',
  ], normalizedTemperature);
  result.feelsLikeC ??= firstNumber(activityRecord, [
    'weather_feels_like',
    'feels_like',
    'apparent_temperature',
  ], normalizedTemperature);
  result.humidityPercent ??= firstNumber(activityRecord, [
    'weather_humidity',
    'humidity',
    'relative_humidity',
  ], normalizedPercent);
  result.windSpeedKmh ??= firstNumber(activityRecord, [
    'weather_wind_speed',
    'wind_speed',
    'wind_speed_kmh',
  ], normalizedSpeed);
  result.condition ??= firstString(activityRecord, [
    'weather_condition',
    'weather_summary',
  ]);

  return Object.keys(result).length > 0 ? result : null;
}

function hasWeatherValue(context: Partial<ActivityWeatherContext>): boolean {
  return (
    context.temperatureC !== undefined ||
    context.feelsLikeC !== undefined ||
    context.humidityPercent !== undefined ||
    context.windSpeedKmh !== undefined ||
    Boolean(context.condition)
  );
}

function mergeSource(sources: ActivityWeatherSource[], source: ActivityWeatherSource) {
  if (!sources.includes(source)) sources.push(source);
}

export function getThermalSeverity(weather: Pick<ActivityWeatherContext, 'temperatureC' | 'feelsLikeC' | 'humidityPercent'>): ActivityThermalSeverity {
  const temp = weather.feelsLikeC ?? weather.temperatureC;
  const humidity = weather.humidityPercent;

  if (
    (temp !== undefined && temp >= 30) ||
    ((weather.feelsLikeC ?? 0) >= 32) ||
    (temp !== undefined && temp >= 28 && humidity !== undefined && humidity >= 80)
  ) {
    return 'heat-stress';
  }

  if (
    (temp !== undefined && temp >= 26) ||
    ((weather.feelsLikeC ?? 0) >= 29) ||
    (temp !== undefined && temp >= 24 && humidity !== undefined && humidity >= 78)
  ) {
    return 'heat-load';
  }

  if ((humidity !== undefined && humidity >= 70) || (temp !== undefined && temp >= 22)) {
    return 'muggy';
  }

  return 'neutral';
}

export function buildActivityWeatherContext(
  activity: StravaActivity,
  streams?: Record<string, ActivityStream> | null
): ActivityWeatherContext {
  if (activity.weather_context?.hasWeather) {
    return activity.weather_context;
  }

  const sources: ActivityWeatherSource[] = [];
  const result: Partial<ActivityWeatherContext> = {};

  const stravaWeather = extractStravaWeatherFields(activity);
  if (stravaWeather && hasWeatherValue(stravaWeather)) {
    Object.assign(result, stravaWeather);
    mergeSource(sources, 'strava');
  }

  const descriptionWeather = parseDescriptionWeather(activity.description);
  if (descriptionWeather && hasWeatherValue(descriptionWeather)) {
    result.temperatureC ??= descriptionWeather.temperatureC;
    result.feelsLikeC ??= descriptionWeather.feelsLikeC;
    result.humidityPercent ??= descriptionWeather.humidityPercent;
    result.windSpeedKmh ??= descriptionWeather.windSpeedKmh;
    result.condition ??= descriptionWeather.condition;
    mergeSource(sources, 'description');
  }

  const deviceTemp = normalizedTemperature(activity.average_temp);
  if (deviceTemp !== undefined) {
    result.temperatureC ??= deviceTemp;
    mergeSource(sources, 'device');
  }

  const streamTemp = averageTempFromStream(streams);
  if (streamTemp !== undefined) {
    result.temperatureC ??= streamTemp;
    mergeSource(sources, 'stream');
  }

  const hasWeather = hasWeatherValue(result);
  const source = hasWeather
    ? (sources.length > 1 ? 'mixed' : sources[0])
    : 'none';
  const context: ActivityWeatherContext = {
    temperatureC: result.temperatureC,
    feelsLikeC: result.feelsLikeC,
    humidityPercent: result.humidityPercent,
    windSpeedKmh: result.windSpeedKmh,
    condition: result.condition,
    sources,
    source,
    hasWeather,
    thermalSeverity: getThermalSeverity(result),
  };

  return context;
}

export function getThermalContext(weather: ActivityWeatherContext, locale: string): ThermalContext {
  const en = locale.startsWith('en');

  if (weather.thermalSeverity === 'heat-stress') {
    return {
      level: 'heat-stress',
      label: en ? 'clear heat stress' : '明显热应激',
      guidance: en
        ? 'Weather is a major factor here. Explicitly adjust pace and heart-rate expectations, and discuss cooling, hydration, and recovery cost.'
        : '天气已构成明显热应激，应明确下调对配速和心率的要求，并讨论降温、补水和恢复成本。',
    };
  }

  if (weather.thermalSeverity === 'heat-load') {
    return {
      level: 'heat-load',
      label: en ? 'meaningful heat load' : '热负荷偏高',
      guidance: en
        ? 'Heat is a meaningful context factor. Account for it when reading pace and heart rate, but do not make it the whole story unless drift or unusual effort supports that.'
        : '天气带来明显热负荷，应把它作为配速和心率解读的重要背景，但除非有明显漂移或异常费力证据，不要把它写成全部原因。',
    };
  }

  if (weather.thermalSeverity === 'muggy') {
    return {
      level: 'muggy',
      label: en ? 'mild warm / muggy context' : '偏闷或偏暖',
      guidance: en
        ? 'Weather adds only a mild thermal cost. Mention it as secondary context if relevant, and do NOT call this heat stress.'
        : '天气只带来轻度的闷热负担，如有必要可作为次要背景提一句，明确不要直接写成“热应激”。',
    };
  }

  return {
    level: 'neutral',
    label: en ? 'broadly neutral conditions' : '天气中性',
    guidance: en
      ? 'Weather looks broadly neutral. Do not foreground it unless the data clearly points there.'
      : '天气整体中性，除非数据明确指向天气因素，否则不要把它放到前台。',
  };
}

export function getWeatherSourceLabel(weather: ActivityWeatherContext, locale: string): string {
  const en = locale.startsWith('en');
  const labels: Record<ActivityWeatherSource | 'mixed' | 'none', string> = en
    ? {
        strava: 'Strava weather',
        device: 'device temperature',
        stream: 'temperature stream',
        description: 'from activity notes',
        mixed: 'mixed sources',
        none: 'no weather data',
      }
    : {
        strava: 'Strava 天气',
        device: '设备温度',
        stream: '温度流',
        description: '来自活动备注',
        mixed: '多来源',
        none: '暂无天气',
      };
  return labels[weather.source];
}

export function formatWeatherContextSummary(weather: ActivityWeatherContext, locale: string): string {
  const en = locale.startsWith('en');
  if (!weather.hasWeather) return en ? 'No weather data' : '暂无天气数据';

  const parts: string[] = [];
  if (weather.condition) parts.push(weather.condition);
  if (weather.temperatureC !== undefined) parts.push(`${weather.temperatureC.toFixed(weather.temperatureC % 1 === 0 ? 0 : 1)}°C`);
  if (weather.feelsLikeC !== undefined) parts.push(en ? `feels ${weather.feelsLikeC}°C` : `体感 ${weather.feelsLikeC}°C`);
  if (weather.humidityPercent !== undefined) parts.push(en ? `${weather.humidityPercent}% humidity` : `湿度 ${weather.humidityPercent}%`);
  if (weather.windSpeedKmh !== undefined) parts.push(en ? `${weather.windSpeedKmh} km/h wind` : `风 ${weather.windSpeedKmh} km/h`);

  return parts.join(' · ');
}
