#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const DEFAULT_OUTPUT = 'public/data/activities.json';
const DEFAULT_PER_PAGE = 200;

const originalEnvKeys = new Set(Object.keys(process.env));

function parseArgs(argv) {
  const options = {
    dryRun: false,
    maxPages: Number.POSITIVE_INFINITY,
    output: DEFAULT_OUTPUT,
    perPage: DEFAULT_PER_PAGE,
    recentDays: null,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--max-pages=')) {
      options.maxPages = parsePositiveInteger(arg.slice('--max-pages='.length), '--max-pages');
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg.startsWith('--per-page=')) {
      options.perPage = parsePositiveInteger(arg.slice('--per-page='.length), '--per-page');
    } else if (arg.startsWith('--recent-days=')) {
      options.recentDays = parsePositiveInteger(arg.slice('--recent-days='.length), '--recent-days');
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parsePositiveInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return parsed;
}

async function loadEnv() {
  await loadEnvFile('.env');
  await loadEnvFile('.env.local');
}

async function loadEnvFile(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    if (originalEnvKeys.has(key)) continue;

    process.env[key] = unquoteEnvValue(match[2].trim());
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function getRequiredEnv() {
  const clientId = process.env.STRAVA_CLIENT_ID || process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;
  const accessToken = process.env.STRAVA_ACCESS_TOKEN;

  if (accessToken) {
    return { accessToken, clientId, clientSecret, refreshToken };
  }

  const missing = [];
  if (!clientId) missing.push('NEXT_PUBLIC_STRAVA_CLIENT_ID or STRAVA_CLIENT_ID');
  if (!clientSecret) missing.push('STRAVA_CLIENT_SECRET');
  if (!refreshToken) missing.push('STRAVA_REFRESH_TOKEN');

  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')}. Add them to .env.local or export them before running this script.`
    );
  }

  return { clientId, clientSecret, refreshToken, accessToken: null };
}

async function getAccessToken({ clientId, clientSecret, refreshToken, accessToken }) {
  if (accessToken) return accessToken;

  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: String(clientId),
      client_secret: String(clientSecret),
      grant_type: 'refresh_token',
      refresh_token: String(refreshToken),
    }),
  });

  if (!response.ok) {
    const body = await safeReadBody(response);
    throw new Error(`Failed to refresh Strava token (${response.status}): ${body}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Strava token response did not include access_token');
  }

  if (data.refresh_token && data.refresh_token !== refreshToken) {
    console.warn('Strava returned a new refresh token. Update STRAVA_REFRESH_TOKEN in .env.local.');
  }

  return data.access_token;
}

async function fetchActivities(accessToken, { maxPages, perPage, recentDays }) {
  const activities = [];
  const after = recentDays
    ? Math.floor((Date.now() - recentDays * 24 * 60 * 60 * 1000) / 1000)
    : null;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    if (after) url.searchParams.set('after', String(after));

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const body = await safeReadBody(response);
      const usage = response.headers.get('x-ratelimit-usage');
      const limit = response.headers.get('x-ratelimit-limit');
      const limitText = usage && limit ? ` rate ${usage}/${limit}` : '';
      throw new Error(`Failed to fetch activities page ${page} (${response.status}${limitText}): ${body}`);
    }

    const pageActivities = await response.json();
    if (!Array.isArray(pageActivities)) {
      throw new Error(`Unexpected Strava activities response on page ${page}`);
    }

    activities.push(...pageActivities.map(toActivityJsonRecord));
    console.log(`Fetched page ${page}: ${pageActivities.length} activities`);

    if (pageActivities.length < perPage) break;
  }

  return sortActivitiesNewestFirst(activities);
}

function toActivityJsonRecord(activity) {
  return {
    id: activity.id,
    name: activity.name,
    distance: activity.distance,
    moving_time: activity.moving_time,
    elapsed_time: activity.elapsed_time,
    total_elevation_gain: activity.total_elevation_gain,
    type: activity.type,
    sport_type: activity.sport_type,
    start_date: activity.start_date,
    start_date_local: activity.start_date_local,
    start_latlng: activity.start_latlng,
    end_latlng: activity.end_latlng,
    map: {
      summary_polyline: activity.map?.summary_polyline ?? null,
    },
    average_speed: activity.average_speed,
    max_speed: activity.max_speed,
    average_cadence: activity.average_cadence ?? null,
    average_temp: activity.average_temp ?? null,
    has_heartrate: activity.has_heartrate,
    average_heartrate: activity.average_heartrate ?? null,
    max_heartrate: activity.max_heartrate ?? null,
    calories: activity.calories ?? null,
    workout_type: activity.workout_type ?? null,
    gear_id: activity.gear_id ?? null,
  };
}

function sortActivitiesNewestFirst(activities) {
  return [...activities].sort((a, b) => {
    const left = new Date(a.start_date || a.start_date_local || 0).getTime();
    const right = new Date(b.start_date || b.start_date_local || 0).getTime();
    return right - left;
  });
}

async function readExistingActivities(outputPath) {
  try {
    const existing = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return Array.isArray(existing) ? existing : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function mergeActivities(existingActivities, fetchedActivities) {
  const byId = new Map();
  for (const activity of existingActivities) {
    if (activity?.id) byId.set(activity.id, activity);
  }
  for (const activity of fetchedActivities) {
    if (activity?.id) byId.set(activity.id, activity);
  }
  return sortActivitiesNewestFirst([...byId.values()]);
}

async function writeJsonAtomic(outputPath, activities) {
  const absoluteOutput = path.resolve(outputPath);
  const tempPath = `${absoluteOutput}.tmp`;
  const json = `${JSON.stringify(activities, null, 2)}\n`;

  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  await fs.writeFile(tempPath, json, 'utf8');
  await fs.rename(tempPath, absoluteOutput);
}

async function safeReadBody(response) {
  try {
    return await response.text();
  } catch {
    return '<unreadable response body>';
  }
}

function printHelp() {
  console.log(`
Update public/data/activities.json from Strava.

Usage:
  npm run data:update-activities
  npm run data:update-activities -- --recent-days=14
  npm run data:update-activities -- --max-pages=2 --dry-run

Environment:
  NEXT_PUBLIC_STRAVA_CLIENT_ID or STRAVA_CLIENT_ID
  STRAVA_CLIENT_SECRET
  STRAVA_REFRESH_TOKEN

Options:
  --recent-days=N   Fetch recent activities and merge them into the existing JSON.
  --max-pages=N     Stop after N Strava pages.
  --per-page=N      Strava page size. Default: ${DEFAULT_PER_PAGE}.
  --output=PATH     Output JSON path. Default: ${DEFAULT_OUTPUT}.
  --dry-run         Fetch and summarize without writing the file.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await loadEnv();
  const env = getRequiredEnv();
  const accessToken = await getAccessToken(env);
  const fetchedActivities = await fetchActivities(accessToken, options);
  const existingActivities = options.recentDays
    ? await readExistingActivities(options.output)
    : [];
  const outputActivities = options.recentDays
    ? mergeActivities(existingActivities, fetchedActivities)
    : fetchedActivities;

  console.log(
    options.recentDays
      ? `Merged ${fetchedActivities.length} fetched activities into ${existingActivities.length} existing records.`
      : `Fetched ${fetchedActivities.length} activities.`
  );

  if (options.dryRun) {
    console.log(`Dry run: ${options.output} was not changed.`);
    return;
  }

  await writeJsonAtomic(options.output, outputActivities);
  console.log(`Wrote ${outputActivities.length} activities to ${options.output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
