import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { createServer, Server as HttpServer } from 'http';
import { SocketManager } from '../websocket/socketManager.js';
import { createHealthRoutes } from './routes/healthRoutes.js';
import { createSimulationRoutes } from './routes/simulationRoutes.js';
import { config } from '../config/env.js';

export interface AppContext {
  app: Express;
  httpServer: HttpServer;
  socketManager: SocketManager;
}

export function createApp(): AppContext {
  const app = express();
  const httpServer = createServer(app);

  // Global Middlewares
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json());

  // WebSocket Manager
  const socketManager = new SocketManager(httpServer);

  // Mount API Routes
  app.use('/health', createHealthRoutes(socketManager));
  app.use('/api/simulation', createSimulationRoutes(socketManager));

  // Root Welcome route
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'TelarMonitor Simulator & Telemetry API',
      version: '1.0.0',
      architecture: 'Clean Architecture + WebSockets',
      endpoints: {
        health: 'GET /health',
        simulationStatus: 'GET /api/simulation/status',
        startSimulation: 'POST /api/simulation/start',
        stopSimulation: 'POST /api/simulation/stop',
        seedHistorical: 'POST /api/simulation/seed',
        cleanReadings: 'POST /api/simulation/clean',
      },
    });
  });

  return { app, httpServer, socketManager };
}
