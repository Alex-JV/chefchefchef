// Liens [[nom]] entre fiches et rétroliens.
import { norm } from './text.js';

export const WIKI_RE = /\[\[([^\]]+)\]\]/g;

// Index titre normalisé → fiche (recettes, techniques, boissons).
export function buildIndex(tables) {
  const idx = new Map();
  const add = (kind, row, title) => { const k = norm(title); if (k && !idx.has(k)) idx.set(k, { kind, row, title }); };
  for (const r of tables.recipes) add('recette', r, r.title);
  for (const t of tables.techniques) add('technique', t, t.title);
  for (const d of tables.drinks) add('boisson', d, d.name);
  return idx;
}

export function resolveLink(idx, name) {
  return idx.get(norm(name)) || null;
}

export function hrefFor(target) {
  if (!target) return null;
  if (target.kind === 'recette') return `#/recettes/${target.row.id}`;
  if (target.kind === 'technique') return `#/techniques/${target.row.id}`;
  return `#/boissons/${target.row.id}`;
}

// Tous les textes d'une fiche où l'on peut écrire [[...]].
export function textsOf(kind, row) {
  if (kind === 'recette') return [row.notes, ...(row.steps || []), ...(row.ingredients || []).map((i) => i.note)];
  if (kind === 'technique') return [row.description, ...(row.steps || []), ...(row.pitfalls || [])];
  return [row.notes, row.method, ...(row.ingredients || []).map((i) => i.note)];
}

// Fiches qui pointent vers `title`.
export function backlinks(tables, title) {
  const k = norm(title);
  const out = [];
  const scan = (kind, rows, titleOf) => {
    for (const row of rows) {
      const hit = textsOf(kind, row).some((t) => {
        if (!t) return false;
        let m; WIKI_RE.lastIndex = 0;
        while ((m = WIKI_RE.exec(t))) if (norm(m[1]) === k) return true;
        return false;
      });
      if (hit) out.push({ kind, row, title: titleOf(row) });
    }
  };
  scan('recette', tables.recipes, (r) => r.title);
  scan('technique', tables.techniques, (r) => r.title);
  scan('boisson', tables.drinks, (r) => r.name);
  return out;
}
