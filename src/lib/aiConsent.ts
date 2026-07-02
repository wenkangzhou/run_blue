export const AI_DATA_CONSENT_STORAGE_KEY = 'runblue_ai_data_consent_v1';

export type AIDataConsent = 'accepted' | 'declined' | 'unknown';

export function parseAIDataConsent(value: string | null | undefined): AIDataConsent {
  return value === 'accepted' || value === 'declined' ? value : 'unknown';
}

export function getAIDataConsent(): AIDataConsent {
  if (typeof window === 'undefined') return 'unknown';
  return parseAIDataConsent(window.localStorage.getItem(AI_DATA_CONSENT_STORAGE_KEY));
}

export function setAIDataConsent(consent: Exclude<AIDataConsent, 'unknown'>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AI_DATA_CONSENT_STORAGE_KEY, consent);
}

export function clearAIDataConsent(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(AI_DATA_CONSENT_STORAGE_KEY);
}
