import type { ActivityStream, StravaActivity } from '@/types';
import { classifyActivity } from './trainingAnalysis';
import type { ActivityClassification, TrainingProfile } from './trainingAnalysis';
import { buildProfessionalPrompt } from './aiPrompt';
import { parseAIResponse } from './aiResponseParser';
import type { AIAnalysis, UserPhysique } from './aiTypes';
import { buildAITrainingSnapshot, getPromptInputsFromSnapshot } from './aiTrainingSnapshot';
import { adjustClassificationForTrainingStress } from './trainingStress';

export type { AIAnalysis, UserProfile, UserPhysique } from './aiTypes';
export { buildProfessionalPrompt } from './aiPrompt';

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = true
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

const KIMI_REQUEST_TIMEOUT_MS = 45_000;
const KIMI_MAX_ATTEMPTS = 2;

function summarizeProviderError(text: string): string {
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message || text;
    return String(message).slice(0, 300);
  } catch {
    return text.replace(/\s+/g, ' ').trim().slice(0, 300);
  }
}

/**
 * Call Kimi API for professional analysis.
 */
export async function analyzeActivity(
  activity: StravaActivity,
  streams: Record<string, ActivityStream> | null,
  trainingProfile: TrainingProfile,
  locale: string = 'zh',
  physique?: UserPhysique,
  lthr?: number | null,
  maxHeartRate?: number | null,
  streamAnalysis?: string,
  classificationOverride?: ActivityClassification,
): Promise<AIAnalysis> {
  const apiKey = process.env.KIMI_API_KEY;

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }

  const classification = classificationOverride ?? adjustClassificationForTrainingStress(
    activity,
    trainingProfile,
    classifyActivity(
      activity,
      trainingProfile.paceZones,
      trainingProfile.estimatedPBs.reliability,
      lthr
    )
  );
  const snapshot = buildAITrainingSnapshot({
    activity,
    streams,
    trainingProfile,
    classification,
    physique,
    lthr,
    maxHeartRate,
    streamSummary: streamAnalysis,
  });
  const promptInputs = getPromptInputsFromSnapshot(snapshot);
  const prompt = buildProfessionalPrompt(
    promptInputs.activity,
    promptInputs.streams,
    promptInputs.trainingProfile,
    snapshot.classification,
    locale,
    snapshot.physique,
    snapshot.lthr,
    snapshot.streamSummary,
    snapshot.maxHeartRate,
  );

  // Retry on JSON parse failure (common on cold-start / network hiccup)
  let lastErrorMessage = '';
  for (let attempt = 1; attempt <= KIMI_MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), KIMI_REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'kimi-k2.6',
            messages: [
              {
                role: 'system',
                content: '你是一位国家级专业跑步教练，精通运动科学和训练周期化理论。你擅长分析训练数据，识别运动员的短板，并提供精准、可执行的训练建议。你的分析风格专业、直接、数据驱动，避免空洞的安慰性建议。' + (classification.isRace ? '特别注意：你正在分析一场比赛，不是日常训练。' : ''),
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.6,
            max_completion_tokens: 4096,
            response_format: { type: 'json_object' },
            thinking: {
              type: 'disabled'
            }
          }),
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const error = await response.text();
        const message = `Kimi request rejected (${response.status}): ${summarizeProviderError(error)}`;
        throw new AIProviderError(message, response.status, response.status >= 500);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from AI');
      }

      return parseAIResponse(content, activity, trainingProfile, classification, locale);
    } catch (e) {
      const timedOut = e instanceof Error && e.name === 'AbortError';
      const message = timedOut
        ? 'Kimi request timed out'
        : e instanceof Error
          ? e.message
          : 'Unknown AI provider error';
      lastErrorMessage = message;
      console.error(`[AI] Attempt ${attempt} failed:`, e);
      if (timedOut) {
        throw new AIProviderError(
          `Kimi analysis timed out after ${Math.round(KIMI_REQUEST_TIMEOUT_MS / 1000)} seconds`,
          undefined,
          true
        );
      }
      if (e instanceof AIProviderError && !e.retryable) {
        throw e;
      }
      if (attempt < KIMI_MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 750));
      } else {
        throw new AIProviderError(
          `Kimi analysis failed after ${KIMI_MAX_ATTEMPTS} attempts: ${lastErrorMessage}`,
          undefined,
          true
        );
      }
    }
  }

  throw new AIProviderError(`Kimi analysis failed: ${lastErrorMessage || 'unknown error'}`);
}
