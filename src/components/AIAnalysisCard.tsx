'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityStream, StravaActivity } from '@/types';
import {
  Sparkles, RefreshCw, Clock, Zap, TrendingUp, Target,
  Activity, AlertTriangle, ChevronRight, BarChart3, Trophy, Brain, Radar, ListTree,
} from 'lucide-react';
import { getWorkoutTypeLabel } from '@/lib/trainingAnalysis';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';

interface AIAnalysisCardProps {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
}

const intensityColors: Record<string, { color: string; bg: string }> = {
  easy: { color: 'text-green-600', bg: 'bg-green-100' },
  moderate: { color: 'text-blue-600', bg: 'bg-blue-100' },
  hard: { color: 'text-orange-600', bg: 'bg-orange-100' },
  extreme: { color: 'text-red-600', bg: 'bg-red-100' },
};

const zoneColors: Record<string, string> = {
  E: 'text-green-600', M: 'text-blue-600', T: 'text-orange-600',
  I: 'text-red-600', R: 'text-purple-600',
};

// Friel HR zone colors (Z1→Z5)
const hrZoneDisplay: Record<string, { label: string; color: string; bg: string }> = {
  z5: { label: 'Z5 VO2max', color: 'text-red-600', bg: 'bg-red-500' },
  z4: { label: 'Z4 阈值', color: 'text-orange-600', bg: 'bg-orange-500' },
  z3: { label: 'Z3 马拉松配速', color: 'text-green-600', bg: 'bg-green-500' },
  z2: { label: 'Z2 有氧基础', color: 'text-blue-600', bg: 'bg-blue-500' },
  z1: { label: 'Z1 恢复', color: 'text-slate-500', bg: 'bg-slate-400' },
};

export function AIAnalysisCard({ activity, streams }: AIAnalysisCardProps) {
  const { t, i18n } = useTranslation();
  const {
    analysis,
    streamAnalysis,
    trainingStats,
    classification,
    loading,
    error,
    isQuotaError,
    refreshAnalysis,
  } = useAIAnalysis(activity, streams);
  const [expanded, setExpanded] = useState(false);

  const intensity = analysis?.intensity
    ? { ...intensityColors[analysis.intensity], label: t(`aiAnalysis.${analysis.intensity}`) }
    : null;
  const isRace = classification?.isRace;
  const workoutTypeLabel = classification
    ? getWorkoutTypeLabel(classification.workoutType, i18n.language)
    : '';
  const confidenceLabel = classification
    ? t(`aiAnalysis.confidence.${classification.workoutTypeConfidence}`, classification.workoutTypeConfidence)
    : '';
  const isLowIntensityRun = classification?.workoutType === 'easy' || classification?.workoutType === 'recovery';
  const comparisonMeta = trainingStats?.similarStats ?? null;
  const comparisonIsReferenceOnly = Boolean(
    isLowIntensityRun ||
    comparisonMeta?.sampleConfidence === 'low' ||
    comparisonMeta?.comparisonMode === 'fallback'
  );

  function getLowIntensityExecution() {
    if (!classification || !isLowIntensityRun) return null;

    const z1 = hrDist?.z1 ?? 0;
    const z2 = hrDist?.z2 ?? 0;
    const hardShare = (hrDist?.z4 ?? 0) + (hrDist?.z5 ?? 0);
    const drift = streamAnalysis?.avgHRDrift ?? 0;

    if (streamAnalysis?.hasHRDrift || hardShare >= 15 || drift >= 10) {
      return {
        title: classification.workoutType === 'recovery'
          ? t('aiAnalysis.recoveryQuality', '恢复质量')
          : t('aiAnalysis.aerobicQuality', '有氧质量'),
        status: t('aiAnalysis.executionCaution', '略偏顶'),
        detail: t('aiAnalysis.executionCautionHint', '这次低强度训练的负荷略高，下一次更适合把重心放回轻松和恢复。'),
        color: 'text-amber-600',
      };
    }

    if (z1 + z2 >= 95 && drift <= 6) {
      return {
        title: classification.workoutType === 'recovery'
          ? t('aiAnalysis.recoveryQuality', '恢复质量')
          : t('aiAnalysis.aerobicQuality', '有氧质量'),
        status: t('aiAnalysis.executionExcellent', '到位'),
        detail: t('aiAnalysis.executionExcellentHint', '心率分布和后程控制都很干净，说明这次低强度训练完成得很到位。'),
        color: 'text-emerald-600',
      };
    }

    if (z1 + z2 >= 85) {
      return {
        title: classification.workoutType === 'recovery'
          ? t('aiAnalysis.recoveryQuality', '恢复质量')
          : t('aiAnalysis.aerobicQuality', '有氧质量'),
        status: t('aiAnalysis.executionControlled', '控制良好'),
        detail: t('aiAnalysis.executionControlledHint', '整体仍在低强度范围内，适合作为一次合格的恢复或有氧补量。'),
        color: 'text-blue-600',
      };
    }

    return {
      title: classification.workoutType === 'recovery'
        ? t('aiAnalysis.recoveryQuality', '恢复质量')
        : t('aiAnalysis.aerobicQuality', '有氧质量'),
      status: t('aiAnalysis.executionMixed', '可再放松一点'),
      detail: t('aiAnalysis.executionMixedHint', '这次仍有训练价值，但如果目的是恢复，下次还可以再保守一些。'),
      color: 'text-zinc-700 dark:text-zinc-300',
    };
  }

  function formatStructureSummary() {
    if (!classification) return '';
    const structure = classification.structure;
    const parts: string[] = [];

    if (structure.lapCount > 0) {
      parts.push(t('aiAnalysis.structureLaps', { count: structure.lapCount, defaultValue: `${structure.lapCount} 圈` }));
    }
    const shouldShowRepCount = structure.shortRepCount > 0 && (
      structure.source === 'laps' ||
      structure.splitPattern === 'interval' ||
      structure.fastRepCount > 0 ||
      structure.recoveryRepCount > 0
    );
    if (shouldShowRepCount) {
      parts.push(t('aiAnalysis.structureReps', { count: structure.shortRepCount, defaultValue: `${structure.shortRepCount} 个重复段` }));
    }
    if (structure.splitPattern !== 'unknown') {
      parts.push(t(`aiAnalysis.pattern.${structure.splitPattern}`, structure.splitPattern));
    }

    return parts.join(' · ');
  }

  function formatEvidence(evidence: string) {
    if (i18n.language.startsWith('en')) return evidence;

    if (evidence === 'Strava workout_type=1') return 'Strava 将本次活动标记为比赛';
    if (evidence === 'activity name matches race keywords') return '活动名称包含比赛关键词';
    if (evidence === 'name/description indicates treadmill') return '名称或描述显示这是跑步机训练';
    if (evidence === 'trainer/VirtualRun flag') return '活动标记为 trainer / VirtualRun';
    if (evidence === 'keyword match: progression') return '名称或描述命中“渐进跑”关键词';
    if (evidence === 'keyword match: recovery') return '名称或描述命中“恢复跑”关键词';
    if (evidence === 'keyword match: easy') return '名称或描述命中“轻松跑”关键词';
    if (evidence === 'split pattern progression') return '分段模式显示为渐进跑';
    if (evidence === 'warmup/cooldown pattern detected') return '检测到明显的热身/冷身结构';
    if (evidence === 'pace falls in threshold zone') return '当前配速落在阈值区间';
    if (evidence === 'pace sits inside threshold zone') return '当前配速真正落在阈值区间';
    if (evidence === 'pace sits inside marathon zone') return '当前配速真正落在马拉松配速区间';
    if (evidence === 'pace sits inside easy zone') return '当前配速真正落在轻松跑区间';
    if (evidence === 'pace sits inside interval zone') return '当前配速真正落在间歇区间';
    if (evidence === 'pace sits inside repetition zone') return '当前配速真正落在重复跑区间';
    if (evidence === 'pace-zone model unavailable, defaulted to easy') return '当前没有可用的配速区间模型，默认归为轻松跑';
    if (evidence === 'pace in repetition zone') return '当前配速落在重复跑区间';
    if (evidence === 'pace in interval zone') return '当前配速落在间歇跑区间';
    if (evidence === 'pace in threshold zone') return '当前配速落在乳酸阈值区间';
    if (evidence === 'pace in marathon zone') return '当前配速落在马拉松配速区间';
    if (evidence === 'pace in easy zone') return '当前配速落在轻松跑区间';
    if (evidence === 'easy pace with low aerobic heart rate') return '配速轻松且心率保持在低有氧范围';
    if (evidence === 'easy-zone pace without workout structure') return '配速处于轻松区间，且没有明显质量课结构';
    if (evidence === 'short duration with very low cardiac cost') return '单次时间较短，且整体心肺负担很低';
    if (evidence === 'aerobic volume with low heart-rate cost') return '完成了一次低心率成本的有氧跑量积累';
    if (evidence === 'steady aerobic effort without recovery-only profile') return '整体是稳定有氧输出，但不像纯恢复跑';
    if (evidence === 'insufficient workout-structure evidence') return '训练结构证据不足，只能做保守判断';
    if (evidence === 'no clear repeat structure, possibly steady hard effort') return '没有明显重复段结构，更像持续偏强的稳态努力';

    let match = evidence.match(/^(\d+) laps with (\d+) short reps$/);
    if (match) return `${match[1]} 圈中包含 ${match[2]} 个短重复段`;

    match = evidence.match(/^(\d+) faster reps and (\d+) recovery reps$/);
    if (match) return `${match[1]} 个快段，对应 ${match[2]} 个恢复段`;

    match = evidence.match(/^high climb ratio (\d+)m\/km with repeated short reps$/);
    if (match) return `单位距离爬升较高（${match[1]} 米/公里），且伴随重复短段`;

    match = evidence.match(/^distance ([\d.]+)km$/);
    if (match) return `本次距离为 ${match[1]} km`;

    match = evidence.match(/^average HR sits in threshold zone \((\d+) bpm\)$/);
    if (match) return `平均心率 ${match[1]} bpm，落在阈值心率区间`;

    match = evidence.match(/^average HR stayed in low aerobic zone \((\d+) bpm\)$/);
    if (match) return `平均心率 ${match[1]} bpm，保持在低有氧心率区间`;

    match = evidence.match(/^average HR stayed below threshold zone \((\d+) bpm\)$/);
    if (match) return `平均心率 ${match[1]} bpm，低于阈值心率区间`;

    match = evidence.match(/^keyword match: (.+)$/);
    if (match) return `名称或描述命中关键词：${match[1]}`;

    match = evidence.match(/^split pattern (.+)$/);
    if (match) return `分段模式识别为 ${match[1]}`;

    return evidence;
  }

  // HR zone distribution bars
  const hrDist = streamAnalysis?.hrZoneDistribution;
  const hrZonesOrdered = ['z5', 'z4', 'z3', 'z2', 'z1'] as const;

  const structureSummary = formatStructureSummary();
  const lowIntensityExecution = getLowIntensityExecution();

  const aiZone = analysis?.paceZoneAnalysis?.zone?.trim();
  const normalizedAiZone = aiZone ? aiZone.charAt(0).toUpperCase() + aiZone.slice(1).toLowerCase() : '';
  const validZones = ['E', 'M', 'T', 'I', 'R'];
  const fallbackZone = classification?.paceZone && validZones.includes(classification.paceZone) ? classification.paceZone : 'E';
  const zoneKey = (normalizedAiZone && validZones.includes(normalizedAiZone)) ? normalizedAiZone : fallbackZone;
  const zoneTranslationKey = `aiAnalysis.zone${zoneKey}`;
  const zoneFallbackLabel = zoneKey;
  const zoneLabel = t(zoneTranslationKey, zoneFallbackLabel);
  const zone = { label: zoneLabel, color: zoneColors[zoneKey] || zoneColors.E };

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
            {isRace ? <Trophy className="w-5 h-5 text-amber-600" /> : <Sparkles className="w-5 h-5 text-purple-600" />}
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
            onClick={refreshAnalysis}
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
            <div className="animate-pulse font-mono text-sm text-zinc-500">◼◼◼ {t('aiAnalysis.analyzing')}</div>
          </div>
        ) : error ? (
          <div className="text-center py-4 px-2">
            <p className={`font-mono text-xs mb-2 break-all max-w-full ${isQuotaError ? 'text-amber-600' : 'text-red-500'}`}>{error}</p>
            {!isQuotaError && (
              <button onClick={refreshAnalysis} className="font-mono text-xs text-blue-600 hover:underline">{t('common.retry')}</button>
            )}
          </div>
        ) : analysis ? (
          <div className="space-y-4">
            {analysis.isFallback && (
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="font-mono text-[10px] text-amber-700 dark:text-amber-300 flex-1">
                  {t('aiAnalysis.fallbackWarning', 'AI 服务暂不可用，以下为系统生成的基础分析。点击右上角可重新尝试。')}
                </span>
              </div>
            )}

            {/* Summary */}
            <div className={`p-3 border-l-4 ${isRace ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500' : 'bg-zinc-50 dark:bg-zinc-800 border-purple-500'}`}>
              <p className="font-mono text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{analysis.summary}</p>
            </div>

            {classification && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                  <div className="flex items-center gap-1 mb-1">
                    <Brain className="w-3 h-3 text-zinc-400" />
                    <span className="font-mono text-[10px] text-zinc-500 uppercase">{t('aiAnalysis.workoutRead', '训练识别')}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-base font-bold text-zinc-900 dark:text-zinc-100">{workoutTypeLabel}</span>
                    <span className="inline-flex items-center px-2 py-0.5 font-mono text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                      {confidenceLabel}
                    </span>
                  </div>
                  {structureSummary && (
                    <p className="mt-1 font-mono text-[11px] text-zinc-500">{structureSummary}</p>
                  )}
                </div>
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                  <div className="flex items-center gap-1 mb-1">
                    <Radar className="w-3 h-3 text-zinc-400" />
                    <span className="font-mono text-[10px] text-zinc-500 uppercase">{t('aiAnalysis.whyItThinksSo', '判断依据')}</span>
                  </div>
                  <div className="space-y-1">
                    {classification.workoutTypeEvidence.slice(0, 2).map((evidence, index) => (
                      <p key={index} className="font-mono text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {formatEvidence(evidence)}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                <div className="flex items-center gap-1 mb-1">
                  <Target className="w-3 h-3 text-zinc-400" />
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">{t('aiAnalysis.paceZone')}</span>
                </div>
                {zone ? (
                  <div>
                    <span className={`font-mono text-lg font-bold ${zone.color}`}>{zone.label}</span>
                    {analysis.paceZoneAnalysis?.appropriateness !== 'appropriate' && (
                      <span className="ml-2 font-mono text-[10px] text-amber-600">
                        {analysis.paceZoneAnalysis?.appropriateness === 'too-fast' ? t('aiAnalysis.tooFast') : t('aiAnalysis.tooSlow')}
                      </span>
                    )}
                  </div>
                ) : <span className="font-mono text-sm text-zinc-400">--</span>}
              </div>
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
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                <div className="flex items-center gap-1 mb-1">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">{t('aiAnalysis.recovery')}</span>
                </div>
                <span className={`font-mono text-lg font-bold ${isRace ? 'text-red-600' : ''}`}>{analysis.recoveryHours}h</span>
              </div>
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="w-3 h-3 text-zinc-400" />
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">
                    {comparisonIsReferenceOnly && lowIntensityExecution
                      ? lowIntensityExecution.title
                      : comparisonIsReferenceOnly
                        ? t('aiAnalysis.comparisonReference', '配速参考')
                        : t('aiAnalysis.comparison')}
                  </span>
                </div>
                {comparisonIsReferenceOnly && lowIntensityExecution ? (
                  <div>
                    <span className={`font-mono text-lg font-bold ${lowIntensityExecution.color}`}>{lowIntensityExecution.status}</span>
                    <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">{lowIntensityExecution.detail}</p>
                  </div>
                ) : comparisonIsReferenceOnly ? (
                  <div>
                    <span className="font-mono text-sm font-bold">{analysis.comparisonToAverage}</span>
                    <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                      {isLowIntensityRun
                        ? t('aiAnalysis.easyRunComparisonHint', '轻松/恢复跑更看重低负荷完成度，配速对比只作背景参考。')
                        : t('aiAnalysis.comparisonSecondaryHint', '这组历史样本参考性一般，更适合当作方向提示。')}
                    </p>
                  </div>
                ) : (
                  <span className="font-mono text-sm font-bold">{analysis.comparisonToAverage}</span>
                )}
              </div>
            </div>

            {/* HR Zone Distribution */}
            {hrDist && Object.keys(hrDist).length > 0 && (
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800">
                <div className="flex items-center gap-1 mb-2">
                  <Activity className="w-3 h-3 text-zinc-400" />
                  <span className="font-mono text-[10px] text-zinc-500 uppercase">{t('aiAnalysis.hrZoneDistribution')}</span>
                </div>
                <div className="space-y-1.5">
                  {hrZonesOrdered.map((zk) => {
                    const pct = hrDist[zk] || 0;
                    if (pct <= 0) return null;
                    const info = hrZoneDisplay[zk];
                    return (
                      <div key={zk} className="flex items-center gap-2">
                        <span className={`font-mono text-[10px] w-20 text-right ${info.color}`}>{info.label}</span>
                        <div className="flex-1 h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded-sm overflow-hidden">
                          <div className={`h-full ${info.bg} rounded-sm`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-mono text-[10px] w-8 text-zinc-500">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
                {streamAnalysis?.pacePattern && (
                  <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                    <span className="font-mono text-[10px] text-zinc-500">
                      {t('aiAnalysis.pacePattern')}: <span className="text-zinc-700 dark:text-zinc-300">{streamAnalysis.patternConfidence}</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Expandable Details */}
            <div className="border border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full p-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="font-mono text-xs font-bold uppercase text-zinc-500">{t('aiAnalysis.deepInsights')}</span>
                <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>

              {expanded && (
                <div className="px-3 pb-3 border-t border-zinc-200 dark:border-zinc-700">
                  <div className="space-y-3 pt-3">
                    {analysis.trainingLoadContext && (
                      <div className="flex items-start gap-3">
                        <BarChart3 className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-0.5">{t('aiAnalysis.loadContext')}</span>
                          <p className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{analysis.trainingLoadContext}</p>
                        </div>
                      </div>
                    )}
                    {analysis.similarActivitiesInsight && (
                      <div className="flex items-start gap-3">
                        <Activity className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-0.5">
                            {comparisonIsReferenceOnly
                              ? t('aiAnalysis.similarActivitiesReference', '同类参考')
                              : t('aiAnalysis.similarActivities')}
                          </span>
                          <p className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{analysis.similarActivitiesInsight}</p>
                        </div>
                      </div>
                    )}
                    {comparisonIsReferenceOnly && analysis.comparisonToAverage && (
                      <div className="flex items-start gap-3">
                        <TrendingUp className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-0.5">
                            {t('aiAnalysis.comparisonReference', '配速参考')}
                          </span>
                          <p className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{analysis.comparisonToAverage}</p>
                        </div>
                      </div>
                    )}
                    {analysis.nextWorkoutSuggestion && (
                      <div className="flex items-start gap-3">
                        <Target className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isRace ? 'text-amber-500' : 'text-purple-500'}`} />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-0.5">
                            {isRace ? t('aiAnalysis.postRaceRecovery') : t('aiAnalysis.nextWorkout')}
                          </span>
                          <p className={`font-mono text-sm ${isRace ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                            {analysis.nextWorkoutSuggestion}
                          </p>
                        </div>
                      </div>
                    )}
                    {classification && (
                      <div className="flex items-start gap-3">
                        <ListTree className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-[10px] text-zinc-500 uppercase block mb-0.5">
                            {t('aiAnalysis.classificationDetail', '识别明细')}
                          </span>
                          <div className="space-y-1">
                            {classification.workoutTypeEvidence.map((evidence, index) => (
                              <p key={index} className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{formatEvidence(evidence)}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Warnings */}
            {analysis.warnings && analysis.warnings.length > 0 && (
              <div className={`p-3 border-l-4 ${isRace ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500' : 'bg-red-50 dark:bg-red-900/20 border-red-500'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`w-4 h-4 ${isRace ? 'text-amber-600' : 'text-red-600'}`} />
                  <span className={`font-mono text-xs font-bold ${isRace ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                    {isRace ? t('aiAnalysis.postRaceNotes') : t('aiAnalysis.warnings')}
                  </span>
                </div>
                <ul className="space-y-1">
                  {analysis.warnings.map((warning, i) => (
                    <li key={i} className={`font-mono text-sm ${isRace ? 'text-amber-800 dark:text-amber-300' : 'text-red-800 dark:text-red-300'}`}>
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
                    <li key={i} className="font-mono text-sm text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
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
