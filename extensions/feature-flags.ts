export const FEATURE_FLAGS = {
  gambitLab: true,
  tacticsEngine: false,
  fsrsScheduling: false,
  criticalPositionTrainer: false,
  socraticMode: false,
  statsDashboard: false,
  weaknessFingerprint: false,
  pressureMode: false,
  deepPrepMode: false,
  calculationTrainer: false,
  masterGameShadowing: false,
  prophylaxisTrainer: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export const isEnabled = (flag: FeatureFlag) => FEATURE_FLAGS[flag];
