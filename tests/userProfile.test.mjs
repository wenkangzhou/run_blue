import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { cleanupBrowserStorage, installBrowserStorage } from './helpers/browserStorage.mjs';

const require = createRequire(import.meta.url);
const tempDir = path.join(os.tmpdir(), 'runblue-userProfile-test');
mkdirSync(tempDir, { recursive: true });

const sourcePath = path.resolve('src/lib/userProfile.ts');
const compiledPath = path.join(tempDir, 'userProfile.cjs');
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

writeFileSync(compiledPath, compiled);

const {
  clearUserProfile,
  formatSecondsToTime,
  getMergedPBsForAnalysis,
  getUserProfile,
  isUserProfileRangeValue,
  parseTimeToSeconds,
  saveUserProfile,
} = require(compiledPath);

test.afterEach(cleanupBrowserStorage);

test('getUserProfile normalizes legacy and malformed stored profile fields', () => {
  installBrowserStorage({
    local: {
      runblue_user_profile: JSON.stringify({
        pbs: {
          '5k': 1500,
          '10k': -1,
          '21k': '7200',
        },
        height: 178,
        weight: Number.NaN,
        maxHeartRate: 182,
        lthr: 172,
      }),
    },
  });

  assert.deepEqual(getUserProfile(), {
    pbs: {
      '5k': 1500,
      '10k': null,
      '21k': null,
      '42k': null,
    },
    height: 178,
    weight: null,
    maxHeartRate: 182,
    lthr: 172,
    updatedAt: '',
  });
});

test('saveUserProfile strips invalid numeric fields before persisting', () => {
  const localStorage = installBrowserStorage();
  const originalNow = Date.now;
  const realDate = Date;

  class FixedDate extends Date {
    constructor(...args) {
      if (args.length === 0) {
        super('2026-06-04T08:00:00.000Z');
      } else {
        super(...args);
      }
    }
  }

  globalThis.Date = FixedDate;

  try {
    const saved = saveUserProfile({
      pbs: {
        '5k': 1500,
        '10k': 0,
        '21k': Number.POSITIVE_INFINITY,
        '42k': null,
      },
      height: -178,
      weight: 68,
      maxHeartRate: Number.NaN,
      lthr: Number.NaN,
    });

    assert.deepEqual(saved, {
      pbs: {
        '5k': 1500,
        '10k': null,
        '21k': null,
        '42k': null,
      },
      height: null,
      weight: 68,
      maxHeartRate: null,
      lthr: null,
      updatedAt: '2026-06-04T08:00:00.000Z',
    });
    assert.deepEqual(JSON.parse(localStorage.data.get('runblue_user_profile')), saved);
  } finally {
    Date.now = originalNow;
    globalThis.Date = realDate;
  }
});

test('isUserProfileRangeValue validates physique and heart-rate ranges', () => {
  assert.equal(isUserProfileRangeValue('height', 50), true);
  assert.equal(isUserProfileRangeValue('height', 250), true);
  assert.equal(isUserProfileRangeValue('height', 49), false);
  assert.equal(isUserProfileRangeValue('weight', 300), true);
  assert.equal(isUserProfileRangeValue('weight', 301), false);
  assert.equal(isUserProfileRangeValue('maxHeartRate', 100), true);
  assert.equal(isUserProfileRangeValue('maxHeartRate', 240), true);
  assert.equal(isUserProfileRangeValue('maxHeartRate', 182.5), false);
  assert.equal(isUserProfileRangeValue('maxHeartRate', null), true);
  assert.equal(isUserProfileRangeValue('lthr', 80), true);
  assert.equal(isUserProfileRangeValue('lthr', 240), true);
  assert.equal(isUserProfileRangeValue('lthr', 240.5), false);
  assert.equal(isUserProfileRangeValue('lthr', null), true);
});

test('clearUserProfile removes persisted profile data', () => {
  const localStorage = installBrowserStorage({
    local: {
      runblue_user_profile: JSON.stringify({ pbs: { '5k': 1500 } }),
    },
  });

  clearUserProfile();

  assert.equal(localStorage.data.has('runblue_user_profile'), false);
});

test('parseTimeToSeconds accepts valid race time formats and rejects overflow', () => {
  assert.equal(parseTimeToSeconds('19:58'), 1198);
  assert.equal(parseTimeToSeconds('1:29:30'), 5370);
  assert.equal(parseTimeToSeconds(' 0:59 '), 59);
  assert.equal(parseTimeToSeconds('40: 00'), 2400);
  assert.equal(parseTimeToSeconds('1：45：00'), 6300);

  assert.equal(parseTimeToSeconds('1:60'), null);
  assert.equal(parseTimeToSeconds('1:60:00'), null);
  assert.equal(parseTimeToSeconds('1:20:99'), null);
  assert.equal(parseTimeToSeconds('20'), null);
  assert.equal(parseTimeToSeconds('1a:20'), null);
});

test('formatSecondsToTime keeps compact display formatting', () => {
  assert.equal(formatSecondsToTime(null), '');
  assert.equal(formatSecondsToTime(0), '');
  assert.equal(formatSecondsToTime(1198), '19:58');
  assert.equal(formatSecondsToTime(5400), '1:30:00');
  assert.equal(formatSecondsToTime(5432), '1:30:32');
});

test('getMergedPBsForAnalysis prefers positive profile PB values', () => {
  const profile = {
    pbs: {
      '5k': 1500,
      '10k': null,
      '21k': 7200,
      '42k': 0,
    },
    height: null,
    weight: null,
    maxHeartRate: null,
    lthr: null,
    updatedAt: '2026-06-04T08:00:00.000Z',
  };

  assert.deepEqual(
    getMergedPBsForAnalysis(profile, { '5k': 1600, '10k': 3400 }),
    {
      '5k': 1500,
      '10k': 3400,
      '21k': 7200,
    }
  );
  assert.equal(getMergedPBsForAnalysis(null, null), null);
});
