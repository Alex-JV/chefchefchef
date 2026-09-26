// Backend Supabase : base partagée, temps réel, photos, fonction Claude.
import { TABLES } from './tables.js';
import { uuid } from '../lib/uuid.js';

export function createSupabaseBackend(config) {
  const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  let channel = null;

  async function hasSession() {
    const { data } = await client.auth.getSession();
    return !!data.session;
  }

  async function signIn(password) {
    const { error } = await client.auth.signInWithPassword({ email: config.AUTH_EMAIL, password });
    if (error) {
      const msg = /invalid login/i.test(error.message) ? 'Mot de passe incorrect (ou compte partagé pas encore créé, voir DEPLOY.md).' : error.message;
      return { ok: false, error: msg };
    }
    return { ok: true };
  }

  async function signOut() {
    if (channel) { await client.removeChannel(channel); channel = null; }
    await client.auth.signOut();
  }

  async function loadAll() {
    const out = {};
    await Promise.all(TABLES.map(async (t) => {
      const { data, error } = await client.from(t).select('*').order('created_at', { ascending: true }).limit(5000);
      if (error) throw new Error(`${t} : ${error.message}`);
      out[t] = data || [];
    }));
    return out;
  }

  async function insert(table, row) {
    const { data, error } = await client.from(table).insert(row).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  async function insertMany(table, rows) {
    if (!rows.length) return [];
    const { data, error } = await client.from(table).insert(rows).select();
    if (error) throw new Error(error.message);
    return data;
  }
  async function update(table, id, patch) {
    const { data, error } = await client.from(table).update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  async function remove(table, id) {
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
  async function removeMany(table, ids) {
    if (!ids.length) return;
    const { error } = await client.from(table).delete().in('id', ids);
    if (error) throw new Error(error.message);
  }

  function subscribe(cb) {
    if (channel) client.removeChannel(channel);
    channel = client.channel('ccc-all');
    for (const t of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, (payload) => {
        cb({ table: t, type: payload.eventType, row: payload.eventType === 'DELETE' ? payload.old : payload.new });
      });
    }
    channel.subscribe();
    return () => { if (channel) client.removeChannel(channel); channel = null; };
  }

  async function uploadPhoto(blob, ext = 'jpg') {
    const path = `${new Date().getFullYear()}/${uuid()}.${ext}`;
    const { error } = await client.storage.from('photos').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message);
    const { data } = client.storage.from('photos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function parseRecipe(text, existingTags) {
    const { data, error } = await client.functions.invoke('parse-recipe', { body: { text, existing_tags: existingTags } });
    if (error) {
      // FunctionsHttpError : le corps de la réponse (JSON ou texte) dit pourquoi.
      let detail = error.message;
      const res = error.context;
      try {
        const status = res?.status ? `HTTP ${res.status} — ` : '';
        const text = res?.text ? await res.text() : '';
        let body = null; try { body = JSON.parse(text); } catch { /* texte brut */ }
        const msg = body?.error || body?.message || body?.msg || text || error.message;
        detail = status + msg;
        if (res?.status === 401) detail += ' (décoche « Verify JWT » sur la fonction dans Supabase, voir DEPLOY.md)';
        if (res?.status === 404) detail += ' (la fonction doit s’appeler exactement parse-recipe)';
      } catch { /* on garde le message générique */ }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data.recipe;
  }

  return { kind: 'supabase', hasSession, signIn, signOut, loadAll, insert, insertMany, update, remove, removeMany, subscribe, uploadPhoto, parseRecipe };
}
