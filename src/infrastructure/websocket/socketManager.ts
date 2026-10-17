import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { HouseholdProfile, TelemetryTickPayload } from '../../domain/models/SimulationProfile.js';
import { GenerateRealtimeReading } from '../../application/use-cases/GenerateRealtimeReading.js';
import { supabase } from '../database/supabaseClient.js';
import { config } from '../config/env.js';

export class SocketManager {
  private io: SocketIOServer;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isSimulating: boolean = false;
  private activeProfiles: Map<string, HouseholdProfile> = new Map();
  private lastTickPayloads: Map<string, TelemetryTickPayload> = new Map();
  private generator = new GenerateRealtimeReading();

  constructor(server: HttpServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: config.CORS_ORIGIN,
        methods: ['GET', 'POST'],
      },
    });

    this.setupSocketEvents();
  }

  private setupSocketEvents(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[WebSocket] Cliente conectado: ${socket.id}`);

      // Send initial status and cached payloads
      socket.emit('simulation:status', this.getStatus());
      for (const payload of this.lastTickPayloads.values()) {
        socket.emit('telemetry:tick', payload);
      }

      // Room subscription by householdId
      socket.on('household:subscribe', (householdId: string) => {
        socket.join(householdId);
        console.log(`[WebSocket] Cliente ${socket.id} suscrito a hogar: ${householdId}`);
        const lastPayload = this.lastTickPayloads.get(householdId);
        if (lastPayload) {
          socket.emit('telemetry:tick', lastPayload);
        }
      });

      socket.on('disconnect', () => {
        console.log(`[WebSocket] Cliente desconectado: ${socket.id}`);
      });
    });
  }

  public async startSimulation(intervalMs: number = config.SIMULATION_INTERVAL_MS): Promise<boolean> {
    if (this.isSimulating) {
      return true;
    }

    // Refresh active profiles from database
    await this.refreshProfiles();

    this.isSimulating = true;
    console.log(`[Simulator] Iniciando bucle de simulación cada ${intervalMs}ms para ${this.activeProfiles.size} hogares.`);

    this.intervalTimer = setInterval(() => {
      this.tick();
    }, intervalMs);

    this.io.emit('simulation:status', this.getStatus());
    return true;
  }

  public stopSimulation(): boolean {
    if (!this.isSimulating) {
      return false;
    }

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    this.isSimulating = false;
    console.log('[Simulator] Simulación en vivo pausada.');
    this.io.emit('simulation:status', this.getStatus());
    return true;
  }

  public async refreshProfiles(): Promise<void> {
    try {
      const { data: households, error } = await supabase
        .from('households')
        .select('id, name, capacity_kwp');

      if (!error && households && households.length > 0) {
        this.activeProfiles.clear();
        for (const h of households) {
          const cap = Number(h.capacity_kwp) || 0;
          this.activeProfiles.set(h.id, {
            id: h.id,
            name: h.name,
            capacityKwp: cap,
            hasSolar: cap > 0,
            baseLoadKw: 0.25,
            peakMultiplier: 1.0,
          });
        }
      } else {
        // Fallback default profile
        this.activeProfiles.set(config.DEFAULT_HOUSEHOLD_ID, {
          id: config.DEFAULT_HOUSEHOLD_ID,
          name: 'Hogar Acosta (Default)',
          capacityKwp: 4.2,
          hasSolar: true,
        });
      }
    } catch (err) {
      console.error('[Simulator] Error al consultar hogares:', err);
    }
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const allRecordsToPersist = [];

    for (const profile of this.activeProfiles.values()) {
      const { records, payload } = this.generator.execute(profile, now);
      this.lastTickPayloads.set(profile.id, payload);
      allRecordsToPersist.push(...records);

      // Emit to room and global
      this.io.to(profile.id).emit('telemetry:tick', payload);
      this.io.emit('reading:new', payload);
    }

    // Persist to Supabase in background
    if (allRecordsToPersist.length > 0) {
      supabase
        .from('energy_readings')
        .insert(allRecordsToPersist)
        .then(
          ({ error }) => {
            if (error) {
              console.warn('[Simulator] Error al guardar lecturas en Supabase:', error.message);
            }
          },
          (err: unknown) => {
            console.error('[Simulator] Error en persistencia:', err);
          }
        );
    }
  }

  public getStatus() {
    return {
      isSimulating: this.isSimulating,
      intervalMs: config.SIMULATION_INTERVAL_MS,
      activeHouseholdsCount: this.activeProfiles.size,
      connectedClients: this.io.engine.clientsCount,
      households: Array.from(this.activeProfiles.values()),
    };
  }

  public getLastPayload(householdId: string): TelemetryTickPayload | undefined {
    return this.lastTickPayloads.get(householdId);
  }
}
