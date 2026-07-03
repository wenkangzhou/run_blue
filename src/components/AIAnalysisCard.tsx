'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityStream, StravaActivity } from '@/types';
import {
  Sparkles, RefreshCw, Clock, Zap, TrendingUp, Target,
  Activity, AlertTriangle, ChevronRight, Trophy, Radar,
  ArrowRight, ShieldCheck,
} from 'lucide-react';
import { getWorkoutTypeLabel, type ActivityClassification } from '@/lib/trainingAnalysis';
import { useAIAnalysis } from '@/hooks/useAIAnalysis';

interface AIAnalysisCardProps {
  activity: StravaActivity;
  streams: Record<string, ActivityStream> | null;
  enabled?: boolean;
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

function getAppropriatePaceProLabel(workoutType: ActivityClassification['workoutType'] | undefined): string {
  switch (workoutType) {
    case 'easy':
    case 'recovery':
      return '低强度范围匹配';
    case 'progression':
      return '渐进节奏清晰';
    case 'long-run':
      return '耐力节奏稳定';
    case 'workout':
      return '训练结构可辨';
    case 'interval':
    case 'fartlek':
      return '重复段强度匹配';
    case 'threshold':
    case 'tempo':
      return '强度区间匹配';
    case 'hill':
      return '爬升强度匹配';
    case 'treadmill':
      return '配速控制稳定';
    case 'race':
      return '比赛配速匹配';
    default:
      return '配速区间匹配';
  }
}

function compactSummary(text: string, maxSentences = 1, maxChars = 88): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;

  const [dashLead, ...dashRest] = normalized.split(/——|--/);
  const dashTail = dashRest.join(' ').trim();
  const leadSentence = closeSentence(dashLead ?? '');
  const remainingChars = maxChars - leadSentence.length;
  if (dashTail && leadSentence.length >= 8 && remainingChars >= 24) {
    return `${leadSentence}${compactNaturalSentence(dashTail, 1, remainingChars)}`;
  }

  return compactNaturalSentence(normalized, maxSentences, maxChars);
}

function compactNaturalSentence(text: string, maxSentences: number, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;

  const sentences = normalized.match(/[^。！？!?]+[。！？!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  const bySentence = sentences.slice(0, maxSentences).join('');
  const candidate = bySentence || normalized;

  if (candidate.length <= maxChars) return candidate;
  const clipped = candidate.slice(0, maxChars).trim();
  const splitIndex = Math.max(
    clipped.lastIndexOf('，'),
    clipped.lastIndexOf('；'),
    clipped.lastIndexOf('、'),
    clipped.lastIndexOf(','),
    clipped.lastIndexOf(';')
  );
  if (splitIndex > maxChars * 0.45) {
    return closeSentence(clipped.slice(0, splitIndex));
  }

  return closeSentence(clipped);
}

function closeSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[。！？!?.]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function cleanClause(text: string): string {
  return text.replace(/[。！？!?.]+$/g, '').trim();
}

export function AIAnalysisCard({ activity, streams, enabled = true }: AIAnalysisCardProps) {
  const { t, i18n } = useTranslation();
  const {
    analysis,
    streamAnalysis,
    trainingStats,
    classification,
    loading,
    error,
    isQuotaError,
    isAuthError,
    consentStatus,
    consentReady,
    consentRequired,
    acceptAIConsent,
    declineAIConsent,
    refreshAnalysis,
  } = useAIAnalysis(activity, streams, enabled);
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
        level: 'caution' as const,
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
        level: 'excellent' as const,
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
        level: 'controlled' as const,
        title: classification.workoutType === 'recovery'
          ? t('aiAnalysis.recoveryQuality', '恢复质量')
          : t('aiAnalysis.aerobicQuality', '有氧质量'),
        status: t('aiAnalysis.executionControlled', '控制良好'),
        detail: t('aiAnalysis.executionControlledHint', '整体仍在低强度范围内，适合作为一次合格的恢复或有氧补量。'),
        color: 'text-blue-600',
      };
    }

    return {
      level: 'mixed' as const,
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
    if (evidence === 'Strava workout_type=3') return 'Strava 将本次活动标记为训练';
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
    if (evidence === 'lap structure has low pace contrast, analyze reps rather than average pace') return '各圈配速对比不强，重点看分段结构而不是全程均配';

    let match = evidence.match(/^(\d+) laps with (\d+) short reps$/);
    if (match) return `${match[1]} 圈中包含 ${match[2]} 个短重复段`;

    match = evidence.match(/^(\d+) lap structure with (\d+) short segments$/);
    if (match) return `${match[1]} 圈结构中包含 ${match[2]} 个短分段，优先按结构化训练解读`;

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
  const lowIntensityLooksControlled =
    lowIntensityExecution?.level === 'excellent' ||
    lowIntensityExecution?.level === 'controlled';
  const pacePatternExplainsHRDrift =
    streamAnalysis?.pacePattern === 'interval' ||
    streamAnalysis?.pacePattern === 'progression' ||
    streamAnalysis?.pacePattern === 'warmup-cooldown';

  // Coach verdict: structured evaluation
  const verdict = useMemo(() => {
    if (!analysis || !classification) return null;

    // 1. Training type
    const type = workoutTypeLabel;

    // 2. Effect evaluation
    let effect: 'excellent' | 'good' | 'fair' | 'poor' = 'good';
    let effectLabel = '完成良好';

    if (isRace) {
      effect = 'good';
      effectLabel = '比赛完成';
    } else if (classification.workoutType === 'easy' || classification.workoutType === 'recovery') {
      const z1 = hrDist?.z1 ?? 0;
      const z2 = hrDist?.z2 ?? 0;
      const hardShare = (hrDist?.z4 ?? 0) + (hrDist?.z5 ?? 0);
      const drift = streamAnalysis?.avgHRDrift ?? 0;

      if (z1 + z2 >= 95 && drift <= 6) {
        effect = 'excellent';
        effectLabel = '执行到位';
      } else if (z1 + z2 >= 85) {
        effect = 'good';
        effectLabel = '控制良好';
      } else if ((streamAnalysis?.hasHRDrift && !pacePatternExplainsHRDrift) || hardShare >= 15 || drift >= 10) {
        effect = 'fair';
        effectLabel = '略偏顶';
      } else {
        effect = 'poor';
        effectLabel = '可再放松';
      }
    } else if (classification.intensity === 'hard') {
      if (classification.paceZoneExactMatch) {
        effect = 'good';
        effectLabel = '配速精准';
      } else if (streamAnalysis?.hasHRDrift && !pacePatternExplainsHRDrift) {
        effect = 'fair';
        effectLabel = '后程掉速';
      } else {
        effect = 'good';
        effectLabel = '完成良好';
      }
    }

    // Override by warnings
    if (analysis.warnings && analysis.warnings.length > 0) {
      effect = 'poor';
      effectLabel = '需要注意';
    }

    // 3. Pros & cons
    const pros: string[] = [];
    const cons: string[] = [];

    // From pace zone appropriateness
    if (analysis.paceZoneAnalysis?.appropriateness === 'appropriate') {
      pros.push(getAppropriatePaceProLabel(classification.workoutType));
    } else if (analysis.paceZoneAnalysis?.appropriateness === 'too-fast') {
      cons.push('配速偏快，负荷偏高');
    } else if (analysis.paceZoneAnalysis?.appropriateness === 'too-slow') {
      pros.push('配速保守，恢复充分');
    }

    // From stream analysis
    if (streamAnalysis?.hasHRDrift && !pacePatternExplainsHRDrift && !lowIntensityLooksControlled) {
      cons.push(`后程心率上升 ${Math.round(streamAnalysis.avgHRDrift)} bpm，需要留意疲劳或补给`);
    } else if (streamAnalysis?.avgHRDrift && streamAnalysis.avgHRDrift > 5) {
      if (pacePatternExplainsHRDrift) {
        pros.push('心率变化与训练结构匹配');
      } else if (!lowIntensityLooksControlled) {
        cons.push(`后程心率小幅上升 ${Math.round(streamAnalysis.avgHRDrift)} bpm`);
      }
    } else if (streamAnalysis?.avgHRDrift !== undefined && streamAnalysis.avgHRDrift <= 5) {
      pros.push('心率控制稳定');
    }

    // From low intensity execution
    if (lowIntensityExecution) {
      if (lowIntensityExecution.level === 'excellent') {
        pros.push('低强度执行到位');
      } else if (lowIntensityExecution.level === 'controlled') {
        pros.push('低强度控制良好');
      } else if (lowIntensityExecution.level === 'caution') {
        cons.push('低强度负荷偏高');
      }
    }

    // From comparison
    if (analysis.comparisonToAverage && !comparisonIsReferenceOnly) {
      const isFaster = analysis.comparisonToAverage.includes('快') || analysis.comparisonToAverage.includes('faster');
      if (isFaster) {
        pros.push('比同类训练更快');
      }
    }

    // 4. Advice
    const advice: string[] = [];
    if (analysis.suggestions && analysis.suggestions.length > 0) {
      advice.push(...analysis.suggestions.slice(0, 2));
    } else if (analysis.nextWorkoutSuggestion) {
      advice.push(analysis.nextWorkoutSuggestion);
    }

    return { type, effect, effectLabel, pros, cons, advice };
  }, [analysis, classification, isRace, workoutTypeLabel, hrDist, streamAnalysis, lowIntensityExecution, lowIntensityLooksControlled, comparisonIsReferenceOnly, pacePatternExplainsHRDrift]);

  const effectStyles: Record<string, { color: string; bg: string; border: string }> = {
    excellent: { color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/15', border: 'border-emerald-400' },
    good:      { color: 'text-blue-700 dark:text-blue-400',      bg: 'bg-blue-50 dark:bg-blue-900/15',      border: 'border-blue-400' },
    fair:      { color: 'text-amber-700 dark:text-amber-400',    bg: 'bg-amber-50 dark:bg-amber-900/15',    border: 'border-amber-400' },
    poor:      { color: 'text-red-700 dark:text-red-400',        bg: 'bg-red-50 dark:bg-red-900/15',        border: 'border-red-400' },
  };

  const aiZone = analysis?.paceZoneAnalysis?.zone?.trim();
  const normalizedAiZone = aiZone ? aiZone.charAt(0).toUpperCase() + aiZone.slice(1).toLowerCase() : '';
  const validZones = ['E', 'M', 'T', 'I', 'R'];
  const fallbackZone = classification?.paceZone && validZones.includes(classification.paceZone) ? classification.paceZone : 'E';
  const zoneKey = (normalizedAiZone && validZones.includes(normalizedAiZone)) ? normalizedAiZone : fallbackZone;
  const zoneTranslationKey = `aiAnalysis.zone${zoneKey}`;
  const zoneFallbackLabel = zoneKey;
  const zoneLabel = t(zoneTranslationKey, zoneFallbackLabel);
  const zone = { label: zoneLabel, color: zoneColors[zoneKey] || zoneColors.E };
  const briefAdvice = (() => {
    if (!analysis || !verdict) return [];
    const candidates = [
      ...verdict.advice,
      analysis.nextWorkoutSuggestion,
      ...analysis.suggestions,
    ].filter((item): item is string => Boolean(item?.trim()));
    return Array.from(new Set(candidates)).slice(0, 1).map((item) => compactSummary(item, 1, 56));
  })();
  const coachConclusion = (() => {
    if (!analysis) return null;
    if (!verdict) {
      return {
        headline: t('aiAnalysis.trainingConclusion', '训练结论'),
        detail: compactNaturalSentence(analysis.summary, 2, 120),
      };
    }

    const headline = `${verdict.type} · ${verdict.effectLabel}`;
    const base = t('aiAnalysis.conclusionBase', {
      zone: zone.label,
      recovery: analysis.recoveryHours,
      defaultValue: '配速区间 {{zone}}，建议恢复约 {{recovery}}h',
    });
    const hasWarnings = (analysis.warnings ?? []).map(cleanClause).filter(Boolean).length > 0;
    const focus = hasWarnings
      ? t('aiAnalysis.conclusionRisk', '这次优先处理风险信号，训练收益放在第二位。')
      : isRace
        ? t('aiAnalysis.conclusionRace', '这次主要看比赛输出与赛后恢复，不建议继续叠加强度。')
        : isLowIntensityRun
          ? t('aiAnalysis.conclusionEasy', '这次主要看低负荷完成度，为后续训练留余量。')
          : classification?.intensity === 'hard'
            ? t('aiAnalysis.conclusionQuality', '这次主要看质量刺激是否完成，下一步恢复优先。')
            : structureSummary
              ? t('aiAnalysis.conclusionStructured', '分段结构能支撑本次判定，重点看执行质量。')
              : t('aiAnalysis.conclusionGeneral', '整体可作为一次有效训练，后续按疲劳反馈安排。');

    return {
      headline,
      detail: `${base}；${focus}`,
    };
  })();

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className={`border-b border-zinc-200 p-4 dark:border-zinc-800 ${
        isRace
          ? 'bg-amber-50/70 dark:bg-amber-950/20'
          : 'bg-white dark:bg-zinc-900'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
              isRace ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'
            }`}>
              {isRace ? <Trophy className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </span>
            <h2 className="min-w-0 truncate font-mono text-sm font-black uppercase tracking-normal text-zinc-950 dark:text-zinc-50">
              {isRace ? `${classification.raceType || t('aiAnalysis.raceAnalysis')} ${t('aiAnalysis.title')}` : t('aiAnalysis.title')}
            </h2>
            {trainingStats && (
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {t('aiAnalysis.basedOnRuns', { count: trainingStats.totalRunsAnalyzed })}
              </span>
            )}
          </div>
          <button
            onClick={refreshAnalysis}
            disabled={loading || !consentReady || consentRequired}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            title="重新分析"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {consentRequired ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="font-mono text-sm font-black text-zinc-950 dark:text-zinc-50">
                  {t('aiAnalysis.consentTitle', '启用 Kimi 训练分析')}
                </h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {t('aiAnalysis.consentDescription', '仅发送距离、配速、心率、分段、训练负荷和跑者档案摘要；不会发送姓名、活动名称、路线坐标、地图或设备信息。')}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={acceptAIConsent}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-blue-600 px-4 font-mono text-xs font-bold text-white hover:bg-blue-700"
              >
                {t('aiAnalysis.consentAccept', '同意并生成分析')}
              </button>
              <button
                type="button"
                onClick={declineAIConsent}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 font-mono text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
              >
                {t('aiAnalysis.consentDecline', '仅使用本地算法')}
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
            </div>
            <p className="font-mono text-xs text-zinc-500">{t('aiAnalysis.analyzing')}</p>
          </div>
        ) : error ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center dark:border-zinc-800 dark:bg-zinc-950/40">
            <p className={`mx-auto mb-2 max-w-full break-words font-mono text-xs ${isQuotaError || isAuthError ? 'text-amber-600' : 'text-red-500'}`}>
              {isAuthError
                ? t('aiAnalysis.loginRequiredForAnalysis', '登录后可重新生成 AI 分析；当前仍可查看缓存的活动详情。')
                : error}
            </p>
            {!isQuotaError && !isAuthError && (
              <button onClick={refreshAnalysis} className="font-mono text-xs text-blue-600 hover:underline">{t('common.retry')}</button>
            )}
          </div>
        ) : analysis ? (
          <div className="space-y-3">
            {analysis.isFallback && (
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-900/20">
                <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="flex-1 font-mono text-[10px] text-amber-700 dark:text-amber-300">
                  {consentStatus === 'declined'
                    ? t('aiAnalysis.localOnlyNotice', '当前仅使用本地算法，不会向第三方 AI 发送训练摘要。')
                    : t('aiAnalysis.fallbackWarning', 'AI 服务暂不可用，以下为系统生成的基础分析。点击右上角可重新尝试。')}
                </span>
                {consentStatus === 'declined' && (
                  <button
                    type="button"
                    onClick={acceptAIConsent}
                    className="shrink-0 font-mono text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    {t('aiAnalysis.enableKimi', '启用 Kimi')}
                  </button>
                )}
              </div>
            )}

            <div className={`rounded-lg border p-4 ${verdict ? `${effectStyles[verdict.effect].border} ${effectStyles[verdict.effect].bg}` : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/60'}`}>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words font-mono text-base font-black text-zinc-950 [overflow-wrap:anywhere] dark:text-zinc-50">
                      {verdict?.type || workoutTypeLabel || t('aiAnalysis.workoutRead', '训练识别')}
                    </span>
                    {verdict && (
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${effectStyles[verdict.effect].color} ${effectStyles[verdict.effect].border}`}>
                        {verdict.effectLabel}
                      </span>
                    )}
                    {confidenceLabel && (
                      <span className="inline-flex items-center rounded-md bg-white/70 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                        {confidenceLabel}
                      </span>
                    )}
                  </div>
                  {structureSummary && (
                    <p className="mt-1 break-words font-mono text-[11px] text-zinc-500 [overflow-wrap:anywhere]">
                      {structureSummary}
                    </p>
                  )}
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-1.5 sm:min-w-[220px]">
                  <BriefMetric label={t('aiAnalysis.paceZone', '配速区间')} value={zone.label} valueClassName={zone.color} />
                  <BriefMetric
                    label={t('aiAnalysis.intensity', '强度')}
                    value={intensity ? (isRace ? t('aiAnalysis.extremeRace') : intensity.label) : '--'}
                  />
                  <BriefMetric label={t('aiAnalysis.recovery', '恢复')} value={`${analysis.recoveryHours}h`} valueClassName={isRace ? 'text-red-600' : ''} />
                </div>
              </div>

              {coachConclusion && (
                <div className="rounded-md border border-white/70 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/30">
                  <p className="mb-1 font-mono text-[10px] font-bold uppercase text-zinc-500">
                    {t('aiAnalysis.trainingConclusion', '训练结论')}
                  </p>
                  <p className="break-words font-mono text-sm font-black text-zinc-950 [overflow-wrap:anywhere] dark:text-zinc-50">
                    {coachConclusion.headline}
                  </p>
                  <p className="mt-1 break-words font-mono text-xs leading-relaxed text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-300">
                    {coachConclusion.detail}
                  </p>
                </div>
              )}

              {briefAdvice.length > 0 && (
                <div className="mt-3 rounded-md border border-white/70 bg-white/60 p-2 dark:border-zinc-800 dark:bg-zinc-950/30">
                  <p className="mb-1 font-mono text-[10px] font-bold uppercase text-zinc-500">
                    {isRace ? t('aiAnalysis.postRaceRecovery') : t('aiAnalysis.nextWorkout')}
                  </p>
                  <div className="space-y-1">
                    {briefAdvice.map((item, index) => (
                      <div key={index} className="flex items-start gap-1.5">
                        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />
                        <p className="break-words font-mono text-xs leading-relaxed text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-300">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center justify-between p-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className="font-mono text-xs font-bold uppercase text-zinc-500">
                  {t('aiAnalysis.analysisDetails', '完整分析')}
                </span>
                <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>

              {expanded && (
                <div className="border-t border-zinc-200 px-3 pb-3 dark:border-zinc-700">
                  <div className="space-y-3 pt-3">
                    {analysis.summary && (
                      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/60">
                        <h3 className="font-mono text-[10px] uppercase text-zinc-500">
                          {t('aiAnalysis.fullSummary', '完整总结')}
                        </h3>
                        <p className="mt-1 break-words font-mono text-sm leading-relaxed text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-300">
                          {analysis.summary}
                        </p>
                      </section>
                    )}

                    {classification && (
                      <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="mb-2 flex items-center gap-1">
                          <Radar className="h-3 w-3 text-zinc-400" />
                          <h3 className="font-mono text-[10px] uppercase text-zinc-500">
                            {t('aiAnalysis.whyItThinksSo', '为什么这样判定')}
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-100">{workoutTypeLabel}</span>
                          <span className="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            {confidenceLabel}
                          </span>
                          {structureSummary && (
                            <span className="break-words font-mono text-[11px] text-zinc-500 [overflow-wrap:anywhere]">
                              {structureSummary}
                            </span>
                          )}
                        </div>
                        {classification.workoutTypeEvidence.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {classification.workoutTypeEvidence.slice(0, 3).map((evidence, index) => (
                              <li key={index} className="flex items-start gap-2 font-mono text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
                                {formatEvidence(evidence)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    )}

                    <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <DetailMetric
                        icon={<Target className="h-3 w-3 text-zinc-400" />}
                        label={t('aiAnalysis.paceZone')}
                        value={zone.label}
                        valueClassName={zone.color}
                        aside={analysis.paceZoneAnalysis?.appropriateness !== 'appropriate'
                          ? (analysis.paceZoneAnalysis?.appropriateness === 'too-fast' ? t('aiAnalysis.tooFast') : t('aiAnalysis.tooSlow'))
                          : undefined}
                      />
                      <DetailMetric
                        icon={<Zap className="h-3 w-3 text-zinc-400" />}
                        label={t('aiAnalysis.intensity')}
                        value={intensity ? (isRace ? t('aiAnalysis.extremeRace') : intensity.label) : '--'}
                      />
                      <DetailMetric
                        icon={<Clock className="h-3 w-3 text-zinc-400" />}
                        label={t('aiAnalysis.recovery')}
                        value={`${analysis.recoveryHours}h`}
                        valueClassName={isRace ? 'text-red-600' : ''}
                      />
                      <DetailMetric
                        icon={<TrendingUp className="h-3 w-3 text-zinc-400" />}
                        label={comparisonIsReferenceOnly && lowIntensityExecution
                          ? lowIntensityExecution.title
                          : comparisonIsReferenceOnly
                            ? t('aiAnalysis.comparisonReference', '配速参考')
                            : t('aiAnalysis.comparison')}
                        value={comparisonIsReferenceOnly && lowIntensityExecution
                          ? lowIntensityExecution.status
                          : analysis.comparisonToAverage}
                        description={comparisonIsReferenceOnly && lowIntensityExecution
                          ? lowIntensityExecution.detail
                          : comparisonIsReferenceOnly
                            ? (isLowIntensityRun
                              ? t('aiAnalysis.easyRunComparisonHint', '轻松/恢复跑更看重低负荷完成度，配速对比只作背景参考。')
                              : t('aiAnalysis.comparisonSecondaryHint', '这组历史样本参考性一般，更适合当作方向提示。'))
                            : undefined}
                        valueClassName={comparisonIsReferenceOnly && lowIntensityExecution ? lowIntensityExecution.color : undefined}
                      />
                    </section>

                    {hrDist && Object.keys(hrDist).length > 0 && (
                      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/60">
                        <div className="mb-2 flex items-center gap-1">
                          <Activity className="h-3 w-3 text-zinc-400" />
                          <h3 className="font-mono text-[10px] uppercase text-zinc-500">{t('aiAnalysis.hrZoneDistribution')}</h3>
                        </div>
                        <div className="space-y-1.5">
                          {hrZonesOrdered.map((zk) => {
                            const pct = hrDist[zk] || 0;
                            if (pct <= 0) return null;
                            const info = hrZoneDisplay[zk];
                            return (
                              <div key={zk} className="flex items-center gap-2">
                                <span className={`w-20 text-right font-mono text-[10px] ${info.color}`}>{info.label}</span>
                                <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-zinc-200 dark:bg-zinc-700">
                                  <div className={`h-full rounded-sm ${info.bg}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-8 font-mono text-[10px] text-zinc-500">{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                        {streamAnalysis?.pacePattern && (
                          <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                            <span className="font-mono text-[10px] text-zinc-500">
                              {t('aiAnalysis.pacePattern')}: <span className="text-zinc-700 dark:text-zinc-300">{streamAnalysis.patternConfidence}</span>
                            </span>
                          </div>
                        )}
                      </section>
                    )}

                    {analysis.warnings && analysis.warnings.length > 0 && (
                      <section className={`rounded-lg border p-3 ${isRace ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'}`}>
                        <div className="mb-1 flex items-center gap-2">
                          <AlertTriangle className={`h-4 w-4 ${isRace ? 'text-amber-600' : 'text-red-600'}`} />
                          <span className={`font-mono text-xs font-bold ${isRace ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                            {isRace ? t('aiAnalysis.postRaceNotes') : t('aiAnalysis.warnings')}
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {analysis.warnings.map((warning, i) => (
                            <li key={i} className={`break-words font-mono text-sm [overflow-wrap:anywhere] ${isRace ? 'text-amber-800 dark:text-amber-300' : 'text-red-800 dark:text-red-300'}`}>
                              {warning}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {(analysis.nextWorkoutSuggestion || analysis.suggestions.length > 0) && (
                      <section className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="mb-2 flex items-center gap-1">
                          <Target className={`h-3 w-3 ${isRace ? 'text-amber-500' : 'text-purple-500'}`} />
                          <h3 className="font-mono text-[10px] font-bold uppercase text-zinc-500">
                            {isRace ? t('aiAnalysis.postRaceRecovery') : t('aiAnalysis.nextWorkout')}
                          </h3>
                        </div>
                        <div className="space-y-2">
                          {analysis.nextWorkoutSuggestion && (
                            <p className="break-words font-mono text-sm leading-relaxed text-zinc-700 [overflow-wrap:anywhere] dark:text-zinc-300">
                              {analysis.nextWorkoutSuggestion}
                            </p>
                          )}
                          {analysis.suggestions.length > 0 && (
                            <ul className="space-y-1">
                              {analysis.suggestions.slice(0, 3).map((suggestion, i) => (
                                <li key={i} className="flex items-start gap-2 break-words font-mono text-xs leading-relaxed text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-400">
                                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-blue-500" />
                                  {suggestion}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BriefMetric({
  label,
  value,
  valueClassName = '',
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-md border border-white/70 bg-white/60 px-2 py-1.5 text-center dark:border-zinc-800 dark:bg-zinc-950/30">
      <p className="font-mono text-[9px] uppercase text-zinc-500">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-xs font-black text-zinc-900 dark:text-zinc-100 ${valueClassName}`}>
        {value}
      </p>
    </div>
  );
}

function DetailMetric({
  icon,
  label,
  value,
  aside,
  description,
  valueClassName = '',
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  aside?: ReactNode;
  description?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/60">
      <div className="mb-1 flex items-center gap-1">
        {icon}
        <span className="font-mono text-[10px] uppercase text-zinc-500">{label}</span>
      </div>
      <div>
        <span className={`break-words font-mono text-sm font-bold [overflow-wrap:anywhere] ${valueClassName}`}>
          {value}
        </span>
        {aside && <span className="ml-2 font-mono text-[10px] text-amber-600">{aside}</span>}
      </div>
      {description && (
        <p className="mt-1 break-words font-mono text-[10px] leading-relaxed text-zinc-500 [overflow-wrap:anywhere]">
          {description}
        </p>
      )}
    </div>
  );
}
