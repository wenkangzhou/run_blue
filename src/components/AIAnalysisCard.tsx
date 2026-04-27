'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StravaActivity } from '@/types';
import { AIAnalysis } from '@/lib/ai';
import { ActivityClassification } from '@/lib/trainingAnalysis';
import {
  Sparkles,
  RefreshCw,
  Clock,
  Zap,
  TrendingUp,
  Target,
  Activity,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  Trophy,
  Medal,
} from 'lucide-react';
import { getUserProfile, getMergedPBsForAnalysis } from '@/lib/userProfile';
import { useActivitiesStore } from '@/store/activities';

interface AIAnalysisCardProps {
  activity: StravaActivity;
  streams: Record<string, any> | null;
}

const intensityColors: Record<string, { color: string; bg: string }> = {
  easy: { color: 'text-green-600', bg: 'bg-green-100' },
  moderate: { color: 'text-blue-600', bg: 'bg-blue-100' },
  hard: { color: 'text-orange-600', bg: 'bg-orange-100' },
  extreme: { color: 'text-red-600', bg: 'bg-red-100' },
};

const zoneColors: Record<string, string> = {
  E: 'text-green-600',
  M: 'text-blue-600',
  T: 'text-orange-600',
  I: 'text-red-600',
  R: 'text-purple-600',
  unknown: 'text-gray-600',
};

export function AIAnalysisCard({ activity, streams }: AIAnalysisCardProps) {
  const { t, i18n } = useTranslation();
  const { activities } = useActivitiesStore();
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [trainingStats, setTrainingStats] = useState<any>(null);
  const [classification, setClassification] = useState<ActivityClassification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const cachedKey = `ai_analysis_v2_${activity.id}`;
    const cached = localStorage.getItem(cachedKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.analysis?.generatedAt < 7 * 24 * 60 * 60 * 1000) {
          setAnalysis(parsed.analysis);
          setTrainingStats(parsed.trainingStats);
          setClassification(parsed.classification);
          return;
        }
      } catch {
        // Invalid cache
      }
    }

    fetchAnalysis();
  }, [activity.id]);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError('');

    const profile = getUserProfile();
    const userProfilePBs = getMergedPBsForAnalysis(profile, null);

    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity, streams, userProfilePBs, recentActivities: activities, locale: i18n.language }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || t('errors.aiAnalysisFailed', 'AI analysis failed'));
      }
      
      const data = await response.json();
      setAnalysis(data.analysis);
      setTrainingStats(data.trainingProfile);
      setClassification(data.classification);
      
      localStorage.setItem(`ai_analysis_v2_${activity.id}`, JSON.stringify({
        analysis: data.analysis,
        trainingStats: data.trainingProfile,
        classification: data.classification,
      }));
    } catch (err: any) {
      setError(err.message || t('errors.aiAnalysisFailed', 'AI analysis failed'));
    } finally {
      setLoading(false);
    }
  };

  const intensity = analysis?.intensity ? { ...intensityColors[analysis.intensity], label: t(`aiAnalysis.${analysis.intensity}`) } : null;
  const isRace = classification?.isRace;
  
  // Calculate pace zone based on best_efforts from this activity
  // This gives us the runner's actual capability from their recent best performances
  const currentPaceSecKm = activity.moving_time / activity.distance * 1000;
  
  // Try to get 5K PB from user profile first, then activity best_efforts, then fallback
  let pb5kSec = 1500; // default 25:00
  const userProfile = getUserProfile();
  if (userProfile?.pbs?.['5k'] && userProfile.pbs['5k'] > 0) {
    pb5kSec = userProfile.pbs['5k'];
  } else if (activity.best_efforts) {
    const effort5k = activity.best_efforts.find(e =>
      e.name?.toLowerCase().includes('5k') ||
      e.name?.toLowerCase().includes('5 kilometer')
    );
    if (effort5k && effort5k.elapsed_time > 0) {
      pb5kSec = effort5k.elapsed_time;
    }
  }
  
  const pb5kPace = pb5kSec / 5; // seconds per km for 5K
  
  // Daniels formula zones relative to 5K pace
  const zones = {
    E: { max: pb5kPace * 1.35, label: 'E-轻松', color: 'text-green-600' },
    M: { max: pb5kPace * 1.15, label: 'M-马拉松', color: 'text-blue-600' },
    T: { max: pb5kPace * 1.00, label: 'T-阈值', color: 'text-orange-600' },
    I: { max: pb5kPace * 0.92, label: 'I-间歇', color: 'text-red-600' },
    R: { max: pb5kPace * 0.87, label: 'R-重复', color: 'text-purple-600' },
  };
  
  let calculatedZoneKey: string = 'E';
  if (currentPaceSecKm <= zones.R.max) calculatedZoneKey = 'R';
  else if (currentPaceSecKm <= zones.I.max) calculatedZoneKey = 'I';
  else if (currentPaceSecKm <= zones.T.max) calculatedZoneKey = 'T';
  else if (currentPaceSecKm <= zones.M.max) calculatedZoneKey = 'M';
  
  // Use AI zone if available and valid, otherwise use calculated
  const aiZone = analysis?.paceZoneAnalysis?.zone?.trim();
  const normalizedAiZone = aiZone ? aiZone.charAt(0).toUpperCase() + aiZone.slice(1).toLowerCase() : '';
  const validZones = ['E', 'M', 'T', 'I', 'R'];
  const zoneKey = (normalizedAiZone && validZones.includes(normalizedAiZone)) ? normalizedAiZone : calculatedZoneKey;
  const zoneLabel = t(`aiAnalysis.zone${zoneKey}`, zoneKey === 'E' ? 'E-Easy' : zoneKey === 'M' ? 'M-Marathon' : zoneKey === 'T' ? 'T-Threshold' : zoneKey === 'I' ? 'I-Interval' : zoneKey === 'R' ? 'R-Repetition' : 'Unknown');
  const zone = { label: zoneLabel, color: zoneColors[zoneKey] || zoneColors.unknown };

  return (
    <div className="border-4 border-zinc-800 dark:border-zinc-200 bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className={`p-4 border-b-4 border-zinc-800 dark:border-zinc-200 ${
        isRace 
          ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20' 
          : 'bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRace ? (
              <Trophy className="w-5 h-5 text-amber-600" />
            ) : (
              <Sparkles className="w-5 h-5 text-purple-600" />
            )}
            <h2 className="font-pixel text-lg font-bold">
              {isRace ? `${classification.raceType || t('aiAnalysis.raceAnalysis')} ${t('aiAnalysis.title')}` : t('aiAnalysis.title')}
            </h2>
            {trainingStats && (
              <span className="font-mono text-[10px] text-zinc-500">
                {t('aiAnalysis.basedOnRuns', { count: trainingStats.totalRunsAnalyzed })}
              </span>
            )}
          </div>
          <button
            onClick={fetchAnalysis}
            disabled={loading}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors disabled:opacity-50"
            title="重新分析"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse font-mono text-sm text-zinc-500">
              ◼◼◼ {t('aiAnalysis.analyzing')}
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-4 px-2">
            <p className="font-mono text-xs text-red-500 mb-2 break-all max-w-full">{error}</p>
            <button onClick={fetchAnalysis} className="font-mono text-xs text-blue-600 hover:underline">
              {t('common.retry')}
            </button>
          </div>
        ) : analysis ? (
          <div className="space-y-4">
            {/* Summary */}
            <div className={`p-3 border-l-4 ${
              isRace ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500' : 'bg-zinc-50 dark:bg-zinc-800 border-purple-500'
            }`}>
              <p className="font-mono text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {analysis.summary}
              </p>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
              {/* Pace Zone */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                <div className="flex items-center gap-1 mb-1">
                  <Target className="w-3 h-3 text-zinc-400" />
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">{t('aiAnalysis.paceZone')}</span>
                </div>
                {zone ? (
                  <div>
                    <span className={`font-mono text-lg font-bold ${zone.color}`}>
                      {zone.label}
                    </span>
                    {analysis.paceZoneAnalysis?.appropriateness !== 'appropriate' && (
                      <span className="ml-2 font-mono text-[10px] text-amber-600">
                        {analysis.paceZoneAnalysis?.appropriateness === 'too-fast' ? t('aiAnalysis.tooFast') : t('aiAnalysis.tooSlow')}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="font-mono text-sm text-zinc-400">--</span>
                )}
              </div>

              {/* Intensity */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                <div className="flex items-center gap-1 mb-1">
                  <Zap className="w-3 h-3 text-zinc-400" />
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">{t('aiAnalysis.intensity')}</span>
                </div>
                {intensity && (
                  <span className={`inline-block px-2 py-0.5 text-sm font-mono font-bold ${intensity.color} ${intensity.bg}`}>
                    {isRace ? t('aiAnalysis.extremeRace') : intensity.label}
                  </span>
                )}
              </div>

              {/* Recovery */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">{t('aiAnalysis.recovery')}</span>
                </div>
                <span className={`font-mono text-lg font-bold ${isRace ? 'text-red-600' : ''}`}>
                  {analysis.recoveryHours}h
                </span>
              </div>

              {/* Historical Comparison */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="w-3 h-3 text-zinc-400" />
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">{t('aiAnalysis.comparison')}</span>
                </div>
                <span className="font-mono text-sm font-bold">
                  {analysis.comparisonToAverage}
                </span>
              </div>
            </div>

            {/* Expandable Details */}
            <div className="border border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full p-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="font-mono text-xs font-bold uppercase text-zinc-500">
                  {t('aiAnalysis.deepInsights')}
                </span>
                <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>
              
              {expanded && (
                <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
                  {analysis.trainingLoadContext && (
                    <div className="flex items-start gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500 uppercase block">{t('aiAnalysis.loadContext')}</span>
                        <p className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                          {analysis.trainingLoadContext}
                        </p>
                      </div>
                    </div>
                  )}

                  {analysis.similarActivitiesInsight && (
                    <div className="flex items-start gap-2">
                      <Activity className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500 uppercase block">{t('aiAnalysis.similarActivities')}</span>
                        <p className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                          {analysis.similarActivitiesInsight}
                        </p>
                      </div>
                    </div>
                  )}

                  {analysis.nextWorkoutSuggestion && (
                    <div className="flex items-start gap-2">
                      <Target className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isRace ? 'text-amber-500' : 'text-purple-500'}`} />
                      <div>
                        <span className="font-mono text-[10px] text-zinc-500 uppercase block">
                          {isRace ? t('aiAnalysis.postRaceRecovery') : t('aiAnalysis.nextWorkout')}
                        </span>
                        <p className={`font-mono text-sm ${isRace ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                          {analysis.nextWorkoutSuggestion}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Warnings */}
            {analysis.warnings && analysis.warnings.length > 0 && (
              <div className={`p-3 border-l-4 ${
                isRace ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500' : 'bg-red-50 dark:bg-red-900/20 border-red-500'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`w-4 h-4 ${isRace ? 'text-amber-600' : 'text-red-600'}`} />
                  <span className={`font-mono text-xs font-bold ${isRace ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                    {isRace ? t('aiAnalysis.postRaceNotes') : t('aiAnalysis.warnings')}
                  </span>
                </div>
                <ul className="space-y-1">
                  {analysis.warnings.map((warning, i) => (
                    <li 
                      key={i}
                      className={`font-mono text-sm ${isRace ? 'text-amber-800 dark:text-amber-300' : 'text-red-800 dark:text-red-300'}`}
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {analysis.suggestions.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-mono text-xs font-bold uppercase text-zinc-500">
                  {isRace ? t('aiAnalysis.postRaceRecovery') : t('aiAnalysis.suggestions')}
                </h3>
                <ul className="space-y-1">
                  {analysis.suggestions.map((suggestion, i) => (
                    <li 
                      key={i}
                      className="font-mono text-sm text-zinc-600 dark:text-zinc-400 flex items-start gap-2"
                    >
                      <span className={`mt-1 ${isRace ? 'text-amber-500' : 'text-purple-500'}`}>◼</span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}


          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || seconds === 0) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatPace(secondsPerKm: number): string {
  if (!secondsPerKm || secondsPerKm === 0) return "--'--\"";
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}'${secs.toString().padStart(2, '0')}"`;
}
