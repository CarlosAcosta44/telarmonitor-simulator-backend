import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000').transform((v) => parseInt(v, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SUPABASE_URL: z.string().url().default('https://lonuptruktezinruxwya.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().default('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvbnVwdHJ1a3RlemlucnV4d3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzNjYwOTYsImV4cCI6MjA1NTk0MjA5Nn0.7J3J6QG1w9hE3mQ6qT8v0Z4s8X6k5m2Y1a9b7c8d9e0'),
  SIMULATION_INTERVAL_MS: z.string().default('3000').transform((v) => parseInt(v, 10)),
  DEFAULT_HOUSEHOLD_ID: z.string().uuid().default('9d46fe47-51a8-42ac-b02b-f6c2ec3ed4c7'),
  AUTO_START_REALTIME: z.string().default('false').transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().default('*'),
});

export const config = envSchema.parse(process.env);
