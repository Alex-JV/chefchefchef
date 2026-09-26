// Store global minimaliste : un état, des écouteurs, un hook.
import { useEffect, useState } from 'preact/hooks';
import { TABLES } from './data/tables.js';
import { createSupabaseBackend } from './data/backend-supabase.js';
import { createLocalBackend } from './data/backend-local.js';
import { parseFallback } from './lib/parse-fallback.js';

export const PROFILES = {
  chef: { id: 'chef', emoji: '👨‍🍳', label: 'Chef' },
  cheffe: { id: 'cheffe', emoji: '👩‍🍳', label: 'Cheffe' },
};
export const profileEmoji = (id) => PROFILES[id]?.emoji || '🐕';

const cfg = window.SHIBA_CONFIG || {};
const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
export const backend = configured ? createSupabaseBackend(cfg) : createLocalBackend();
export const isDemo = backend.kind === 'local';

const state = {
  ready: false,          // données chargées
  authed: false,         // session valide
  profile: localStorage.getItem('shiba-profile') || null,
  theme: localStorage.getItem('shiba-theme') || 'auto',
  online: navigator.onLine,
  tables: Object.fromEntries(TABLES.map((t) => [t, []])),
  toasts: [],
  searchOpen: false,
  loadError: null,
};
const listeners = new Set();

export function getState() { return state; }
export function setState(patch) {
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  for (const l of listeners) l();
}
export function useStore() {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick((n) => n + 1); listeners.add(l); return () => listeners.delete(l); }, []);
  return state;
}

// ---------- Thème ----------
export function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('shiba-theme', theme);
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  for (const l of listeners) l();
}
applyTheme(state.theme);
window.addEventListener('online', () => setState({ online: true }));
window.addEventListener('offline', () => setState({ online: false }));

// ---------- Toasts ----------
let toastId = 0;
export function toast(text, opts = {}) {
  const id = ++toastId;
  setState({ toasts: [...state.toasts, { id, text, mood: opts.mood || 'happy', error: !!opts.error }] });
  setTimeout(() => setState({ toasts: state.toasts.filter((t) => t.id !== id) }), opts.ms || 2600);
}

// ---------- Session ----------
export async function boot() {
  const authed = await backend.hasSession();
  setState({ authed });
  if (authed) await loadData();
}
export async function login(profile, password) {
  const r = await backend.signIn(password);
  if (!r.ok) return r;
  localStorage.setItem('shiba-profile', profile);
  setState({ authed: true, profile });
  await loadData();
  return r;
}
export function setProfile(profile) {
  localStorage.setItem('shiba-profile', profile);
  setState({ profile });
}
export async function logout() {
  await backend.signOut();
  localStorage.removeItem('shiba-profile');
  setState({ authed: false, ready: false, profile: null, tables: Object.fromEntries(TABLES.map((t) => [t, []])) });
}

let unsubscribe = null;
export async function loadData() {
  try {
    const tables = await backend.loadAll();
    setState({ tables, ready: true, loadError: null });
    if (unsubscribe) unsubscribe();
    unsubscribe = backend.subscribe(onRemoteChange);
  } catch (e) {
    setState({ loadError: e.message, ready: true });
  }
}

function onRemoteChange(evt) {
  if (evt.type === 'RELOAD') { setState({ tables: evt.all }); return; }
  const rows = state.tables[evt.table] || [];
  let next;
  if (evt.type === 'DELETE') next = rows.filter((r) => r.id !== evt.row.id);
  else if (rows.some((r) => r.id === evt.row.id)) next = rows.map((r) => (r.id === evt.row.id ? { ...r, ...evt.row } : r));
  else next = [...rows, evt.row];
  setState({ tables: { ...state.tables, [evt.table]: next } });
}

// ---------- Écritures (optimistes + réconciliées) ----------
function stamp(row) { return { created_by: state.profile, ...row }; }

export async function insertRow(table, row) {
  const saved = await backend.insert(table, stamp(row));
  const rows = state.tables[table];
  if (!rows.some((r) => r.id === saved.id)) setState({ tables: { ...state.tables, [table]: [...rows, saved] } });
  return saved;
}
export async function insertRows(table, rowsIn) {
  const saved = await backend.insertMany(table, rowsIn.map(stamp));
  const rows = state.tables[table];
  const ids = new Set(rows.map((r) => r.id));
  setState({ tables: { ...state.tables, [table]: [...rows, ...saved.filter((r) => !ids.has(r.id))] } });
  return saved;
}
export async function updateRow(table, id, patch) {
  const prev = state.tables[table];
  setState({ tables: { ...state.tables, [table]: prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) } });
  try {
    const saved = await backend.update(table, id, patch);
    setState({ tables: { ...state.tables, [table]: state.tables[table].map((r) => (r.id === id ? { ...r, ...saved } : r)) } });
    return saved;
  } catch (e) {
    setState({ tables: { ...state.tables, [table]: prev } });
    throw e;
  }
}
export async function deleteRow(table, id) {
  const prev = state.tables[table];
  setState({ tables: { ...state.tables, [table]: prev.filter((r) => r.id !== id) } });
  try { await backend.remove(table, id); }
  catch (e) { setState({ tables: { ...state.tables, [table]: prev } }); throw e; }
}
export async function deleteRows(table, ids) {
  const set = new Set(ids);
  const prev = state.tables[table];
  setState({ tables: { ...state.tables, [table]: prev.filter((r) => !set.has(r.id)) } });
  try { await backend.removeMany(table, ids); }
  catch (e) { setState({ tables: { ...state.tables, [table]: prev } }); throw e; }
}

// ---------- Photos ----------
export async function uploadPhoto(file) {
  const blob = await shrinkImage(file, 1280, 0.82);
  return backend.uploadPhoto(blob, 'jpg');
}
function shrinkImage(file, max, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

// ---------- Structuration d'une recette ----------
export async function parseRecipeText(text) {
  const existing = allTags();
  try {
    const parsed = await backend.parseRecipe(text, existing);
    return { parsed, via: backend.kind === 'local' ? 'heuristique (mode démo)' : 'Claude' };
  } catch (e) {
    // Secours : structuration locale, en le disant clairement.
    const parsed = parseFallback(text);
    return { parsed, via: 'heuristique', warning: `Claude indisponible (${e.message}). Structuration approximative : relis bien.` };
  }
}

// ---------- Sélecteurs ----------
export function allTags() {
  const count = new Map();
  for (const r of state.tables.recipes) for (const t of r.tags || []) count.set(t, (count.get(t) || 0) + 1);
  for (const r of state.tables.techniques) for (const t of r.tags || []) count.set(t, (count.get(t) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}
export function allIngredientNames() {
  const set = new Map();
  for (const r of state.tables.recipes) for (const i of r.ingredients || []) {
    const k = String(i.name || '').trim(); if (!k) continue;
    const kk = k.toLowerCase(); if (!set.has(kk)) set.set(kk, k);
  }
  for (const p of state.tables.pantry_items) { const kk = p.name.toLowerCase(); if (!set.has(kk)) set.set(kk, p.name); }
  return [...set.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function exportAll() {
  return {
    exported_at: new Date().toISOString(),
    app: 'Shiba Cuisine',
    ...state.tables,
  };
}
