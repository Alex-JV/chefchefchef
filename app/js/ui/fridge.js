// Section Frigo & courses : frigo (qu'est-ce que je peux cuisiner ?), garde-manger,
// planning de la semaine, liste de courses partagée.
import { useMemo, useState } from 'preact/hooks';
import { html, Shiba, Empty, Sheet, Suggest, useConfirm, PageHead, Tabs } from './common.js';
import { useStore, insertRow, insertRows, updateRow, deleteRow, deleteRows, toast, profileEmoji, allIngredientNames } from '../store.js';
import { fmtQty, guessAisle, AISLE_ORDER, todayISO, norm } from '../lib/text.js';
import { analyseRecipe, addRecipesToShopping } from './shopping-logic.js';

const TABS = [{ id: 'frigo', label: '🧊 Frigo' }, { id: 'planning', label: '📅 Planning' }, { id: 'courses', label: '🛒 Courses' }];

export function FridgeSection({ route }) {
  const [tab, setTab] = useState(route.q.tab || sessionStorage.getItem('shiba-fridge-tab') || 'frigo');
  const pick = (t) => { setTab(t); sessionStorage.setItem('shiba-fridge-tab', t); };
  return html`<div class="page">
    <${PageHead} title="Frigo & courses" />
    <${Tabs} tabs=${TABS} value=${tab} onChange=${pick} />
    ${tab === 'frigo' ? html`<${Fridge} />` : tab === 'planning' ? html`<${Planning} />` : html`<${Shopping} />`}
  </div>`;
}

// ============================================================ Frigo
function Fridge() {
  const s = useStore();
  const [v, setV] = useState('');
  const [pantryOpen, setPantryOpen] = useState(false);
  const names = useMemo(() => allIngredientNames(), [s.tables.recipes.length, s.tables.pantry_items.length]);
  const fridge = s.tables.fridge_items;
  const pantry = s.tables.pantry_items;

  const add = async (name) => {
    name = String(name || '').trim(); if (!name) return;
    if (fridge.some((f) => norm(f.name) === norm(name))) { setV(''); return; }
    await insertRow('fridge_items', { name }); setV('');
  };

  const results = useMemo(() => {
    if (!fridge.length) return [];
    return s.tables.recipes.map((r) => ({ r, ...analyseRecipe(r, fridge, pantry) }))
      .filter((x) => x.used.length > 0)
      .sort((a, b) => a.missing.length - b.missing.length || b.used.length - a.used.length || a.r.title.localeCompare(b.r.title, 'fr'));
  }, [fridge, pantry, s.tables.recipes]);

  return html`<div>
    <p class="small muted">Tape ce que tu as (un seul ingrédient suffit) : le shiba trouve les recettes faisables, puis celles où il manque peu de choses.</p>
    <div class="row mb"><div class="grow"><${Suggest} value=${v} onInput=${setV} options=${names} placeholder="cœur de canard, courgette, feta…" onPick=${add} inputProps=${{ onKeyDown: (e) => { if (e.key === 'Enter') add(v); } }} /></div><button class="btn primary" onClick=${() => add(v)}>+</button></div>
    ${fridge.length > 0 && html`<div class="chips mb">
      ${fridge.map((f) => html`<span class="chip on" onClick=${() => deleteRow('fridge_items', f.id)} title=${'ajouté par ' + profileEmoji(f.created_by)}>${f.name} <span class="x">✕</span></span>`)}
      <button type="button" class="chip outline" onClick=${() => deleteRows('fridge_items', fridge.map((f) => f.id))}>tout vider</button>
    </div>`}
    <div class="row mb" style="justify-content:space-between"><span class="small muted">Garde-manger : ${pantry.length} basique${pantry.length > 1 ? 's' : ''} toujours là</span><button class="btn small" onClick=${() => setPantryOpen(true)}>Gérer</button></div>

    ${fridge.length === 0 ? html`<${Empty} mood="hungry" title="Rien dans le frigo ?" text="Ajoute au moins un ingrédient, le shiba renifle les recettes." />`
      : results.length === 0 ? html`<${Empty} mood="curious" title="Aucune recette avec ça" text="Le shiba a cherché partout. Essaie un autre ingrédient ou un nom plus simple (« poulet » plutôt que « blanc de poulet »)." />`
      : html`<div>${results.map(({ r, used, missing, fromPantry }) => html`<a class="list-item fridge-result" key=${r.id} href=${'#/recettes/' + r.id}>
        <div class="thumb">${missing.length === 0 ? '✅' : missing.length <= 2 ? '🛒' : '🤔'}</div>
        <div class="body">
          <div class="title">${r.title}</div>
          <div class="have">utilise ${used.map((u) => u.ing.name).join(', ')}${fromPantry.length ? html` <span class="muted">+ garde-manger</span>` : ''}</div>
          ${missing.length === 0 ? html`<div class="have"><b>Faisable sans rien acheter !</b></div>`
            : html`<div class="miss">à acheter (${missing.length}) : ${missing.map((m) => (m.qty ? fmtQty(m.qty) + (m.unit ? ' ' + m.unit : '') + ' ' : '') + m.name).join(', ')}</div>`}
        </div><span class="chev">›</span></a>`)}</div>`}
    ${pantryOpen && html`<${PantrySheet} onClose=${() => setPantryOpen(false)} />`}
  </div>`;
}

function PantrySheet({ onClose }) {
  const s = useStore();
  const [v, setV] = useState('');
  const names = useMemo(() => allIngredientNames(), [s.tables.recipes.length]);
  const add = async (name) => { name = String(name || '').trim(); if (!name) return; if (s.tables.pantry_items.some((p) => norm(p.name) === norm(name))) { setV(''); return; } await insertRow('pantry_items', { name }); setV(''); };
  return html`<${Sheet} title="Garde-manger" onClose=${onClose}>
    <p class="small muted">Les basiques toujours présents : ils ne comptent jamais comme « manquants » et ne vont pas dans la liste de courses.</p>
    <div class="row mb"><div class="grow"><${Suggest} value=${v} onInput=${setV} options=${names} placeholder="huile d’olive, sel, farine…" onPick=${add} inputProps=${{ onKeyDown: (e) => { if (e.key === 'Enter') add(v); } }} /></div><button class="btn primary" onClick=${() => add(v)}>+</button></div>
    <div class="chips">${s.tables.pantry_items.map((p) => html`<span class="chip on" onClick=${() => deleteRow('pantry_items', p.id)}>${p.name} <span class="x">✕</span></span>`)}</div>
  </${Sheet}>`;
}

// ============================================================ Planning
function mondayOf(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(12, 0, 0, 0); return x; }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function Planning() {
  const s = useStore();
  const [offset, setOffset] = useState(0);
  const [picker, setPicker] = useState(null); // {day, slot}
  const start = mondayOf(new Date()); start.setDate(start.getDate() + offset * 7);
  const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = todayISO();
  const entries = s.tables.plan_entries;
  const byKey = (day, slot) => entries.filter((e) => e.day === day && e.slot === slot);
  const recipe = (id) => s.tables.recipes.find((r) => r.id === id);
  const weekEntries = entries.filter((e) => days.some((d) => iso(d) === e.day));

  const genShopping = async () => {
    const list = weekEntries.map((e) => ({ recipe: recipe(e.recipe_id), servings: e.servings })).filter((x) => x.recipe);
    if (!list.length) { toast('Rien de planifié cette semaine.', { mood: 'sleepy' }); return; }
    const n = await addRecipesToShopping(list);
    toast(`Liste de courses mise à jour (${n} article${n > 1 ? 's' : ''}).`);
  };

  return html`<div>
    <div class="row mb" style="justify-content:space-between">
      <button class="btn small" onClick=${() => setOffset(offset - 1)}>‹</button>
      <b>${offset === 0 ? 'Cette semaine' : offset === 1 ? 'Semaine prochaine' : `Semaine du ${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}</b>
      <button class="btn small" onClick=${() => setOffset(offset + 1)}>›</button>
    </div>
    <div class="week">
      ${days.map((d) => { const k = iso(d); return html`<div class=${'day' + (k === today ? ' today' : '')} key=${k}>
        <div class="dname">${DAYS[(d.getDay() + 6) % 7]} <span class="muted small">${d.getDate()}</span></div>
        ${['midi', 'soir'].map((slot) => html`<div class="slot">
          <span class="lbl">${slot}</span>
          <div class="entry">
            ${byKey(k, slot).map((e) => { const r = recipe(e.recipe_id); return html`<span class="plan-pill" key=${e.id}><a href=${r ? '#/recettes/' + r.id : '#'}>${r ? r.title : '(recette supprimée)'}</a>${e.servings ? html`<span class="tiny">·${e.servings}p</span>` : ''}<button type="button" onClick=${() => deleteRow('plan_entries', e.id)} aria-label="Retirer">✕</button></span>`; })}
            <button type="button" class="chip outline" onClick=${() => setPicker({ day: k, slot })}>+</button>
          </div>
        </div>`)}
      </div>`; })}
    </div>
    <div class="btn-row mt">
      <button class="btn primary" onClick=${genShopping} disabled=${!weekEntries.length}>🛒 Générer les courses de la semaine</button>
      ${weekEntries.length > 0 && html`<button class="btn ghost" onClick=${() => deleteRows('plan_entries', weekEntries.map((e) => e.id))}>Vider la semaine</button>`}
    </div>
    ${weekEntries.length === 0 && html`<${Empty} mood="sleepy" title="Semaine vide" text="Pose des recettes sur les jours, le shiba fera la liste de courses." />`}
    ${picker && html`<${RecipePicker} onClose=${() => setPicker(null)} onPick=${async (r) => { await insertRow('plan_entries', { day: picker.day, slot: picker.slot, recipe_id: r.id, servings: r.servings || null }); setPicker(null); }} />`}
  </div>`;
}

export function RecipePicker({ onClose, onPick, title = 'Quelle recette ?' }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const nq = norm(q);
  const list = s.tables.recipes.filter((r) => !nq || norm(r.title).includes(nq) || (r.tags || []).some((t) => norm(t).includes(nq))).sort((a, b) => a.title.localeCompare(b.title, 'fr')).slice(0, 60);
  return html`<${Sheet} title=${title} onClose=${onClose}>
    <div class="field"><input class="input" placeholder="Chercher…" value=${q} onInput=${(e) => setQ(e.target.value)} autofocus /></div>
    ${list.map((r) => html`<button type="button" class="list-item" style="width:100%;text-align:left;cursor:pointer" key=${r.id} onClick=${() => onPick(r)}>
      <div class="thumb">${r.photo_url ? html`<img src=${r.photo_url} style="width:100%;height:100%;object-fit:cover;border-radius:10px" />` : '🍳'}</div>
      <div class="body"><div class="title">${r.title}</div><div class="meta">${r.servings ? `👥 ${r.servings}` : ''}</div></div></button>`)}
  </${Sheet}>`;
}

// ============================================================ Courses
function Shopping() {
  const s = useStore();
  const [v, setV] = useState('');
  const [picker, setPicker] = useState(false);
  const [confirm, confirmUi] = useConfirm();
  const items = s.tables.shopping_items;
  const names = useMemo(() => allIngredientNames(), [s.tables.recipes.length]);
  const add = async (name) => {
    name = String(name || '').trim(); if (!name) return;
    // "2 kg carottes" / "carottes 500 g" → on tente de séparer la quantité
    let qty = null, unit = null, n = name;
    const m = name.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Zéè.]+)?\s+(.+)$/);
    if (m) { qty = Number(m[1].replace(',', '.')); unit = m[2] || null; n = m[3]; }
    await insertRow('shopping_items', { name: n, qty, unit, aisle: guessAisle(n), checked: false, manual: true, recipe_ids: [] });
    setV('');
  };
  const toggle = (it) => updateRow('shopping_items', it.id, { checked: !it.checked, checked_by: it.checked ? null : s.profile });
  const groups = AISLE_ORDER.map((a) => ({ aisle: a, items: items.filter((i) => i.aisle === a).sort((x, y) => Number(x.checked) - Number(y.checked) || x.name.localeCompare(y.name, 'fr')) })).filter((g) => g.items.length);
  const checked = items.filter((i) => i.checked);
  const recipeTitle = (id) => s.tables.recipes.find((r) => r.id === id)?.title;

  return html`<div>
    <div class="row mb"><div class="grow"><${Suggest} value=${v} onInput=${setV} options=${names} placeholder="Ajouter un article (ex : 2 kg carottes)" onPick=${add} inputProps=${{ onKeyDown: (e) => { if (e.key === 'Enter') add(v); } }} /></div><button class="btn primary" onClick=${() => add(v)}>+</button></div>
    <div class="btn-row mb">
      <button class="btn small" onClick=${() => setPicker(true)}>+ Depuis une recette</button>
      ${checked.length > 0 && html`<button class="btn small" onClick=${() => deleteRows('shopping_items', checked.map((i) => i.id))}>Retirer les ${checked.length} coché${checked.length > 1 ? 's' : ''}</button>`}
      ${items.length > 0 && html`<button class="btn small ghost" onClick=${async () => { if (await confirm('Vider toute la liste de courses ?', { danger: true, ok: 'Vider' })) await deleteRows('shopping_items', items.map((i) => i.id)); }}>Tout vider</button>`}
    </div>
    ${items.length === 0 ? html`<${Empty} mood="sleepy" title="Liste de courses vide" text="Ajoute un article, une recette, ou génère la semaine depuis le planning." />`
      : groups.map((g) => html`<div key=${g.aisle}>
        <div class="aisle-title">${g.aisle}</div>
        ${g.items.map((it) => html`<div class=${'shop-item' + (it.checked ? ' done' : '')} key=${it.id}>
          <button type="button" class="check" onClick=${() => toggle(it)} aria-label="Cocher">${it.checked ? profileEmoji(it.checked_by) : ''}</button>
          <div class="name">${it.name}
            ${(it.recipe_ids || []).length > 0 && html`<div class="tiny muted">${it.recipe_ids.map(recipeTitle).filter(Boolean).join(' · ')}</div>`}
          </div>
          <span class="qty">${fmtQty(it.qty)}${it.unit ? ' ' + it.unit : ''}</span>
          <button type="button" class="btn small ghost" onClick=${() => deleteRow('shopping_items', it.id)} aria-label="Supprimer">✕</button>
        </div>`)}
      </div>`)}
    ${picker && html`<${RecipePicker} title="Ajouter les ingrédients de…" onClose=${() => setPicker(false)} onPick=${async (r) => { const n = await addRecipesToShopping([{ recipe: r }]); setPicker(false); toast(n ? `${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}.` : 'Tout est déjà à la maison !'); }} />`}
    ${confirmUi}
  </div>`;
}
