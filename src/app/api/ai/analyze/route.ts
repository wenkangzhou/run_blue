import { NextRequest, NextResponse } from 'next/server';
import { analyzeActivity } from '@/lib/ai';
import { analyzeTrainingHistory, classifyActivity } from '@/lib/trainingAnalysis';
import { analyzeActivityStreams, formatStreamAnalysisForPrompt } from '@/lib/streamAnalysis';
import { ActivityStream, StravaActivity } from '@/types';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

interface AnalyzeRequestBody {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
  userProfilePBs?: Record<string, number> | null;
  recentActivities?: StravaActivity[];
  locale?: string;
  physique?: { height?: number | null; weight?: number | null };
  lthr?: number | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = parseCookies(cookieHeader);
    const accessToken = cookies['access_token'];
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = (await request.json()) as AnalyzeRequestBody;
    const { activity, streams, userProfilePBs, recentActivities, locale, physique, lthr } = body;

    if (!activity) {
      return NextResponse.json({ error: 'Activity data required' }, { status: 400 });
    }

    // Fetch full activity details (includes splits_metric and best_efforts)
    let currentActivity = activity;
    try {
      const fullActivity = await fetchActivityDetails(accessToken, activity.id);
      if (fullActivity) {
        currentActivity = fullActivity;
      }
    } catch {
      // Continue with the provided activity when optional detail enrichment fails.
    }

    // Extract PBs from current activity's best_efforts if available
    const activityPBs = extractPBsFromActivity(currentActivity);
    
    // Merge priority: user profile PBs > activity PBs
    const mergedPBs = { ...activityPBs, ...userProfilePBs };
    
    // Use frontend-provided activities to avoid extra Strava API calls
    // Fallback to fetching from API if not provided (shouldn't happen in normal flow)
    const historyActivities = recentActivities && recentActivities.length > 0
      ? recentActivities
      : await fetchRecentActivities(accessToken, 200);

    // Build training profile from history (using merged PBs)
    const trainingProfile = analyzeTrainingHistory(
      historyActivities,
      currentActivity,
      mergedPBs
    );
    
    // Classify the current activity
    const classification = classifyActivity(currentActivity);
    
    // Stream analysis: segment HR + pace by km
    const avgPaceSecPerKm = activity.moving_time / activity.distance * 1000;
    const streamAnalysisRaw = lthr
      ? analyzeActivityStreams(streams, lthr, avgPaceSecPerKm, classification.isRace)
      : null;
    const streamAnalysisText = streamAnalysisRaw
      ? formatStreamAnalysisForPrompt(streamAnalysisRaw, lthr!, locale)
      : undefined;

    // Call AI analysis with training profile
    const analysis = await analyzeActivity(currentActivity, streams, trainingProfile, locale, physique, lthr, streamAnalysisText);

    return NextResponse.json({ 
      analysis,
      streamAnalysis: streamAnalysisRaw,
      trainingProfile: {
        totalRunsAnalyzed: trainingProfile.totalRunsAnalyzed,
        estimatedPBs: trainingProfile.estimatedPBs,
        paceZones: trainingProfile.paceZones,
        patterns: trainingProfile.patterns,
        physiologyMetrics: trainingProfile.physiologyMetrics,
      },
      classification,
      officialPBs: mergedPBs,
    });
  } catch (error) {
    console.error('AI analyze error:', error);
    const msg = getErrorMessage(error, '');
    const isQuota = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('exceeded');
    if (isQuota) {
      return NextResponse.json(
        { error: 'AI 分析配额已用完，请稍后再试', code: 'QUOTA_EXCEEDED' },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: msg || 'Analysis failed' },
      { status: 500 }
    );
  }
}

/**
 * Extract PBs from activity's best_efforts
 * This is more reliable than athlete stats API which requires special permissions
 */
function extractPBsFromActivity(activity: StravaActivity): Record<string, number> | null {
  if (!activity.best_efforts || activity.best_efforts.length === 0) {
    return null;
  }
  
  const pbs: Record<string, number> = {};
  
  for (const effort of activity.best_efforts) {
    const name = effort.name?.toLowerCase() || '';
    const time = effort.elapsed_time;
    
    // Map effort names to our standard format
    if (name.includes('400m')) pbs['400m'] = time;
    else if (name.includes('1/2 mile') || name.includes('half mile')) pbs['0.8k'] = time; // 0.8km
    else if (name.includes('1k') || name.includes('1 kilometer')) pbs['1k'] = time;
    else if (name.includes('1 mile')) pbs['1.6k'] = time; // 1.6km
    else if (name.includes('2 mile')) pbs['3.2k'] = time; // 3.2km  
    else if (name.includes('5k') || name.includes('5 kilometer')) pbs['5k'] = time;
    else if (name.includes('10k') || name.includes('10 kilometer')) pbs['10k'] = time;
    else if (name.includes('15k') || name.includes('15 kilometer')) pbs['15k'] = time;
    else if (name.includes('10 mile')) pbs['16k'] = time; // 16km
    else if (name.includes('20k') || name.includes('20 kilometer')) pbs['20k'] = time;
    else if (name.includes('half') || name.includes('21k') || name.includes('21.1k')) pbs['21k'] = time;
    else if (name.includes('30k') || name.includes('30 kilometer')) pbs['30k'] = time;
    else if (name.includes('marathon') || name.includes('42k') || name.includes('42.2k')) pbs['42k'] = time;
  }
  
  return Object.keys(pbs).length > 0 ? pbs : null;
}

/**
 * Fetch full activity details including splits and best_efforts
 */
async function fetchActivityDetails(
  accessToken: string,
  activityId: number
): Promise<StravaActivity | null> {
  try {
    const response = await fetch(
      `${STRAVA_API_BASE}/activities/${activityId}?include_all_efforts=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch recent activities from Strava API
 */
async function fetchRecentActivities(
  accessToken: string,
  maxActivities: number = 200
): Promise<StravaActivity[]> {
  const activities: StravaActivity[] = [];
  const perPage = 100;
  const maxPages = Math.ceil(maxActivities / perPage);
  
  try {
    for (let page = 1; page <= maxPages; page++) {
      const response = await fetch(
        `${STRAVA_API_BASE}/athlete/activities?page=${page}&per_page=${perPage}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('Strava rate limited during AI analysis');
          break;
        }
        throw new Error(`Failed to fetch activities: ${response.status}`);
      }

      const pageActivities = (await response.json()) as unknown;
      
      if (!Array.isArray(pageActivities) || pageActivities.length === 0) {
        break;
      }

      // Filter to runs only
      const runs = pageActivities.filter(
        (a): a is StravaActivity =>
          typeof a === 'object' &&
          a !== null &&
          ('type' in a || 'sport_type' in a) &&
          ((a as Partial<StravaActivity>).type === 'Run' || (a as Partial<StravaActivity>).type === 'TrailRun')
      );
      
      activities.push(...runs);

      if (pageActivities.length < perPage) {
        break;
      }
    }
  } catch (error) {
    console.error('Error fetching activities for AI analysis:', error);
  }

  return activities;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = decodeURIComponent(rest.join('='));
    }
  });
  
  return cookies;
}
