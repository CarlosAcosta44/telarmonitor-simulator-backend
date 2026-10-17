import { createApp } from './infrastructure/http/server.js';
import { config } from './infrastructure/config/env.js';

async function bootstrap() {
  const { httpServer, socketManager } = createApp();

  // Load households into memory
  await socketManager.refreshProfiles();

  // If auto start is configured
  if (config.AUTO_START_REALTIME) {
    await socketManager.startSimulation();
  }

  httpServer.listen(config.PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║   ☀️  TELAR MONITOR - SIMULATOR BACKEND SERVICE              ║
╠════════════════════════════════════════════════════════════════╣
║  • HTTP Server:        http://localhost:${config.PORT}                   ║
║  • Healthcheck:        http://localhost:${config.PORT}/health             ║
║  • WebSocket Server:   ws://localhost:${config.PORT}                     ║
║  • Mode:               ${config.NODE_ENV.padEnd(28)}║
║  • Target Supabase:    ${config.SUPABASE_URL.padEnd(28)}║
╚════════════════════════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Process] Apagando servidor simulador elegantemente...');
    socketManager.stopSimulation();
    httpServer.close(() => {
      console.log('[Process] Servidor cerrado. Saliendo.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Error fatal iniciando backend simulador:', err);
  process.exit(1);
});
