import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-weather-test');
mkdirSync(tempDir, { recursive: true });

const source = readFileSync('src/lib/weather.ts', 'utf8');
writeFileSync(path.join(tempDir, 'weather.js'), ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@/types') return {};
  return originalLoad.call(this, request, parent, isMain);
};
test.after(() => {
  Module._load = originalLoad;
});

const {
  buildActivityWeatherContext,
  formatWeatherContextSummary,
  getThermalContext,
  getWeatherSourceLabel,
} = require(path.join(tempDir, 'weather.js'));

test('buildActivityWeatherContext merges device temperature and description weather', () => {
  const weather = buildActivityWeatherContext({
    average_temp: 31,
    description: '天气：晴 体感 36°C 湿度 84% 风速 13 km/h',
  });

  assert.equal(weather.temperatureC, 31);
  assert.equal(weather.feelsLikeC, 36);
  assert.equal(weather.humidityPercent, 84);
  assert.equal(weather.windSpeedKmh, 13);
  assert.equal(weather.condition, '晴');
  assert.equal(weather.source, 'mixed');
  assert.equal(weather.thermalSeverity, 'heat-stress');
});

test('buildActivityWeatherContext falls back to temp stream when activity has no average temp', () => {
  const weather = buildActivityWeatherContext(
    { description: '', distance: 5000 },
    {
      temp: {
        type: 'temp',
        data: [28, 29, 30],
        series_type: 'distance',
        original_size: 3,
        resolution: 'high',
      },
    }
  );

  assert.equal(weather.temperatureC, 29);
  assert.equal(weather.source, 'stream');
  assert.equal(weather.thermalSeverity, 'heat-load');
});

test('weather labels and summary are localized', () => {
  const weather = buildActivityWeatherContext({
    average_temp: 27,
    description: '湿度 75%',
  });

  assert.equal(getWeatherSourceLabel(weather, 'zh'), '多来源');
  assert.match(formatWeatherContextSummary(weather, 'zh'), /27°C/);
  assert.match(formatWeatherContextSummary(weather, 'zh'), /湿度 75%/);
  assert.equal(getThermalContext(weather, 'zh').label, '热负荷偏高');
});
