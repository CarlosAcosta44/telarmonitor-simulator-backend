/**
 * Motor de modelado de curva de carga y consumo residencial.
 * Simula el comportamiento típico de un hogar colombiano con:
 * - Carga base nocturna (refrigerador, electrónica pasiva, standby)
 * - Pico matutino (ducha eléctrica, electrodomésticos de desayuno, 06:30 - 08:30)
 * - Demanda diurna moderada (teletrabajo, iluminación parcial)
 * - Pico vespertino / nocturno (cocina, televisores, iluminación general, 18:30 - 22:00)
 */
export class HouseholdConsumptionEngine {
  /**
   * Calcula el consumo instantáneo en kW para una hora determinada.
   * @param date Fecha/hora de la medición
   * @param baseLoad Carga base mínima en kW (default 0.25 kW)
   * @param peakMultiplier Multiplicador de potencia según tamaño del hogar
   */
  public static calculateConsumptionKw(
    date: Date,
    baseLoad: number = 0.25,
    peakMultiplier: number = 1.0
  ): number {
    const hour = date.getHours() + date.getMinutes() / 60;
    let expectedKw = baseLoad;

    if (hour >= 0 && hour < 6.0) {
      // Madrugada: carga base con pequeñas fluctuaciones de compresores
      expectedKw = baseLoad + Math.sin(hour) * 0.05 + Math.random() * 0.08;
    } else if (hour >= 6.0 && hour < 9.0) {
      // Pico mañana (despertar, cafeteras, calentadores)
      const morningPeak = Math.exp(-Math.pow(hour - 7.5, 2) / (2 * Math.pow(0.8, 2)));
      expectedKw = baseLoad + morningPeak * (1.6 * peakMultiplier) + Math.random() * 0.2;
    } else if (hour >= 9.0 && hour < 12.0) {
      // Media mañana
      expectedKw = baseLoad + 0.45 * peakMultiplier + Math.random() * 0.15;
    } else if (hour >= 12.0 && hour < 14.5) {
      // Almuerzo
      expectedKw = baseLoad + 0.85 * peakMultiplier + Math.random() * 0.25;
    } else if (hour >= 14.5 && hour < 18.0) {
      // Tarde
      expectedKw = baseLoad + 0.5 * peakMultiplier + Math.random() * 0.15;
    } else if (hour >= 18.0 && hour < 22.5) {
      // Pico noche (luces, TV, entretenimiento, aire o cocción)
      const eveningPeak = Math.exp(-Math.pow(hour - 20.0, 2) / (2 * Math.pow(1.2, 2)));
      expectedKw = baseLoad + eveningPeak * (2.1 * peakMultiplier) + Math.random() * 0.35;
    } else {
      // Fin de la noche (22:30 a 24:00)
      expectedKw = baseLoad + 0.3 * peakMultiplier + Math.random() * 0.1;
    }

    return Math.max(0.1, Number(expectedKw.toFixed(2)));
  }
}
