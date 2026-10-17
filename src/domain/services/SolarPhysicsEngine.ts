/**
 * Motor físico para el cálculo de generación fotovoltaica simulada.
 * Modela el ciclo solar diario mediante campana gaussiana, ángulo cenital
 * y fluctuaciones meteorológicas estocásticas (nubosidad).
 */
export class SolarPhysicsEngine {
  /**
   * Calcula la potencia instantánea generada en kW para una hora y fecha determinadas.
   * @param date Fecha/hora de la medición
   * @param capacityKwp Capacidad pico instalada en kWp
   * @param hasSolar Booleano si el hogar cuenta o no con instalación solar
   * @param cloudFactor Factor de nubosidad opcional (0 = despejado, 1 = tormenta densa)
   */
  public static calculateSolarPowerKw(
    date: Date,
    capacityKwp: number,
    hasSolar: boolean = true,
    cloudFactor: number = 0.1
  ): number {
    if (!hasSolar || capacityKwp <= 0) {
      return 0;
    }

    const hour = date.getHours() + date.getMinutes() / 60;

    // Horas de radiación útil en Colombia (Aprox. 05:45 a 18:15)
    if (hour < 6.0 || hour > 18.0) {
      return 0;
    }

    // Cenit solar alrededor de las 12:30 PM (12.5)
    const zenith = 12.5;
    const spread = 2.4; // Dispersión de la campana

    // Ecuación Gaussiana normalizada
    const bellCurve = Math.exp(-Math.pow(hour - zenith, 2) / (2 * Math.pow(spread, 2)));

    // Máximo factor de rendimiento según eficiencia de inversor y temperatura (~85%)
    const maxEfficiency = 0.85;
    const theoreticalMax = capacityKwp * maxEfficiency;

    // Ruido atmosférico estocástico (nubes pasajeras)
    const atmosphericNoise = 1 - (Math.random() * cloudFactor);

    const generation = theoreticalMax * bellCurve * atmosphericNoise;
    return Math.max(0, Number(generation.toFixed(2)));
  }
}
