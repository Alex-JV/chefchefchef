// Structuration « de secours » sans Claude (mode démo, ou si la fonction
// Supabase ne répond pas). Heuristique volontairement prudente : n'invente rien.

const UNITS = ['kg', 'g', 'mg', 'l', 'cl', 'ml', 'dl', 'c. à soupe', 'c. à café', 'cuillères à soupe', 'cuillère à soupe', 'cuillères à café', 'cuillère à café', 'cuillere a soupe', 'cuillere a cafe', 'c à s', 'c à c', 'cas', 'cac', 'càs', 'càc', 'c.a.s', 'c.a.c', 'cs', 'cc', 'pincée', 'pincées', 'pincee', 'gousse', 'gousses', 'branche', 'branches', 'brin', 'brins', 'tranche', 'tranches', 'bouquet', 'bouquets', 'feuille', 'feuilles', 'verre', 'verres', 'sachet', 'sachets', 'boîte', 'boite', 'boîtes', 'volume', 'volumes', 'pièce', 'pièces', 'morceau', 'morceaux', 'tasse', 'tasses', 'cm', 'louche'];
const UNIT_MAP = { cas: 'c. à soupe', 'càs': 'c. à soupe', 'c à s': 'c. à soupe', 'c.a.s': 'c. à soupe', cs: 'c. à soupe', 'cuillères à soupe': 'c. à soupe', 'cuillère à soupe': 'c. à soupe', 'cuillere a soupe': 'c. à soupe', cac: 'c. à café', 'càc': 'c. à café', 'c à c': 'c. à café', 'c.a.c': 'c. à café', cc: 'c. à café', 'cuillères à café': 'c. à café', 'cuillère à café': 'c. à café', 'cuillere a cafe': 'c. à café', pincees: 'pincée', pincee: 'pincée', 'pincées': 'pincée', gousses: 'gousse', branches: 'branche', brins: 'brin', tranches: 'tranche', bouquets: 'bouquet', feuilles: 'feuille', verres: 'verre', volumes: 'volume', 'pièces': 'pièce', morceaux: 'morceau', tasses: 'tasse', boite: 'boîte', 'boîtes': 'boîte' };

function parseNumber(s) {
  s = s.trim().replace(',', '.');
  if (s === '½') return 0.5; if (s === '¼') return 0.25; if (s === '¾') return 0.75;
  if (/^\d+\/\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); return b ? a / b : null; }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function parseIngredientLine(line) {
  // On retire les puces et la numérotation « 3. » / « 3) », mais pas une quantité « 3 » ou « 1/4 ».
  let s = line.replace(/^[-•*]+\s*/, '').replace(/^\d+[.)]\s+(?=\D)/, '').trim();
  let note = null;
  const paren = s.match(/\((.*?)\)/);
  if (paren) { note = paren[1]; s = s.replace(paren[0], '').replace(/\s+/g, ' ').trim(); }
  const m = s.match(/^([\d½¼¾]+(?:[.,]\d+)?(?:\/\d+)?)\s*(?:(?:à|a|-)\s*(\d+(?:[.,]\d+)?)\s*)?(.*)$/);
  if (!m) return { qty: null, unit: null, name: s, note };
  const qty = parseNumber(m[1]);
  if (m[2]) note = [note, `${m[1]} à ${m[2]}`].filter(Boolean).join(' · ');
  let rest = m[3].trim().replace(/^(de |d'|d’)/i, ''); // « 1/4 de cuillère à café »
  let unit = null;
  const lower = rest.toLowerCase();
  for (const u of UNITS.sort((a, b) => b.length - a.length)) {
    if (lower.startsWith(u + ' ') || lower === u || lower.startsWith(u + " d'") || lower.startsWith(u + ' de ')) {
      unit = UNIT_MAP[u] || u;
      rest = rest.slice(u.length).trim();
      break;
    }
  }
  rest = rest.replace(/^(de |d'|d’)/i, '').trim();
  return { qty, unit, name: rest || s, note };
}

export function parseFallback(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out = { title: '', servings: null, prep_min: null, cook_min: null, ingredients: [], steps: [], tags: [], notes: null, source_url: null, ambiguous: false, ambiguity_reason: null };
  if (!lines.length) return { ...out, ambiguous: true, ambiguity_reason: 'Texte vide' };
  const urls = [];
  let section = 'none';
  const notes = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    const u = l.match(/https?:\/\/\S+/);
    if (u) { urls.push(u[0]); l = l.replace(u[0], '').replace(/^[:\-–\s]+|[:\-–\s]+$/g, '').trim(); if (!l) continue; }
    if (!out.title) { out.title = l.replace(/^#+\s*/, '').replace(/^🖍️\s*/, '').trim(); continue; }
    const serv = l.match(/(?:pour|ingr[ée]dients?(?:\s*pour)?)\s*(?:une?\s+\w+\s+)?(\d+)\s*(?:pers|personnes?|convives|parts?)/i) || l.match(/^(\d+)\s*(?:pers|personnes?)/i);
    if (serv) { out.servings = parseInt(serv[1], 10); if (/ingr/i.test(l)) section = 'ing'; continue; }
    const prep = l.match(/pr[ée]paration\s*:?\s*(\d+)\s*(min|h)/i);
    if (prep) { out.prep_min = prep[2].startsWith('h') ? parseInt(prep[1], 10) * 60 : parseInt(prep[1], 10); continue; }
    const cook = l.match(/cuisson\s*:?\s*(\d+)\s*(min|h)/i);
    if (cook) { out.cook_min = cook[2].startsWith('h') ? parseInt(cook[1], 10) * 60 : parseInt(cook[1], 10); continue; }
    if (/^(ingr[ée]dients?|ingredients?)\b/i.test(l)) { section = 'ing'; continue; }
    if (/^(pr[ée]paration|instructions?|proc[ée]d[ée]|[ée]tapes?|recette|synth[èe]se|m[ée]thode)\b/i.test(l)) { section = 'steps'; continue; }
    if (/^(conseils?|astuces?|notes?|remarques?)\s*:/i.test(l)) { notes.push(l); continue; }
    if (/^(?:[ée]tape\s*)?\d+\s*[:.)]?\s*$/i.test(l)) continue; // "Étape 3" seul sur sa ligne
    const numbered = l.match(/^(?:[ée]tape\s*)?\d+\s*[:.)]\s*(.+)$/i);
    if (section === 'steps' || (section === 'none' && numbered && numbered[1].length > 25)) {
      out.steps.push((numbered ? numbered[1] : l).replace(/^[-•*]\s*/, ''));
      continue;
    }
    if (section === 'ing' || /^[-•*]\s*/.test(l) || /^[\d½¼¾]/.test(l)) { out.ingredients.push(parseIngredientLine(l)); continue; }
    if (l.length > 60) { section = 'steps'; out.steps.push(l); continue; }
    notes.push(l);
  }
  if (urls.length) out.source_url = urls[0];
  if (notes.length || urls.length > 1) out.notes = [...notes, ...urls.slice(1)].join('\n');
  if (!out.ingredients.length && !out.steps.length) {
    out.ambiguous = true;
    out.ambiguity_reason = urls.length ? 'Seulement un lien, pas de contenu' : 'Ni ingrédients ni étapes reconnus';
  } else if (!out.steps.length) {
    out.ambiguous = out.ingredients.every((i) => i.qty == null);
    if (out.ambiguous) out.ambiguity_reason = 'Ingrédients sans quantités et sans étapes';
  }
  return out;
}
