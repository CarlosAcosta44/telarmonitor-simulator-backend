import { HouseholdProfile, ReadingRecord, TelemetryTickPayload } from '../../domain/models/SimulationProfile.js';
import { SolarPhysicsEngine } from '../../domain/services/SolarPhysicsEngine.js';
import { HouseholdConsumptionEngine } from '../../domain/services/HouseholdConsumptionEngine.js';

export interface GenerateRealtimeReadingResult {
  records: ReadingRecord[];
  payload: TelemetryTickPayload;
}

export class GenerateRealtimeReading {
  public execute(profile: HouseholdProfile, timestamp: Date = new Date()): GenerateRealtimeReadingResult {
    const consumptionKw = HouseholdConsumptionEngine.calculateConsumptionKw(
      timestamp,
      profile.baseLoadKw ?? 0.25,
      profile.peakMultiplier ?? 1.0
    );

    const solarKw = SolarPhysicsEngine.calculateSolarPowerKw(
      timestamp,
      profile.capacityKwp,
      profile.hasSolar
    );

    const netBalanceKw = profile.hasSolar ? Number((solarKw - consumptionKw).toFixed(2)) : -consumptionKw;
    const isExporting = profile.hasSolar && solarKw > consumptionKw;

    const solarRatio = profile.hasSolar && consumptionKw > 0
      ? Math.min(100, Math.round((solarKw / consumptionKw) * 100))
      : (profile.hasSolar && solarKw > 0 ? 100 : 0);
    const gridRatio = Math.max(0, 100 - solarRatio);

    const isoString = timestamp.toISOString();

    const records: ReadingRecord[] = [
      {
        household_id: profile.id,
        reading_type: 'consumption',
        value_kwh: consumptionKw,
        recorded_at: isoString,
      },
    ];

    if (profile.hasSolar) {
      records.push({
        household_id: profile.id,
        reading_type: 'solar_generation',
        value_kwh: solarKw,
        recorded_at: isoString,
      });
    }

    const payload: TelemetryTickPayload = {
      timestamp: isoString,
      householdId: profile.id,
      hasSolar: profile.hasSolar,
      consumptionKw,
      solarKw,
      netBalanceKw,
      isExporting,
      solarRatio,
      gridRatio,
    };

    return { records, payload };
  }
}
