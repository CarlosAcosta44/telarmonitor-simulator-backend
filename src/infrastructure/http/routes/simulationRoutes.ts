import { Router, Request, Response } from 'express';
import { SocketManager } from '../../websocket/socketManager.js';
import { SeedHistoricalBatch } from '../../../application/use-cases/SeedHistoricalBatch.js';
import { supabase } from '../../database/supabaseClient.js';
import { config } from '../../config/env.js';

export function createSimulationRoutes(socketManager: SocketManager): Router {
  const router = Router();
  const seeder = new SeedHistoricalBatch();

  // POST /api/simulation/start
  router.post('/start', async (req: Request, res: Response) => {
    const intervalMs = req.body?.intervalMs ? Number(req.body.intervalMs) : config.SIMULATION_INTERVAL_MS;
    await socketManager.startSimulation(intervalMs);
    res.json({
      success: true,
      message: `Simulación en vivo iniciada con intervalo de ${intervalMs}ms`,
      status: socketManager.getStatus(),
    });
  });

  // POST /api/simulation/stop
  router.post('/stop', (_req: Request, res: Response) => {
    socketManager.stopSimulation();
    res.json({
      success: true,
      message: 'Simulación en vivo pausada',
      status: socketManager.getStatus(),
    });
  });

  // GET /api/simulation/status
  router.get('/status', (_req: Request, res: Response) => {
    res.json({
      success: true,
      status: socketManager.getStatus(),
    });
  });

  // POST /api/simulation/seed
  router.post('/seed', async (req: Request, res: Response) => {
    try {
      const days = req.body?.days ? Number(req.body.days) : 30;
      const cleanBefore = Boolean(req.body?.cleanBefore);
      const householdId = req.body?.householdId || config.DEFAULT_HOUSEHOLD_ID;

      // 1. Fetch household profile
      const { data: household, error: hError } = await supabase
        .from('households')
        .select('*')
        .eq('id', householdId)
        .single();

      if (hError || !household) {
        return res.status(404).json({
          success: false,
          error: `Hogar con ID ${householdId} no encontrado`,
        });
      }

      const cap = Number(household.capacity_kwp) || 0;
      const profile = {
        id: household.id,
        name: household.name,
        capacityKwp: cap,
        hasSolar: cap > 0,
        baseLoadKw: 0.25,
        peakMultiplier: 1.0,
      };

      // 2. Clean if requested
      if (cleanBefore) {
        await supabase
          .from('energy_readings')
          .delete()
          .eq('household_id', profile.id);
      }

      // 3. Generate batch records
      const records = seeder.execute({
        days,
        intervalMinutes: 15,
        profile,
      });

      // 4. Batch insert into Supabase in chunks of 500
      const BATCH_SIZE = 500;
      let insertedCount = 0;

      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const chunk = records.slice(i, i + BATCH_SIZE);
        const { error: insError } = await supabase
          .from('energy_readings')
          .insert(chunk);

        if (insError) {
          throw new Error(`Error en lote ${i}: ${insError.message}`);
        }
        insertedCount += chunk.length;
      }

      res.json({
        success: true,
        message: `Sembrado de ${days} días completado exitosamente`,
        household: profile.name,
        hasSolar: profile.hasSolar,
        capacityKwp: profile.capacityKwp,
        totalRecordsInserted: insertedCount,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // POST /api/simulation/clean
  router.post('/clean', async (req: Request, res: Response) => {
    try {
      const householdId = req.body?.householdId;
      let query = supabase.from('energy_readings').delete();

      if (householdId) {
        query = query.eq('household_id', householdId);
      } else {
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { error } = await query;
      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      res.json({
        success: true,
        message: householdId
          ? `Lecturas eliminadas para el hogar ${householdId}`
          : 'Todas las lecturas de la base de datos han sido eliminadas',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  return router;
}
