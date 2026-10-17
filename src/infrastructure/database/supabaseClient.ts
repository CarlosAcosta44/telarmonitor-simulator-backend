import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

const keyToUse = config.SUPABASE_SERVICE_ROLE_KEY && config.SUPABASE_SERVICE_ROLE_KEY.length > 10
  ? config.SUPABASE_SERVICE_ROLE_KEY
  : config.SUPABASE_ANON_KEY;

export const supabase: SupabaseClient = createClient(config.SUPABASE_URL, keyToUse, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
