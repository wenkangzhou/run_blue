'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityStream, StravaActivity } from '@/types';
import type { AIAnalysis } from '@/lib/ai';
import type { ActivityClassification } from '@/lib/trainingAnalysis';
import type { StreamAnalysis } from '@/lib/streamAnalysis';
import { getMergedPBsForAnalysis, getUserProfile } from '@/lib/userProfile';
import { clearCachedAIAnalysis, getCachedAIAnalysis, setCachedAIAnalysis } from '@/lib/aiAnalysisCache';
import { getAIAnalysisCacheKey } from '@/lib/aiAnalysisCacheKey';
import { useActivitiesStore } from '@/store/activities';

interface AITrainingStats {
  totalRunsAnalyzed: number;
  estimatedPBs?: unknown;
  paceZones?: unknown;
  patterns?: unknown;
  physiologyMetrics?: unknown;
}

interface CachedAIAnalysis {
  analysis: AIAnalysis;
  streamAnalysis: StreamAnalysis | null;
  trainingStats: AITrainingStats | null;
  classification: ActivityClassification | null;
  isQuotaExceeded?: boolean;
}

interface AIAnalyzeResponse {
  analysis: AIAnalysis;
  streamAnalysis: StreamAnalysis | null;
  trainingProfile: AITrainingStats | null;
  classification: ActivityClassification | null;
}

type AIHistoryActivity = Pick<
  StravaActivity,
  | 'id'
  | 'name'
  | 'distance'
  | 'moving_time'
  | 'elapsed_time'
  | 'total_elevation_gain'
  | 'type'
  | 'sport_type'
  | 'start_date'
  | 'start_date_local'
  | 'average_speed'
  | 'max_speed'
  | 'has_heartrate'
> &
  Partial<
    Pick<
      StravaActivity,
      | 'average_heartrate'
      | 'max_heartrate'
      | 'workout_type'
      | 'calories'
      | 'splits_metric'
      | 'best_efforts'
    >
  >;

const AI_ANALYSIS_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const AI_ANALYSIS_QUOTA_TTL = 60 * 60 * 1000;
const AI_HISTORY_LIMIT = 1000;

function toAIHistoryActivity(activity: StravaActivity): AIHistoryActivity {
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
    average_speed: activity.average_speed,
    max_speed: activity.max_speed,
    has_heartrate: activity.has_heartrate,
    average_heartrate: activity.average_heartrate,
    max_heartrate: activity.max_heartrate,
    workout_type: activity.workout_type,
    calories: activity.calories,
    splits_metric: activity.splits_metric,
    best_efforts: activity.best_efforts,
  };
}

export function useAIAnalysis(
  activity: StravaActivity,
  streams: Record<string, ActivityStream> | null
) {
  const { t, i18n } = useTranslation();
  const { activities } = useActivitiesStore();
  const analysisHistoryActivities = useMemo(
    () =>
      activities
        .filter((a) => a.type === 'Run' || a.type === 'TrailRun' || a.sport_type === 'Run')
        .slice(0, AI_HISTORY_LIMIT)
        .map(toAIHistoryActivity),
    [activities]
  );
  const cacheKey = useMemo(
    () =>
      getAIAnalysisCacheKey({
        activity,
        streams,
        historyActivities: analysisHistoryActivities,
        locale: i18n.language,
        profile: getUserProfile(),
      }),
    [activity, streams, analysisHistoryActivities, i18n.language]
  );

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [streamAnalysis, setStreamAnalysis] = useState<StreamAnalysis | null>(null);
  const [trainingStats, setTrainingStats] = useState<AITrainingStats | null>(null);
  const [classification, setClassification] = useState<ActivityClassification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refreshAnalysis = useCallback(async () => {
    setLoading(true);
    setError('');

    const profile = getUserProfile();
    const userProfilePBs = getMergedPBsForAnalysis(profile, null);
    const physique = profile ? { height: profile.height, weight: profile.weight } : undefined;

    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity,
          streams,
          userProfilePBs,
          recentActivities: analysisHistoryActivities,
          locale: i18n.language,
          physique,
          lthr: profile?.lthr,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || t('errors.aiAnalysisFailed', 'AI analysis failed'));
      }

      const data = (await response.json()) as AIAnalyzeResponse;
      setAnalysis(data.analysis);
      setStreamAnalysis(data.streamAnalysis);
      setTrainingStats(data.trainingProfile);
      setClassification(data.classification);

      await setCachedAIAnalysis(cacheKey, {
        analysis: data.analysis,
        streamAnalysis: data.streamAnalysis,
        trainingStats: data.trainingProfile,
        classification: data.classification,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message || t('errors.aiAnalysisFailed', 'AI analysis failed'));
    } finally {
      setLoading(false);
    }
  }, [activity, streams, analysisHistoryActivities, i18n.language, cacheKey, t]);

  useEffect(() => {
    let cancelled = false;

    async function loadCachedAnalysis() {
      const parsed = await getCachedAIAnalysis<CachedAIAnalysis>(cacheKey);

      if (cancelled) return;

      if (parsed) {
        const maxAge = parsed.isQuotaExceeded ? AI_ANALYSIS_QUOTA_TTL : AI_ANALYSIS_CACHE_TTL;
        const generatedAt = parsed.analysis?.generatedAt ?? 0;
        if (generatedAt && Date.now() - generatedAt < maxAge) {
          setAnalysis(parsed.analysis);
          setStreamAnalysis(parsed.streamAnalysis);
          setTrainingStats(parsed.trainingStats);
          setClassification(parsed.classification);
          if (parsed.isQuotaExceeded) {
            setError('AI 分析配额已用完，请稍后再试。已显示系统生成的基础分析。');
          }
          return;
        }

        await clearCachedAIAnalysis(cacheKey);
      }

      if (!cancelled) {
        refreshAnalysis();
      }
    }

    loadCachedAnalysis().catch(() => {
      if (!cancelled) {
        refreshAnalysis();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, refreshAnalysis]);

  const isQuotaError = error?.includes('配额') || error?.includes('quota');

  return {
    analysis,
    streamAnalysis,
    trainingStats,
    classification,
    loading,
    error,
    isQuotaError,
    refreshAnalysis,
  };
}
