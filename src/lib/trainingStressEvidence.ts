export const TRAINING_STRESS_EVIDENCE = {
  averageHeartRate: 'average heart rate raises current-session effort',
  loadDensity: 'activity load density raises current-session effort',
  volume: 'distance or duration raises total session cost',
  heatAndPace: 'heat and pace raise current-session effort',
} as const;

type TrainingStressEvidenceKey = keyof typeof TRAINING_STRESS_EVIDENCE;

const TRAINING_STRESS_EVIDENCE_ZH: Record<TrainingStressEvidenceKey, string> = {
  averageHeartRate: '平均心率抬高了本次训练强度',
  loadDensity: '单位时间训练负荷抬高了本次训练强度',
  volume: '距离或时长增加了本次训练的总体负荷',
  heatAndPace: '高温与本次配速共同抬高了单次训练强度',
};

export function getTrainingStressEvidenceLabel(
  evidence: string,
  language: string
): string | null {
  const entry = (Object.entries(TRAINING_STRESS_EVIDENCE) as Array<
    [TrainingStressEvidenceKey, string]
  >).find(([, value]) => value === evidence);

  if (!entry) return null;
  return language.startsWith('en') ? entry[1] : TRAINING_STRESS_EVIDENCE_ZH[entry[0]];
}
