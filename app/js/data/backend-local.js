// Backend « démo » : tout reste dans le navigateur (localStorage).
// Sert à tester l'app sans Supabase. Les données de départ viennent de seed/seed.json.
import { TABLES } from './tables.js';
import { parseFallback } from '../lib/parse-fallback.js';

const KEY = 'ccc-local-db';
const SESSION_KEY = 'ccc-local-session';

export function createLocalBackend() {
  let db = null;
  const listeners = new Set();

  function load() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
    if (!db) db = Object.fromEntries(TABLES.map((t) => [t, []]));
    return db;
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(db));
  }
  function emit(evt) { for (const l of listeners) l(evt); }

  async function seedIfEmpty() {
    load();
    const empty = TABLES.every((t) => !db[t] || !db[t].length);
    if (!empty) return;
    try {
      const res = await fetch('./seed/seed.json');
      const seed = await res.json();
      for (const t of TABLES) db[t] = (seed[t] || []).map((r) => ({ ...r }));
      save();
    } catch (e) { console.warn('seed indisponible', e); }
  }

  async function hasSession() { return localStorage.getItem(SESSION_KEY) === '1'; }
  async function signIn(password) {
    if (!password) return { ok: false, error: 'Tape un mot de passe (n’importe lequel en mode démo).' };
    localStorage.setItem(SESSION_KEY, '1');
    return { ok: true };
  }
  async function signOut() { localStorage.removeItem(SESSION_KEY); }

  async function loadAll() {
    await seedIfEmpty();
    return Object.fromEntries(TABLES.map((t) => [t, [...(db[t] || [])]]));
  }

  const now = () => new Date().toISOString();
  async function insert(table, row) {
    load();
    const r = { id: crypto.randomUUID(), created_at: now(), updated_at: now(), ...row };
    db[table].push(r); save(); emit({ table, type: 'INSERT', row: r });
    return r;
  }
  async function insertMany(table, rows) { const out = []; for (const r of rows) out.push(await insert(table, r)); return out; }
  async function update(table, id, patch) {
    load();
    const i = db[table].findIndex((r) => r.id === id);
    if (i < 0) throw new Error('introuvable');
    db[table][i] = { ...db[table][i], ...patch, updated_at: now() };
    save(); emit({ table, type: 'UPDATE', row: db[table][i] });
    return db[table][i];
  }
  async function remove(table, id) {
    load();
    const r = db[table].find((x) => x.id === id);
    db[table] = db[table].filter((x) => x.id !== id);
    if (table === 'recipes') {
      db.recipe_logs = db.recipe_logs.filter((l) => l.recipe_id !== id);
      db.plan_entries = db.plan_entries.filter((l) => l.recipe_id !== id);
    }
    save(); if (r) emit({ table, type: 'DELETE', row: r });
  }
  async function removeMany(table, ids) { for (const id of ids) await remove(table, id); }

  function subscribe(cb) {
    listeners.add(cb);
    // Synchro entre onglets du même navigateur (simule le temps réel).
    const onStorage = (e) => {
      if (e.key !== KEY) return;
      db = null; load();
      cb({ table: '*', type: 'RELOAD', all: Object.fromEntries(TABLES.map((t) => [t, [...(db[t] || [])]])) });
    };
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
  }

  async function uploadPhoto(blob) {
    return new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.readAsDataURL(blob); });
  }

  async function parseRecipe(text) {
    await new Promise((r) => setTimeout(r, 400));
    return parseFallback(text);
  }

  return { kind: 'local', hasSession, signIn, signOut, loadAll, insert, insertMany, update, remove, removeMany, subscribe, uploadPhoto, parseRecipe };
}
