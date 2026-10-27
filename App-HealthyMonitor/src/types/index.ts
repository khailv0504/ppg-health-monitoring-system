export interface HealthData {
  bpm: number;
  spo2: number;
  status: string;
  timestamp?: number;
}

export interface HistoryRecord {
  id: string;
  bpm: number;
  spo2: number;
  timestamp: number;
}

export interface HealthThresholds {
  maxBpm: number;
  minSpo2: number;
}

export interface AlertRecord {
  id: string;
  type: 'bpm' | 'spo2';
  value: number;
  threshold: number;
  timestamp: number;
  message: string;
}

export interface UserProfile {
  name: string;
  age: string;
  height: string;
  weight: string;
  emergencyPhone?: string;
}

export type AnalysisLevel =
  | 'unconfigured'
  | 'idle'
  | 'normal'
  | 'warning'
  | 'critical';

export interface HealthAnalysis {
  level: AnalysisLevel;
  title: string;
  message: string;
  color: string;
}