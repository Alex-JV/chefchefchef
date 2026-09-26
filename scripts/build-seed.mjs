// Génère supabase/seed.sql (à coller dans Supabase) et app/seed/seed.json (mode démo)
// à partir de data/seed/*.json et du texte brut Notion data/notion/recipes.txt.
// Les identifiants sont déterministes : relancer le script ne crée pas de doublons.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

function uuid(ns, name) {
  const h = crypto.createHash('sha1').update(ns + ':' + name).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------- texte brut Notion, découpé par recette ----------
const raw = fs.readFileSync(path.join(root, 'data/notion/recipes.txt'), 'utf8');
const rawByTitle = new Map();
for (const block of raw.split(/^### /m).slice(1)) {
  const nl = block.indexOf('\n');
  const title = block.slice(0, nl).trim();
  rawByTitle.set(title, block.slice(nl + 1).trim());
}

const NOW = '2026-09-27T09:00:00Z';
const recipes = read('data/seed/recipes.json').map((r) => {
  const source_text = rawByTitle.get(r.notion_title);
  if (source_text === undefined) throw new Error(`Texte Notion introuvable pour « ${r.notion_title} »`);
  const { notion_title, ambiguity_reason, ...rest } = r;
  const notes = ambiguity_reason ? [rest.notes, `Import Notion — ambigu : ${ambiguity_reason}`].filter(Boolean).join('\n') : rest.notes;
  // Le texte d'origine n'est conservé que sur les fiches ambiguës (pour les compléter à la main).
  return { id: uuid('recipe', notion_title), ...rest, notes, source_text: rest.ambiguous ? `${notion_title}\n${source_text}`.trim() : null, photo_url: null, created_by: null, created_at: NOW, updated_at: NOW };
});
const techniques = read('data/seed/techniques.json').map((t) => ({ id: uuid('technique', t.title), ...t, photo_url: null, created_by: null, created_at: NOW, updated_at: NOW }));
const drinks = read('data/seed/drinks.json').map((d) => ({
  id: uuid('drink', d.kind + ':' + d.name), kind: d.kind, name: d.name, type: d.type ?? null, region: d.region ?? null, vintage: d.vintage ?? null, notes: d.notes ?? null,
  stock: d.stock ?? 0, peak_from: d.peak_from ?? null, peak_to: d.peak_to ?? null, drink_before: d.drink_before ?? null, is_shot: !!d.is_shot,
  ingredients: d.ingredients ?? [], method: d.method ?? null, photo_url: null, is_example: !!d.is_example, created_by: null, created_at: NOW, updated_at: NOW,
}));
const pantry_items = read('data/seed/pantry.json').map((name) => ({ id: uuid('pantry', name), name, created_at: NOW }));

// ---------- seed.json (mode démo) ----------
const seed = { recipes, recipe_logs: [], techniques, drinks, bar_items: [], fridge_items: [], pantry_items, plan_entries: [], shopping_items: [] };
fs.mkdirSync(path.join(root, 'app/seed'), { recursive: true });
fs.writeFileSync(path.join(root, 'app/seed/seed.json'), JSON.stringify(seed, null, 1));

// ---------- seed.sql ----------
const lit = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `array[${v.map((x) => lit(x)).join(',')}]::text[]`.replace('array[]::text[]', "'{}'::text[]");
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
// Colonnes jsonb : toujours sérialisées en JSON (un tableau vide n'est pas un text[]).
const JSONB = new Set(['ingredients', 'steps', 'pitfalls']);
const cell = (c, v) => (JSONB.has(c) ? `'${JSON.stringify(v ?? []).replace(/'/g, "''")}'::jsonb` : lit(v));
const insert = (table, rows, cols) => rows.length ? `insert into public.${table} (${cols.join(', ')}) values\n${rows.map((r) => `  (${cols.map((c) => cell(c, r[c])).join(', ')})`).join(',\n')}\non conflict (id) do nothing;\n` : '';

const sql = [
  '-- ============================================================',
  '--  ChefChefChef — données de départ (import Notion + exemples)',
  '--  À coller dans l’éditeur SQL de Supabase APRÈS schema.sql.',
  '--  Relançable sans doublons (on conflict do nothing).',
  '-- ============================================================',
  '',
  insert('recipes', recipes, ['id', 'title', 'servings', 'prep_min', 'cook_min', 'tags', 'ingredients', 'steps', 'notes', 'source_url', 'source_text', 'photo_url', 'ambiguous', 'created_by', 'created_at', 'updated_at']),
  insert('techniques', techniques, ['id', 'title', 'description', 'steps', 'pitfalls', 'tags', 'photo_url', 'is_example', 'created_by', 'created_at', 'updated_at']),
  insert('drinks', drinks, ['id', 'kind', 'name', 'type', 'region', 'vintage', 'notes', 'stock', 'peak_from', 'peak_to', 'drink_before', 'is_shot', 'ingredients', 'method', 'photo_url', 'is_example', 'created_by', 'created_at', 'updated_at']),
  insert('pantry_items', pantry_items, ['id', 'name', 'created_at']),
].join('\n');
fs.writeFileSync(path.join(root, 'supabase/seed.sql'), sql);

console.log(`seed : ${recipes.length} recettes, ${techniques.length} techniques, ${drinks.length} boissons, ${pantry_items.length} basiques.`);
console.log('→ supabase/seed.sql, app/seed/seed.json');
