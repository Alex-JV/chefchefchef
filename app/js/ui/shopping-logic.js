// Logique frigo / garde-manger / liste de courses (fusion des quantités, rayons).
import { getState, insertRows, updateRow } from '../store.js';
import { ingredientMatches, ingredientKey, guessAisle, scaleQty } from '../lib/text.js';

// Un ingrédient est-il déjà à la maison (frigo ou garde-manger) ?
export function atHome(ingredientName, tables = getState().tables) {
  return [...tables.pantry_items, ...tables.fridge_items].some((p) => ingredientMatches(ingredientName, p.name));
}

// Pour une recette : ingrédients trouvés dans le frigo, manquants (hors garde-manger).
export function analyseRecipe(recipe, fridge, pantry) {
  const used = [];
  const missing = [];
  const fromPantry = [];
  for (const ing of recipe.ingredients || []) {
    const inFridge = fridge.find((f) => ingredientMatches(ing.name, f.name));
    if (inFridge) { used.push({ ing, item: inFridge }); continue; }
    const inPantry = pantry.find((p) => ingredientMatches(ing.name, p.name));
    if (inPantry) { fromPantry.push(ing); continue; }
    missing.push(ing);
  }
  return { used, missing, fromPantry, usedItems: new Set(used.map((u) => u.item.id)) };
}

// Regroupe des lignes {qty, unit, name, recipe_id} par ingrédient + unité, en additionnant.
export function mergeLines(lines) {
  const map = new Map();
  for (const l of lines) {
    const unit = (l.unit || '').trim().toLowerCase();
    const key = ingredientKey(l.name) + '|' + unit;
    const cur = map.get(key);
    if (!cur) { map.set(key, { name: l.name, unit: l.unit || null, qty: l.qty ?? null, recipe_ids: [l.recipe_id].filter(Boolean) }); continue; }
    if (cur.qty != null && l.qty != null) cur.qty = Math.round((Number(cur.qty) + Number(l.qty)) * 100) / 100;
    else if (l.qty != null && cur.qty == null) cur.qty = l.qty; // "un peu" + 200 g → 200 g
    if (l.recipe_id && !cur.recipe_ids.includes(l.recipe_id)) cur.recipe_ids.push(l.recipe_id);
  }
  return [...map.values()];
}

// Ajoute les ingrédients d'une (ou plusieurs) recette(s) à la liste partagée,
// en fusionnant avec les articles déjà présents non cochés. Retourne le nombre
// d'articles ajoutés ou mis à jour.
export async function addRecipesToShopping(entries /* [{recipe, servings}] */) {
  const { tables } = getState();
  const lines = [];
  for (const { recipe, servings } of entries) {
    for (const ing of recipe.ingredients || []) {
      if (!ing.name || atHome(ing.name, tables)) continue;
      lines.push({ name: ing.name, unit: ing.unit, qty: scaleQty(ing.qty, recipe.servings, servings || recipe.servings), recipe_id: recipe.id });
    }
  }
  const merged = mergeLines(lines);
  const existing = tables.shopping_items.filter((s) => !s.checked);
  const toInsert = [];
  let n = 0;
  for (const m of merged) {
    const same = existing.find((s) => ingredientKey(s.name) === ingredientKey(m.name) && (s.unit || '').toLowerCase() === (m.unit || '').toLowerCase());
    if (same) {
      const qty = same.qty != null && m.qty != null ? Math.round((Number(same.qty) + Number(m.qty)) * 100) / 100 : (same.qty ?? m.qty);
      const recipe_ids = [...new Set([...(same.recipe_ids || []), ...m.recipe_ids])];
      await updateRow('shopping_items', same.id, { qty, recipe_ids });
      n++;
    } else {
      toInsert.push({ name: m.name, qty: m.qty, unit: m.unit, aisle: guessAisle(m.name), checked: false, manual: false, recipe_ids: m.recipe_ids });
    }
  }
  if (toInsert.length) { await insertRows('shopping_items', toInsert); n += toInsert.length; }
  return n;
}
export async function addRecipeToShopping(recipe, servings) { return addRecipesToShopping([{ recipe, servings }]); }
