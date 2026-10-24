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
  private lastPersistTime: number = 0;
  private lastProfileRefreshTime: number = 0;
  private readonly persistIntervalMs: number = (config.DB_PERSIST_INTERVAL_MINUTES || 5) * 60 * 1000;

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
    this.lastPersistTime = 0; // Trigger persistence on first tick
    this.lastProfileRefreshTime = Date.now();
    console.log(`[Simulator] Iniciando bucle de simulación cada ${intervalMs}ms (Persistencia en BD cada ${config.DB_PERSIST_INTERVAL_MINUTES} min) para ${this.activeProfiles.size} hogares.`);

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
      // 1. Fetch valid households
      const { data: households, error: hError } = await supabase
        .from('households')
        .select('id, name, capacity_kwp');

      // 2. Fetch existing household memberships to filter out orphan households
      const { data: members, error: mError } = await supabase
        .from('household_members')
        .select('household_id');

      if (!hError && households && households.length > 0) {
        // Build set of household IDs that have at least one active user
        const memberHouseholdIds = new Set((members || []).map((m: { household_id: string }) => m.household_id));
        const validHouseholds = households.filter((h) => memberHouseholdIds.has(h.id));
        const validIds = new Set(validHouseholds.map((h) => h.id));

        // Purge memory of households that no longer exist or are orphans
        for (const existingId of this.activeProfiles.keys()) {
          if (!validIds.has(existingId)) {
            console.log(`[Simulator] Hogar ${existingId} no válido o huérfano. Desvinculando del simulador.`);
            this.activeProfiles.delete(existingId);
            this.lastTickPayloads.delete(existingId);
          }
        }

        // Add or update active profiles
        for (const h of validHouseholds) {
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
      } else if (!hError && households && households.length === 0) {
        this.activeProfiles.clear();
        this.lastTickPayloads.clear();
      }
    } catch (err) {
      console.error('[Simulator] Error al consultar hogares:', err);
    }
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const nowMs = now.getTime();

    // Periodically sync profiles every 60 seconds in case a household was deleted or created
    if (nowMs - this.lastProfileRefreshTime >= 60000) {
      this.lastProfileRefreshTime = nowMs;
      this.refreshProfiles().catch((err) =>
        console.warn('[Simulator] Error en refresco periódico de perfiles:', err)
      );
    }

    // High-frequency live WebSocket broadcast (every 3 seconds)
    for (const profile of this.activeProfiles.values()) {
      const { payload } = this.generator.execute(profile, now);
      this.lastTickPayloads.set(profile.id, payload);

      // Emit to room and global
      this.io.to(profile.id).emit('telemetry:tick', payload);
      this.io.emit('reading:new', payload);
    }

    // Throttled persistence to database (default: every 5 minutes)
    // Prevents database bloat while maintaining realistic historical graphs
    const shouldPersist = nowMs - this.lastPersistTime >= this.persistIntervalMs;

    if (shouldPersist && this.activeProfiles.size > 0) {
      this.lastPersistTime = nowMs;

      // Persist per household in isolation so an invalid household never breaks other households
      for (const profile of this.activeProfiles.values()) {
        const { records } = this.generator.execute(profile, now);
        supabase
          .from('energy_readings')
          .insert(records)
          .then(
            ({ error }) => {
              if (error) {
                console.warn(`[Simulator] Error al guardar lecturas para ${profile.name} (${profile.id}):`, error.message);
                // Foreign key violation: household was deleted from database
                if (error.code === '23503' || error.message.includes('foreign key') || error.message.includes('violates')) {
                  console.warn(`[Simulator] Removiendo hogar inexistente ${profile.id} de la memoria.`);
                  this.activeProfiles.delete(profile.id);
                  this.lastTickPayloads.delete(profile.id);
                }
              }
            },
            (err: unknown) => {
              console.error(`[Simulator] Excepción en persistencia para ${profile.id}:`, err);
            }
          );
      }
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
