import { NextRequest, NextResponse } from 'next/server';
import { analyzeActivity } from '@/lib/ai';
import { analyzeTrainingHistory, classifyActivity } from '@/lib/trainingAnalysis';
import { analyzeActivityStreams, formatStreamAnalysisForPrompt } from '@/lib/streamAnalysis';
import { StravaActivity } from '@/types';
import { parseCookieHeader } from '@/lib/authCookies';
import { parseAIAnalyzeRequest, type AnalysisHistoryActivity } from '@/lib/aiAnalyzeRequest';
import { analyzeActivityViaClaudeStravaMcp } from '@/lib/claudeStravaAnalysis';
import { generateFallbackAnalysis } from '@/lib/aiFallbackAnalysis';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = parseCookieHeader(cookieHeader);
    const accessToken = cookies['access_token'];
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = parseAIAnalyzeRequest(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const {
      activity,
      streams,
      userProfilePBs,
      recentActivities,
      locale,
      physique,
      lthr,
      allowThirdPartyAI,
    } = parsed.payload;

    // Fetch full activity details only when the client sent a lightweight list item.
    let currentActivity = activity;
    if (!hasActivityDetailFields(activity)) {
      try {
        const fullActivity = await fetchActivityDetails(accessToken, activity.id);
        if (fullActivity) {
          currentActivity = fullActivity;
        }
      } catch {
        // Continue with the provided activity when optional detail enrichment fails.
      }
    }

    // Extract PBs from current activity's best_efforts if available
    const activityPBs = extractPBsFromActivity(currentActivity);
    
    // Merge priority: user profile PBs > activity PBs
    const mergedPBs = { ...activityPBs, ...userProfilePBs };
    
    // Use frontend-provided cached history only. The analysis route should not
    // quietly fetch activity pages because that bypasses the app-level sync cache.
    const historyActivities = normalizeHistoryActivities(recentActivities);

    // Build training profile from history (using merged PBs)
    const trainingProfile = analyzeTrainingHistory(
      historyActivities,
      currentActivity,
      mergedPBs,
      lthr
    );
    
    // Classify the current activity
    const classification = classifyActivity(
      currentActivity,
      trainingProfile.paceZones,
      trainingProfile.estimatedPBs.reliability,
      lthr
    );
    
    // Stream analysis: segment HR + pace by km
    const avgPaceSecPerKm = currentActivity.moving_time / currentActivity.distance * 1000;
    const streamAnalysisRaw = lthr
      ? analyzeActivityStreams(streams, lthr, avgPaceSecPerKm, classification.isRace)
      : null;
    const streamAnalysisText = streamAnalysisRaw
      ? formatStreamAnalysisForPrompt(streamAnalysisRaw, lthr!, locale)
      : undefined;

    let analysisSource: 'claude-mcp' | 'kimi' | 'fallback' = 'kimi';
    let analysis;
    if (!allowThirdPartyAI) {
      analysis = generateFallbackAnalysis(currentActivity, trainingProfile, classification, locale);
      analysisSource = 'fallback';
    } else if (process.env.STRAVA_AI_PROVIDER === 'claude-mcp') {
      try {
        analysis = await analyzeActivityViaClaudeStravaMcp({
          activityId: currentActivity.id,
          locale,
          userProfilePBs,
          lthr,
        });
        analysisSource = 'claude-mcp';
      } catch (error) {
        console.error('[AI] Claude Strava MCP analysis failed:', error);
        analysis = generateFallbackAnalysis(currentActivity, trainingProfile, classification, locale);
        analysisSource = 'fallback';
      }
    } else {
      analysis = await analyzeActivity(currentActivity, streams, trainingProfile, locale, physique, lthr, streamAnalysisText);
      analysisSource = analysis.isFallback ? 'fallback' : 'kimi';
    }

    return NextResponse.json({ 
      analysis,
      analysisSource,
      streamAnalysis: streamAnalysisRaw,
      trainingProfile: {
        totalRunsAnalyzed: trainingProfile.totalRunsAnalyzed,
        estimatedPBs: trainingProfile.estimatedPBs,
        paceZones: trainingProfile.paceZones,
        patterns: trainingProfile.patterns,
        physiologyMetrics: trainingProfile.physiologyMetrics,
        similarStats: trainingProfile.similarStats,
        thermalStats: trainingProfile.thermalStats,
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

function hasActivityDetailFields(activity: StravaActivity): boolean {
  return (
    activity.splits_metric !== undefined ||
    activity.laps !== undefined ||
    activity.best_efforts !== undefined ||
    activity.segment_efforts !== undefined
  );
}

function normalizeHistoryActivities(activities?: AnalysisHistoryActivity[]): StravaActivity[] {
  if (!Array.isArray(activities)) return [];

  return activities.filter((activity): activity is AnalysisHistoryActivity => {
    return (
      typeof activity?.id === 'number' &&
      typeof activity.name === 'string' &&
      typeof activity.distance === 'number' &&
      typeof activity.moving_time === 'number' &&
      typeof activity.type === 'string' &&
      typeof activity.sport_type === 'string' &&
      typeof activity.start_date === 'string'
    );
  }) as StravaActivity[];
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
