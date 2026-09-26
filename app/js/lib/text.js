// Utilitaires texte : normalisation, correspondance d'ingrédients, rayons, durées.

export function deaccent(s) {
  return String(s || '').replace(/œ/g, 'oe').replace(/Œ/g, 'Oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function norm(s) {
  return deaccent(s).toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const STOP = new Set(['de', 'd', 'du', 'des', 'le', 'la', 'les', 'l', 'un', 'une', 'en', 'a', 'au', 'aux', 'et', 'ou', 'pour', 'avec', 'sans', 'the', 'of']);
const QUALIFIERS = new Set(['frais', 'fraiche', 'fraiches', 'hache', 'hachee', 'hachees', 'haches', 'emince', 'emincee', 'emincees', 'eminces',
  'rape', 'rapee', 'rapees', 'coupe', 'coupee', 'coupes', 'entier', 'entiere', 'entieres', 'entiers', 'petit', 'petite', 'petits', 'petites',
  'gros', 'grosse', 'grosses', 'grand', 'grande', 'grandes', 'grands', 'beau', 'belle', 'belles', 'finement', 'seche', 'seches', 'sec', 'secs', 'pele', 'pelee', 'pelees']);

function singular(w) {
  if (w.length > 3 && w.endsWith('x')) return w.slice(0, -1);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

// Mots-clés d'un nom d'ingrédient, sans articles ni qualificatifs.
export function tokens(name) {
  return norm(String(name || '').replace(/\(.*?\)/g, ''))
    .split(' ')
    .filter((w) => w && !STOP.has(w) && !QUALIFIERS.has(w) && !/^\d+$/.test(w))
    .map(singular);
}

// Un ingrédient "match" un article (frigo, garde-manger) si tous les mots de
// l'article se retrouvent dans l'ingrédient, ou l'inverse.
export function ingredientMatches(ingredientName, itemName) {
  const a = tokens(ingredientName);
  const b = tokens(itemName);
  if (!a.length || !b.length) return false;
  const sub = (x, y) => x.every((w) => y.some((v) => v === w || (w.length > 4 && v.startsWith(w)) || (v.length > 4 && w.startsWith(v))));
  return sub(b, a) || sub(a, b);
}

export function ingredientKey(name) {
  return tokens(name).sort().join(' ');
}

// ---------- Rayons ----------
const AISLES = [
  ['fruits & légumes', ['tomate', 'oignon', 'ail', 'echalote', 'carotte', 'poireau', 'courgette', 'aubergine', 'poivron', 'concombre', 'salade', 'roquette', 'persil', 'menthe', 'basilic', 'coriandre', 'ciboulette', 'aneth', 'thym', 'romarin', 'citron', 'orange', 'nectarine', 'pomme', 'banane', 'fenouil', 'radis', 'champignon', 'enoki', 'gingembre', 'piment', 'pousse', 'avocat', 'patate', 'pomme de terre', 'igname', 'citronnelle', 'combava', 'herbe', 'epinard', 'brocoli', 'chou', 'celeri', 'fruit', 'legume', 'olive', 'mangue', 'poire', 'raisin', 'fraise', 'framboise', 'melon', 'pasteque', 'kiwi']],
  ['crèmerie', ['lait', 'creme', 'beurre', 'yaourt', 'fromage', 'emmental', 'parmesan', 'tomme', 'feta', 'mozzarella', 'comte', 'gruyere', 'chevre', 'oeuf', 'raclette', 'mascarpone', 'ricotta', 'burrata', 'cheddar']],
  ['boucherie', ['poulet', 'porc', 'boeuf', 'veau', 'agneau', 'canard', 'chorizo', 'lardon', 'jambon', 'saucisse', 'charcuterie', 'viande', 'steak', 'escalope', 'cuisse', 'poitrine', 'echine', 'merguez', 'dinde', 'bacon', 'magret']],
  ['poissonnerie', ['saumon', 'palourde', 'gambas', 'crevette', 'poisson', 'thon', 'cabillaud', 'moule', 'homard', 'huitre', 'calamar', 'bar', 'dorade', 'truite', 'bisque', 'coquillage', 'crustace']],
  ['épicerie', ['pate', 'spaghetti', 'bucatini', 'penne', 'coquillette', 'riz', 'boulgour', 'lentille', 'farine', 'sucre', 'sel', 'poivre', 'huile', 'vinaigre', 'sauce', 'soja', 'hoisin', 'nuoc', 'maizena', 'bouillon', 'epice', 'origan', 'cumin', 'curry', 'paprika', 'vermicelle', 'nouille', 'semoule', 'couscous', 'conserve', 'coulis', 'concentre', 'pois chiche', 'haricot', 'noix', 'amande', 'miel', 'moutarde', 'cornichon', 'chapelure', 'levure', 'chocolat', 'cafe', 'the', 'biscuit', 'cognac', 'vin', 'biere', 'tortilla', 'brisee', 'feuilletee']],
  ['boissons', ['eau', 'jus', 'soda', 'limonade', 'tonic', 'sirop']],
  ['surgelés', ['surgele', 'glace', 'sorbet']],
  ['boulangerie', ['pain', 'baguette', 'brioche', 'pita', 'naan']],
];
export const AISLE_ORDER = ['fruits & légumes', 'boucherie', 'poissonnerie', 'crèmerie', 'épicerie', 'boulangerie', 'boissons', 'surgelés', 'autre'];

export function guessAisle(name) {
  const n = ' ' + tokens(name).join(' ') + ' ';
  const raw = ' ' + norm(name) + ' ';
  for (const [aisle, words] of AISLES) {
    for (const w of words) {
      const ww = singular(deaccent(w));
      if (n.includes(' ' + ww + ' ') || n.includes(' ' + ww) || raw.includes(' ' + deaccent(w) + ' ')) return aisle;
    }
  }
  return 'autre';
}

// ---------- Durées dans une étape ("10 minutes", "1h30", "3 à 4 min") ----------
export function findDurations(text) {
  const out = [];
  const t = String(text || '');
  const re = /(\d+(?:[.,]\d+)?)\s*(?:(?:à|a|-|–)\s*(\d+(?:[.,]\d+)?)\s*)?(?:(h(?:eures?)?)(?![a-zà-ÿ])(?:\s*(\d{1,2})(?![\d°]))?|(min(?:utes?)?|mn)(?![a-zà-ÿ])|(s(?:ec(?:ondes?)?)?)(?![a-zà-ÿ]))/gi;
  let m;
  while ((m = re.exec(t))) {
    const first = parseFloat(m[1].replace(',', '.'));
    let seconds = 0;
    if (m[3]) {
      seconds = first * 3600;
      if (m[4]) seconds += parseInt(m[4], 10) * 60; // "1h30"
    } else if (m[6]) seconds = first;
    else seconds = first * 60;
    if (seconds >= 5 && seconds <= 24 * 3600) out.push({ label: m[0].trim(), seconds: Math.round(seconds) });
  }
  return out;
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtMinutes(min) {
  if (min == null || min === '') return '';
  min = Number(min);
  if (min >= 60) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  return `${min} min`;
}

// ---------- Quantités ----------
export function fmtQty(q) {
  if (q == null || q === '' || isNaN(q)) return '';
  const n = Number(q);
  const fr = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.34: '⅓', 0.66: '⅔', 0.67: '⅔' };
  const whole = Math.floor(n), rest = Math.round((n - whole) * 100) / 100;
  if (rest === 0) return String(whole);
  const key = Object.keys(fr).find((k) => Math.abs(Number(k) - rest) < 0.02);
  if (key) return (whole ? whole : '') + fr[key];
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

export function scaleQty(q, from, to) {
  if (q == null || !from || !to) return q;
  return Math.round((Number(q) * to / from) * 100) / 100;
}

export function slugify(s) {
  return norm(s).replace(/ /g, '-');
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
