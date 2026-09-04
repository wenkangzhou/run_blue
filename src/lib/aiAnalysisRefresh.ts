import type { AIDataConsent } from './aiConsent';

interface PreserveAnalysisAfterRetryInput {
  force: boolean;
  hasPreviousAnalysis: boolean;
  consentStatus: AIDataConsent;
  analysisSource: 'claude-mcp' | 'kimi' | 'fallback';
  analysisError?: string;
}

export function shouldPreserveAnalysisAfterRetry({
  force,
  hasPreviousAnalysis,
  consentStatus,
  analysisSource,
  analysisError,
}: PreserveAnalysisAfterRetryInput): boolean {
  return force
    && hasPreviousAnalysis
    && consentStatus === 'accepted'
    && analysisSource === 'fallback'
    && Boolean(analysisError);
}
