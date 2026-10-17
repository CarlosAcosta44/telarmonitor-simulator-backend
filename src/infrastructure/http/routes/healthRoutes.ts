import { Router, Request, Response } from 'express';
import { SocketManager } from '../../websocket/socketManager.js';

export function createHealthRoutes(socketManager: SocketManager): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const status = socketManager.getStatus();
    res.status(200).json({
      status: 'healthy',
      service: 'telar-simulator-backend',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      simulation: {
        active: status.isSimulating,
        intervalMs: status.intervalMs,
        activeHouseholds: status.activeHouseholdsCount,
        connectedClients: status.connectedClients,
      },
    });
  });

  return router;
}
