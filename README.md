# ☀️ TelarMonitor - Backend Simulador y Motor Telemétrico

Servicio backend independiente diseñado bajo **Clean Architecture (Arquitectura Limpia)** para la simulación física de radiación fotovoltaica, modelado de consumo residencial y transmisión de telemetría en tiempo real mediante **WebSockets (Socket.IO)** y **REST API**.

Este microservicio está completamente desacoplado del frontend de Next.js, permitiendo ser extraído a su propio repositorio de Git y desplegado de forma independiente en plataformas como **Railway**, **Render** o un clúster de **Docker**.

---

## 🏛️ Arquitectura del Proyecto

```
backend-simulator/
├── Dockerfile                   # Contenedor de producción multi-etapa
├── railway.json                 # Descriptor de despliegue para Railway
├── package.json                 # Dependencias independientes
├── tsconfig.json                # Configuración de TypeScript
├── .env.example                 # Variables de entorno modelo
└── src/
    ├── index.ts                 # Bootstrap y arranque del servidor
    ├── domain/                  # Lógica de negocio y modelos físicos puros
    │   ├── models/              # Modelos de dominio (HouseholdProfile, ReadingRecord, etc.)
    │   └── services/            # Motores matemáticos:
    │       ├── SolarPhysicsEngine.ts        # Gaussiana cenital, radiación solar y nubosidad
    │       └── HouseholdConsumptionEngine.ts # Cargas residenciales, picos mañana/noche
    ├── application/             # Casos de uso de la aplicación
    │   └── use-cases/
    │       ├── GenerateRealtimeReading.ts   # Generación de telemetría instantánea
    │       └── SeedHistoricalBatch.ts       # Generación por lotes de 7 y 30 días
    └── infrastructure/          # Adaptadores externos y framework
        ├── config/              # Validación de variables de entorno (Zod)
        ├── database/            # Conector de base de datos Supabase
        ├── http/                # Servidor Express y controladores REST
        │   ├── server.ts
        │   └── routes/
        │       ├── healthRoutes.ts
        │       └── simulationRoutes.ts
        └── websocket/           # Motor de Socket.IO para emisión en vivo
            └── socketManager.ts
```

---

## 🚀 Puesta en Marcha Local

### 1. Instalación de dependencias
Desde la carpeta raíz del simulador:
```bash
cd backend-simulator
npm install
```

### 2. Configurar variables de entorno
Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```

Configura tus credenciales de Supabase:
```env
PORT=4000
NODE_ENV=development
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key
SIMULATION_INTERVAL_MS=3000
DEFAULT_HOUSEHOLD_ID=9d46fe47-51a8-42ac-b02b-f6c2ec3ed4c7
AUTO_START_REALTIME=false
```

### 3. Ejecutar en modo desarrollo
```bash
npm run dev
```

El servidor estará escuchando en:
- **HTTP REST**: `http://localhost:4000`
- **WebSockets**: `ws://localhost:4000`

---

## 📡 Endpoints de la API REST

| Método | Endpoint | Descripción | Body (JSON) |
|---|---|---|---|
| `GET` | `/health` | Chequeo de salud del servicio y métricas de simulación | Ninguno |
| `GET` | `/api/simulation/status` | Estado actual de la simulación y hogares activos | Ninguno |
| `POST` | `/api/simulation/start` | Inicia la emisión telemétrica en vivo | `{"intervalMs": 3000}` (Opcional) |
| `POST` | `/api/simulation/stop` | Pausa la simulación en vivo | Ninguno |
| `POST` | `/api/simulation/seed` | Genera e inserta datos históricos directamente en Supabase | `{"days": 30, "householdId": "...", "cleanBefore": true}` |
| `POST` | `/api/simulation/clean` | Limpia lecturas de un hogar o de toda la base de datos | `{"householdId": "..."}` |

---

## 🔌 Eventos WebSocket (Socket.IO)

### Conexión
```javascript
import { io } from 'socket.io-client';
const socket = io('http://localhost:4000');

// Suscribirse a un hogar específico
socket.emit('household:subscribe', '9d46fe47-51a8-42ac-b02b-f6c2ec3ed4c7');

// Escuchar telemetría en tiempo real
socket.on('telemetry:tick', (data) => {
  console.log('Nueva lectura:', data);
  // data: { timestamp, consumptionKw, solarKw, netBalanceKw, isExporting, solarRatio, gridRatio }
});

// Escuchar cambios de estado
socket.on('simulation:status', (status) => {
  console.log('Estado simulador:', status);
});
```

---

## ☁️ Despliegue en Railway

El proyecto incluye `Dockerfile` multi-etapa y `railway.json`:

1. Crea un nuevo proyecto en [Railway.app](https://railway.app).
2. Conecta el repositorio (o la carpeta `backend-simulator`).
3. Agrega las variables de entorno en el panel de Railway (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORT=4000`).
4. Railway detectará automáticamente el `Dockerfile` y desplegará el contenedor con endpoint de salud `/health`.
