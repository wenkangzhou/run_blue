import { NextRequest, NextResponse } from 'next/server';
import { analyzeActivity } from '@/lib/ai';
import { analyzeTrainingHistory, classifyActivity } from '@/lib/trainingAnalysis';
import { StravaActivity } from '@/types';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

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
    const body = await request.json();
    const { activity, streams } = body as {
      activity: StravaActivity;
      streams: Record<string, any> | null;
    };

    if (!activity) {
      return NextResponse.json({ error: 'Activity data required' }, { status: 400 });
    }

    // Fetch full activity details (includes splits_metric) for current activity
    // The activity from client might not have splits data
    let currentActivity = activity;
    try {
      const fullActivity = await fetchActivityDetails(accessToken, activity.id);
      if (fullActivity) {
        currentActivity = fullActivity;
      }
    } catch (e) {
      console.log('Could not fetch full activity details, using provided data');
    }

    // Fetch user's activities for training profile analysis
    const recentActivities = await fetchRecentActivities(accessToken, 200);
    
    // Build training profile from history (using current activity with splits)
    const trainingProfile = analyzeTrainingHistory(recentActivities, currentActivity);
    
    // Classify the current activity
    const classification = classifyActivity(currentActivity);
    
    // Call AI analysis with training profile
    const analysis = await analyzeActivity(currentActivity, streams, trainingProfile);

    return NextResponse.json({ 
      analysis,
      trainingProfile: {
        totalRunsAnalyzed: trainingProfile.totalRunsAnalyzed,
        estimatedPBs: trainingProfile.estimatedPBs,
        paceZones: trainingProfile.paceZones,
        patterns: trainingProfile.patterns,
      },
      classification,
    });
  } catch (error: any) {
    console.error('AI analyze error:', error);
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    );
  }
}

/**
 * Fetch full activity details including splits
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
  } catch (error) {
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

      const pageActivities = await response.json();
      
      if (!Array.isArray(pageActivities) || pageActivities.length === 0) {
        break;
      }

      // Filter to runs only
      const runs = pageActivities.filter(
        (a: any) => a.type === 'Run' || a.type === 'TrailRun'
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
