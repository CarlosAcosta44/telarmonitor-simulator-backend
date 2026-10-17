export interface HouseholdProfile {
  id: string;
  name: string;
  capacityKwp: number;
  hasSolar: boolean;
  baseLoadKw?: number;
  peakMultiplier?: number;
}

export type ReadingType = 'consumption' | 'solar_generation';

export interface ReadingRecord {
  household_id: string;
  reading_type: ReadingType;
  value_kwh: number;
  recorded_at: string;
  metadata?: Record<string, unknown>;
}

export interface TelemetryTickPayload {
  timestamp: string;
  householdId: string;
  hasSolar: boolean;
  consumptionKw: number;
  solarKw: number;
  netBalanceKw: number;
  isExporting: boolean;
  gridRatio: number;
  solarRatio: number;
}
