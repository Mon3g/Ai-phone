import { verifySupabaseAuth } from '../utils/auth.js';

function ensureSupabaseConfigured(supabase) {
  if (!supabase) {
    const error = new Error('Supabase not configured');
    error.statusCode = 503;
    throw error;
  }
}

export class PersonaService {
  constructor({ supabase, logger, openAiRealtime }) {
    this.supabase = supabase;
    this.logger = logger;
    this.openAiRealtime = openAiRealtime;
  }

  async listPersonas() {
    ensureSupabaseConfigured(this.supabase);
    const { data, error } = await this.supabase.from('personas').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async createPersona(request, payload) {
    ensureSupabaseConfigured(this.supabase);
    const { user, error: authError } = await verifySupabaseAuth(request, this.supabase);
    if (authError || !user) {
      const error = new Error('unauthenticated');
      error.statusCode = 401;
      throw error;
    }

    const enrichedPayload = { ...payload, user_id: user.id };
    const res = await this.supabase.from('personas').insert([enrichedPayload]).select();
    if (res.error) throw res.error;
    const persona = Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
    this.logger?.info({ personaId: persona?.id, userId: user.id }, 'Persona created');
    return persona;
  }

  async updatePersona(request, id, payload) {
    ensureSupabaseConfigured(this.supabase);
    const { user, error: authError } = await verifySupabaseAuth(request, this.supabase);
    if (authError || !user) {
      const error = new Error('unauthenticated');
      error.statusCode = 401;
      throw error;
    }

    const { data: existing, error } = await this.supabase.from('personas').select('user_id').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!existing || existing.user_id !== user.id) {
      const err = new Error('forbidden');
      err.statusCode = 403;
      throw err;
    }

    const { data, error: updateError } = await this.supabase
      .from('personas')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (updateError) throw updateError;
    this.logger?.info({ personaId: id, userId: user.id }, 'Persona updated');
    return data;
  }

  async activatePersona(request, id) {
    ensureSupabaseConfigured(this.supabase);
    const { user, error: authError } = await verifySupabaseAuth(request, this.supabase);
    if (authError || !user) {
      const error = new Error('unauthenticated');
      error.statusCode = 401;
      throw error;
    }

    const { data: existing, error } = await this.supabase.from('personas').select('user_id').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!existing || existing.user_id !== user.id) {
      const err = new Error('forbidden');
      err.statusCode = 403;
      throw err;
    }

    const deactivate = await this.supabase.from('personas').update({ is_active: false }).eq('is_active', true).eq('user_id', user.id);
    if (deactivate.error) throw deactivate.error;

    const { data, error: activateError } = await this.supabase
      .from('personas')
      .update({ is_active: true })
      .eq('id', id)
      .select()
      .single();
    if (activateError) throw activateError;
    this.logger?.info({ personaId: id, userId: user.id }, 'Persona activated');
    return data;
  }

  async getActivePersona(request) {
    ensureSupabaseConfigured(this.supabase);
    const { user, error: authError } = await verifySupabaseAuth(request, this.supabase);
    if (authError || !user) {
      const error = new Error('unauthenticated');
      error.statusCode = 401;
      throw error;
    }

    const { data, error } = await this.supabase
      .from('personas')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    this.logger?.info({ personaId: data?.id, userId: user.id }, 'Active persona retrieved');
    return data;
  }

  async generatePreview(id) {
    ensureSupabaseConfigured(this.supabase);
    if (!this.openAiRealtime) {
      const error = new Error('OpenAI realtime integration not configured');
      error.statusCode = 503;
      throw error;
    }

    const { data: persona, error } = await this.supabase.from('personas').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!persona) {
      const err = new Error('persona not found');
      err.statusCode = 404;
      throw err;
    }

    const preview = await this.openAiRealtime.createPreviewAudio({ persona });
    this.logger?.info({ personaId: id }, 'Persona preview generated');
    return preview;
  }
}

export function createPersonaService({ supabase, logger, openAiRealtime }) {
  return new PersonaService({ supabase, logger, openAiRealtime });
}

