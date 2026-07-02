'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityStream, StravaActivity } from '@/types';
import type { AIAnalysis } from '@/lib/ai';
import type { ActivityClassification, SimilarActivityStats } from '@/lib/trainingAnalysis';
import type { StreamAnalysis } from '@/lib/streamAnalysis';
import { getMergedPBsForAnalysis, getUserProfile } from '@/lib/userProfile';
import { clearCachedAIAnalysis, getCachedAIAnalysis, setCachedAIAnalysis } from '@/lib/aiAnalysisCache';
import { getAIAnalysisCacheKey, getLegacyAIAnalysisCacheKeys } from '@/lib/aiAnalysisCacheKey';
import { normalizeAIAnalysisForDisplay } from '@/lib/aiResponseParser';
import { useActivitiesStore } from '@/store/activities';
import {
  getAIDataConsent,
  setAIDataConsent,
  type AIDataConsent,
} from '@/lib/aiConsent';

interface AITrainingStats {
  totalRunsAnalyzed: number;
  estimatedPBs?: unknown;
  paceZones?: unknown;
  patterns?: unknown;
  physiologyMetrics?: unknown;
  similarStats?: SimilarActivityStats | null;
}

interface CachedAIAnalysis {
  analysis: AIAnalysis;
  streamAnalysis: StreamAnalysis | null;
  trainingStats: AITrainingStats | null;
  classification: ActivityClassification | null;
  isQuotaExceeded?: boolean;
  analysisSource?: 'claude-mcp' | 'kimi' | 'fallback';
}

interface AIAnalyzeResponse {
  analysis: AIAnalysis;
  streamAnalysis: StreamAnalysis | null;
  trainingProfile: AITrainingStats | null;
  classification: ActivityClassification | null;
  analysisSource: 'claude-mcp' | 'kimi' | 'fallback';
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
      | 'laps'
      | 'best_efforts'
    >
  >;

const AI_ANALYSIS_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const AI_ANALYSIS_QUOTA_TTL = 60 * 60 * 1000;
const AI_HISTORY_LIMIT = 1000;
const aiAnalysisRequestsInFlight = new Map<string, Promise<AIAnalyzeResponse>>();

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
    laps: activity.laps,
    best_efforts: activity.best_efforts,
  };
}

export function useAIAnalysis(
  activity: StravaActivity,
  streams: Record<string, ActivityStream> | null,
  enabled = true
) {
  const { t, i18n } = useTranslation();
  const { activities } = useActivitiesStore();
  const [consentStatus, setConsentStatus] = useState<AIDataConsent>('unknown');
  const [consentReady, setConsentReady] = useState(false);
  const analysisMode: 'kimi' | 'fallback' = consentStatus === 'accepted' ? 'kimi' : 'fallback';
  const analysisHistoryActivities = useMemo(
    () =>
      activities
        .filter((a) => a.type === 'Run' || a.type === 'TrailRun' || a.sport_type === 'Run')
        .slice(0, AI_HISTORY_LIMIT)
        .map(toAIHistoryActivity),
    [activities]
  );
  const cacheKey = useMemo(
    () => {
      const cacheInput = {
        activity,
        streams,
        historyActivities: analysisHistoryActivities,
        locale: i18n.language,
        profile: getUserProfile(),
        analysisMode,
      };
      return getAIAnalysisCacheKey(cacheInput);
    },
    [activity, streams, analysisHistoryActivities, i18n.language, analysisMode]
  );
  const legacyCacheKeys = useMemo(
    () => {
      const cacheInput = {
        activity,
        streams,
        historyActivities: analysisHistoryActivities,
        locale: i18n.language,
        profile: getUserProfile(),
      };
      return consentStatus === 'accepted' ? getLegacyAIAnalysisCacheKeys(cacheInput) : [];
    },
    [activity, streams, analysisHistoryActivities, i18n.language, consentStatus]
  );

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [streamAnalysis, setStreamAnalysis] = useState<StreamAnalysis | null>(null);
  const [trainingStats, setTrainingStats] = useState<AITrainingStats | null>(null);
  const [classification, setClassification] = useState<ActivityClassification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysisSource, setAnalysisSource] = useState<CachedAIAnalysis['analysisSource']>();

  useEffect(() => {
    setConsentStatus(getAIDataConsent());
    setConsentReady(true);
  }, []);

  const normalizeCachedPayload = useCallback((payload: CachedAIAnalysis): CachedAIAnalysis => {
    if (!payload.analysis || !payload.classification) return payload;

    return {
      ...payload,
      analysis: normalizeAIAnalysisForDisplay(
        payload.analysis,
        activity,
        payload.classification,
        i18n.language
      ),
    };
  }, [activity, i18n.language]);

  const applyAnalysisPayload = useCallback((payload: CachedAIAnalysis) => {
    const normalizedPayload = normalizeCachedPayload(payload);
    setAnalysis(normalizedPayload.analysis);
    setStreamAnalysis(normalizedPayload.streamAnalysis);
    setTrainingStats(normalizedPayload.trainingStats);
    setClassification(normalizedPayload.classification);
    setAnalysisSource(normalizedPayload.analysisSource);
  }, [normalizeCachedPayload]);

  const refreshAnalysis = useCallback(async () => {
    if (!consentReady || consentStatus === 'unknown') {
      setLoading(false);
      return;
    }

    if (!enabled) {
      setLoading(false);
      setError('AUTH_REQUIRED');
      return;
    }

    setLoading(true);
    setError('');

    const profile = getUserProfile();
    const userProfilePBs = getMergedPBsForAnalysis(profile, null);
    const physique = profile ? { height: profile.height, weight: profile.weight } : undefined;

    try {
      let request = aiAnalysisRequestsInFlight.get(cacheKey);
      if (!request) {
        request = fetch('/api/ai/analyze', {
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
            allowThirdPartyAI: consentStatus === 'accepted',
          }),
        }).then(async (response) => {
          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || t('errors.aiAnalysisFailed', 'AI analysis failed'));
          }

          return response.json() as Promise<AIAnalyzeResponse>;
        });
        aiAnalysisRequestsInFlight.set(cacheKey, request);
      }

      const data = await request;
      applyAnalysisPayload({
        analysis: data.analysis,
        streamAnalysis: data.streamAnalysis,
        trainingStats: data.trainingProfile,
        classification: data.classification,
        analysisSource: data.analysisSource,
      });

      await setCachedAIAnalysis(cacheKey, {
        analysis: data.analysis,
        streamAnalysis: data.streamAnalysis,
        trainingStats: data.trainingProfile,
        classification: data.classification,
        analysisSource: data.analysisSource,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message || t('errors.aiAnalysisFailed', 'AI analysis failed'));
    } finally {
      aiAnalysisRequestsInFlight.delete(cacheKey);
      setLoading(false);
    }
  }, [enabled, consentReady, consentStatus, activity, streams, analysisHistoryActivities, i18n.language, cacheKey, t, applyAnalysisPayload]);

  useEffect(() => {
    let cancelled = false;

    async function loadCachedAnalysis() {
      if (!consentReady || consentStatus === 'unknown') return;

      const keys = [cacheKey, ...legacyCacheKeys];
      for (const key of keys) {
        const parsed = await getCachedAIAnalysis<CachedAIAnalysis>(key);

        if (cancelled) return;
        if (!parsed) continue;

        const maxAge = parsed.isQuotaExceeded ? AI_ANALYSIS_QUOTA_TTL : AI_ANALYSIS_CACHE_TTL;
        const generatedAt = parsed.analysis?.generatedAt ?? 0;
        if (generatedAt && Date.now() - generatedAt < maxAge) {
          applyAnalysisPayload(parsed);
          if (parsed.isQuotaExceeded) {
            setError('AI 分析配额已用完，请稍后再试。已显示系统生成的基础分析。');
          }
          return;
        }

        await clearCachedAIAnalysis(key);
      }

      if (!cancelled) {
        if (!enabled) {
          setLoading(false);
          setError('AUTH_REQUIRED');
          return;
        }

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
  }, [enabled, consentReady, consentStatus, cacheKey, legacyCacheKeys, refreshAnalysis, applyAnalysisPayload]);

  const acceptAIConsent = useCallback(() => {
    setAIDataConsent('accepted');
    setConsentStatus('accepted');
    setAnalysis(null);
    setError('');
  }, []);

  const declineAIConsent = useCallback(() => {
    setAIDataConsent('declined');
    setConsentStatus('declined');
    setAnalysis(null);
    setError('');
  }, []);

  const isQuotaError = error?.includes('配额') || error?.includes('quota');
  const isAuthError =
    error?.includes('Unauthorized') ||
    error?.includes('AUTH_REQUIRED') ||
    error?.includes('401') ||
    error?.includes('登录') ||
    error?.toLowerCase().includes('auth');

  return {
    analysis,
    streamAnalysis,
    trainingStats,
    classification,
    loading,
    error,
    isQuotaError,
    isAuthError,
    analysisSource,
    consentStatus,
    consentReady,
    consentRequired: consentReady && consentStatus === 'unknown',
    acceptAIConsent,
    declineAIConsent,
    refreshAnalysis,
  };
}
