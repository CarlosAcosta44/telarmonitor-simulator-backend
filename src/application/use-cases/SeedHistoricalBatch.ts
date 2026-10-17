import { HouseholdProfile, ReadingRecord } from '../../domain/models/SimulationProfile.js';
import { SolarPhysicsEngine } from '../../domain/services/SolarPhysicsEngine.js';
import { HouseholdConsumptionEngine } from '../../domain/services/HouseholdConsumptionEngine.js';

export interface SeedBatchOptions {
  days: number;
  intervalMinutes?: number;
  profile: HouseholdProfile;
  endDate?: Date;
}

export class SeedHistoricalBatch {
  public execute(options: SeedBatchOptions): ReadingRecord[] {
    const { days, intervalMinutes = 15, profile, endDate = new Date() } = options;
    const records: ReadingRecord[] = [];

    const totalIntervals = (days * 24 * 60) / intervalMinutes;
    const startTimeMs = endDate.getTime() - totalIntervals * intervalMinutes * 60 * 1000;

    for (let i = 0; i < totalIntervals; i++) {
      const pointTime = new Date(startTimeMs + i * intervalMinutes * 60 * 1000);
      const isoTime = pointTime.toISOString();

      const consumptionKw = HouseholdConsumptionEngine.calculateConsumptionKw(
        pointTime,
        profile.baseLoadKw ?? 0.25,
        profile.peakMultiplier ?? 1.0
      );

      records.push({
        household_id: profile.id,
        reading_type: 'consumption',
        value_kwh: consumptionKw,
        recorded_at: isoTime,
      });

      if (profile.hasSolar) {
        // Daily weather variation: some days have slight clouds
        const daySeed = Math.sin(pointTime.getDate() * 1.5);
        const cloudFactor = daySeed > 0.6 ? 0.35 : 0.08;

        const solarKw = SolarPhysicsEngine.calculateSolarPowerKw(
          pointTime,
          profile.capacityKwp,
          profile.hasSolar,
          cloudFactor
        );

        records.push({
          household_id: profile.id,
          reading_type: 'solar_generation',
          value_kwh: solarKw,
          recorded_at: isoTime,
        });
      }
    }

    return records;
  }
}
