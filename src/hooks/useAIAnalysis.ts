'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityStream, StravaActivity } from '@/types';
import type { AIAnalysis } from '@/lib/ai';
import type { ActivityClassification, SimilarActivityStats, TrainingProfile } from '@/lib/trainingAnalysis';
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
  paceZones?: TrainingProfile['paceZones'];
  patterns?: unknown;
  physiologyMetrics?: unknown;
  recentLoad?: unknown;
  trainingLoad?: unknown;
  similarStats?: SimilarActivityStats | null;
  thermalStats?: unknown;
}

interface CachedAIAnalysis {
  analysis: AIAnalysis;
  streamAnalysis: StreamAnalysis | null;
  trainingStats: AITrainingStats | null;
  classification: ActivityClassification | null;
  isQuotaExceeded?: boolean;
  analysisSource?: 'claude-mcp' | 'kimi' | 'fallback';
  analysisError?: string;
}

interface AIAnalyzeResponse {
  analysis: AIAnalysis;
  streamAnalysis: StreamAnalysis | null;
  trainingProfile: AITrainingStats | null;
  classification: ActivityClassification | null;
  analysisSource: 'claude-mcp' | 'kimi' | 'fallback';
  analysisError?: string;
}

interface AIAnalysisViewState {
  inputKey: string | null;
  analysis: AIAnalysis | null;
  streamAnalysis: StreamAnalysis | null;
  trainingStats: AITrainingStats | null;
  classification: ActivityClassification | null;
  analysisSource?: CachedAIAnalysis['analysisSource'];
  fallbackReason: string;
}

const EMPTY_AI_ANALYSIS_STATE: AIAnalysisViewState = {
  inputKey: null,
  analysis: null,
  streamAnalysis: null,
  trainingStats: null,
  classification: null,
  analysisSource: undefined,
  fallbackReason: '',
};

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
      | 'average_temp'
      | 'description'
      | 'weather_context'
      | 'workout_type'
      | 'calories'
      | 'suffer_score'
      | 'splits_metric'
      | 'laps'
      | 'best_efforts'
    >
  >;

const AI_ANALYSIS_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const AI_ANALYSIS_QUOTA_TTL = 60 * 60 * 1000;
const AI_ANALYSIS_FALLBACK_TTL = 30 * 60 * 1000;
const AI_HISTORY_LIMIT = 1000;
const AI_ANALYSIS_REQUEST_TIMEOUT_MS = 60_000;
const aiAnalysisRequestsInFlight = new Map<string, Promise<AIAnalyzeResponse>>();

interface RefreshAnalysisOptions {
  force?: boolean;
}

function isTransientFallback(payload: CachedAIAnalysis, consentStatus: AIDataConsent): boolean {
  return consentStatus === 'accepted' && (
    payload.analysisSource === 'fallback' ||
    payload.analysis?.isFallback === true
  );
}

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
    average_temp: activity.average_temp,
    description: activity.description,
    weather_context: activity.weather_context,
    workout_type: activity.workout_type,
    calories: activity.calories,
    suffer_score: activity.suffer_score,
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

  const [viewState, setViewState] = useState<AIAnalysisViewState>(EMPTY_AI_ANALYSIS_STATE);
  const analysisGenerationRef = useRef(0);
  const loadedInputKeyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');

  const {
    analysis,
    streamAnalysis,
    trainingStats,
    classification,
    analysisSource,
    fallbackReason,
  } = viewState;

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
        i18n.language,
        payload.trainingStats?.paceZones,
        payload.streamAnalysis
      ),
    };
  }, [activity, i18n.language]);

  const applyAnalysisPayload = useCallback((payload: CachedAIAnalysis, inputKey: string) => {
    const normalizedPayload = normalizeCachedPayload(payload);
    setViewState({
      inputKey,
      analysis: normalizedPayload.analysis,
      streamAnalysis: normalizedPayload.streamAnalysis,
      trainingStats: normalizedPayload.trainingStats,
      classification: normalizedPayload.classification,
      analysisSource: normalizedPayload.analysisSource,
      fallbackReason: normalizedPayload.analysisError || '',
    });
  }, [normalizeCachedPayload]);

  const refreshAnalysis = useCallback(async (options: RefreshAnalysisOptions = {}) => {
    const force = options.force === true;
    if (!consentReady || consentStatus === 'unknown') {
      setLoading(false);
      return;
    }

    if (!enabled) {
      setLoading(false);
      setError('AUTH_REQUIRED');
      return;
    }

    const requestGeneration = ++analysisGenerationRef.current;
    setLoading(true);
    setRetrying(force);
    setError('');
    setViewState(EMPTY_AI_ANALYSIS_STATE);

    const profile = getUserProfile();
    const userProfilePBs = getMergedPBsForAnalysis(profile, null);
    const physique = profile ? { height: profile.height, weight: profile.weight } : undefined;

    let request: Promise<AIAnalyzeResponse> | undefined;
    try {
      if (force) {
        await clearCachedAIAnalysis(cacheKey);
      } else {
        request = aiAnalysisRequestsInFlight.get(cacheKey);
      }
      if (!request) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(
          () => controller.abort(),
          AI_ANALYSIS_REQUEST_TIMEOUT_MS
        );
        request = fetch('/api/ai/analyze', {
          method: 'POST',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity,
            streams,
            userProfilePBs,
            recentActivities: analysisHistoryActivities,
            locale: i18n.language,
            physique,
            maxHeartRate: profile?.maxHeartRate,
            lthr: profile?.lthr,
            allowThirdPartyAI: consentStatus === 'accepted',
          }),
        }).then(async (response) => {
          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || t('errors.aiAnalysisFailed', 'AI analysis failed'));
          }
          return response.json() as Promise<AIAnalyzeResponse>;
        }).finally(() => window.clearTimeout(timeoutId));
        aiAnalysisRequestsInFlight.set(cacheKey, request);
      }

      const data = await request;
      if (analysisGenerationRef.current !== requestGeneration) return;
      applyAnalysisPayload({
        analysis: data.analysis,
        streamAnalysis: data.streamAnalysis,
        trainingStats: data.trainingProfile,
        classification: data.classification,
        analysisSource: data.analysisSource,
        analysisError: data.analysisError,
      }, cacheKey);

      const payload = {
        analysis: data.analysis,
        streamAnalysis: data.streamAnalysis,
        trainingStats: data.trainingProfile,
        classification: data.classification,
        analysisSource: data.analysisSource,
        analysisError: data.analysisError,
      };

      await setCachedAIAnalysis(cacheKey, payload);
    } catch (err) {
      if (analysisGenerationRef.current !== requestGeneration) return;
      const message = err instanceof Error && err.name === 'AbortError'
        ? t('errors.aiAnalysisTimeout', 'AI 分析响应超时，请稍后重试')
        : err instanceof Error
          ? err.message
          : '';
      setError(message || t('errors.aiAnalysisFailed', 'AI analysis failed'));
    } finally {
      if (request && aiAnalysisRequestsInFlight.get(cacheKey) === request) {
        aiAnalysisRequestsInFlight.delete(cacheKey);
      }
      if (analysisGenerationRef.current === requestGeneration) {
        setLoading(false);
        setRetrying(false);
      }
    }
  }, [enabled, consentReady, consentStatus, activity, streams, analysisHistoryActivities, i18n.language, cacheKey, t, applyAnalysisPayload]);

  useEffect(() => {
    let cancelled = false;

    async function loadCachedAnalysis() {
      if (!consentReady || consentStatus === 'unknown') return;

      if (loadedInputKeyRef.current !== cacheKey) {
        loadedInputKeyRef.current = cacheKey;
        analysisGenerationRef.current += 1;
      }
      setError('');
      setRetrying(false);
      setViewState((current) => current.inputKey === cacheKey ? current : EMPTY_AI_ANALYSIS_STATE);

      const keys = [cacheKey, ...legacyCacheKeys];
      for (const key of keys) {
        const parsed = await getCachedAIAnalysis<CachedAIAnalysis>(key);

        if (cancelled) return;
        if (!parsed) continue;

        const maxAge = parsed.isQuotaExceeded
          ? AI_ANALYSIS_QUOTA_TTL
          : isTransientFallback(parsed, consentStatus)
            ? AI_ANALYSIS_FALLBACK_TTL
            : AI_ANALYSIS_CACHE_TTL;
        const generatedAt = parsed.analysis?.generatedAt ?? 0;
        if (generatedAt && Date.now() - generatedAt < maxAge) {
          applyAnalysisPayload(parsed, cacheKey);
          setLoading(false);
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
    analysisGenerationRef.current += 1;
    setAIDataConsent('accepted');
    setConsentStatus('accepted');
    setViewState(EMPTY_AI_ANALYSIS_STATE);
    setError('');
  }, []);

  const declineAIConsent = useCallback(() => {
    analysisGenerationRef.current += 1;
    setAIDataConsent('declined');
    setConsentStatus('declined');
    setViewState(EMPTY_AI_ANALYSIS_STATE);
    setError('');
  }, []);

  const errorMessage = typeof error === 'string' ? error : '';
  const isQuotaError = errorMessage.includes('配额') || errorMessage.includes('quota');
  const isAuthError =
    errorMessage.includes('Unauthorized') ||
    errorMessage.includes('AUTH_REQUIRED') ||
    errorMessage.includes('401') ||
    errorMessage.includes('登录') ||
    errorMessage.toLowerCase().includes('auth');

  const hasSettledAnalysis = viewState.inputKey === cacheKey && Boolean(viewState.analysis);
  const isSettling = !hasSettledAnalysis && !errorMessage && !(!consentReady || consentStatus === 'unknown');

  return {
    analysis: hasSettledAnalysis ? analysis : null,
    streamAnalysis: hasSettledAnalysis ? streamAnalysis : null,
    trainingStats: hasSettledAnalysis ? trainingStats : null,
    classification: hasSettledAnalysis ? classification : null,
    loading: loading || isSettling,
    retrying,
    error: errorMessage,
    isQuotaError,
    isAuthError,
    analysisSource,
    fallbackReason: hasSettledAnalysis ? fallbackReason : '',
    consentStatus,
    consentReady,
    consentRequired: consentReady && consentStatus === 'unknown',
    acceptAIConsent,
    declineAIConsent,
    refreshAnalysis,
  };
}
