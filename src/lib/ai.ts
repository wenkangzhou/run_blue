import type { ActivityStream, StravaActivity } from '@/types';
import { classifyActivity } from './trainingAnalysis';
import type { TrainingProfile } from './trainingAnalysis';
import { generateFallbackAnalysis } from './aiFallbackAnalysis';
import { buildProfessionalPrompt } from './aiPrompt';
import { parseAIResponse } from './aiResponseParser';
import type { AIAnalysis, UserPhysique } from './aiTypes';
import { buildAITrainingSnapshot, getPromptInputsFromSnapshot } from './aiTrainingSnapshot';

export type { AIAnalysis, UserProfile, UserPhysique } from './aiTypes';
export { buildProfessionalPrompt } from './aiPrompt';

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
  streamAnalysis?: string,
): Promise<AIAnalysis> {
  const apiKey = process.env.KIMI_API_KEY;

  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }

  const classification = classifyActivity(
    activity,
    trainingProfile.paceZones,
    trainingProfile.estimatedPBs.reliability,
    lthr
  );
  const snapshot = buildAITrainingSnapshot({
    activity,
    streams,
    trainingProfile,
    classification,
    physique,
    lthr,
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
  );

  // Retry on JSON parse failure (common on cold-start / network hiccup)
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout
      const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
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

      clearTimeout(timeoutId);
      if (!response.ok) {
        const error = await response.text();
        if (response.status >= 400 && response.status < 500) {
          console.error(`[AI] Kimi request rejected (${response.status}):`, error);
          return generateFallbackAnalysis(activity, trainingProfile, classification, locale);
        }
        throw new Error(`AI API error: ${error}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from AI');
      }

      return parseAIResponse(content, activity, trainingProfile, classification, locale);
    } catch (e) {
      console.error(`[AI] Attempt ${attempt} failed:`, e);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 1500));
      } else {
        // All attempts exhausted - fallback
        return generateFallbackAnalysis(activity, trainingProfile, classification, locale);
      }
    }
  }

  // Should never reach here, but satisfy TypeScript
  return generateFallbackAnalysis(activity, trainingProfile, classification, locale);
}
