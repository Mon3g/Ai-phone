import { createClient } from '@supabase/supabase-js';

export function createSupabaseClient({ url, serviceKey }, logger) {
  if (!url || !serviceKey) {
    logger?.warn('Supabase service key or URL not provided; persona APIs will be disabled.');
    return null;
  }

  return createClient(url, serviceKey);
}
