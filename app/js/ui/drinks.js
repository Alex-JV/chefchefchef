// Section Boissons : vins, spiritueux (cave), cocktails & shots (avec « mon bar »).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { html, Shiba, Empty, Sheet, PhotoPicker, WikiText, Backlinks, IngredientsEditor, Suggest, useDraft, useAutosave, useConfirm, PageHead, Tabs } from './common.js';
import { useStore, insertRow, updateRow, deleteRow, toast } from '../store.js';
import { go } from '../router.js';
import { norm, fmtQty, fmtDate, ingredientMatches } from '../lib/text.js';
import { backlinks } from '../lib/links.js';

const KINDS = { wine: { label: 'Vins', one: 'vin', ic: '🍷' }, spirit: { label: 'Spiritueux', one: 'spiritueux', ic: '🥃' }, cocktail: { label: 'Cocktails & shots', one: 'cocktail', ic: '🍸' } };

export function DrinksSection({ route }) {
  if (route.id === 'nouveau') return html`<${DrinkEditor} kind=${route.q.kind || 'wine'} />`;
  if (route.id && route.sub === 'modifier') return html`<${DrinkEditor} id=${route.id} />`;
  if (route.id) return html`<${DrinkDetail} id=${route.id} />`;
  return html`<${DrinkList} route=${route} />`;
}

function DrinkList({ route }) {
  const s = useStore();
  const [kind, setKind] = useState(route.q.kind || sessionStorage.getItem('ccc-drink-kind') || 'wine');
  const [q, setQ] = useState('');
  const [bar, setBar] = useState(false);
  useEffect(() => sessionStorage.setItem('ccc-drink-kind', kind), [kind]);
  const nq = norm(q);
  const list = s.tables.drinks.filter((d) => d.kind === kind && (!nq || norm(d.name).includes(nq) || norm(d.type).includes(nq) || norm(d.region).includes(nq)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const year = new Date().getFullYear();
  const soon = (d) => d.drink_before && new Date(d.drink_before) < new Date(Date.now() + 90 * 86400000);
  const inStock = list.filter((d) => d.stock > 0).length;

  return html`<div class="page">
    <${PageHead} title="Boissons" />
    <${Tabs} tabs=${Object.entries(KINDS).map(([id, k]) => ({ id, label: k.ic + ' ' + k.label.split(' ')[0] }))} value=${kind} onChange=${setKind} />
    <div class="row mb">
      <input class="input grow" placeholder=${kind === 'cocktail' ? 'Negroni, mezcal…' : 'Nom, type, région…'} value=${q} onInput=${(e) => setQ(e.target.value)} />
      ${kind === 'cocktail' && html`<button class=${'btn' + (bar ? ' primary' : '')} onClick=${() => setBar(!bar)}>🍾 Mon bar</button>`}
    </div>
    ${bar && kind === 'cocktail' && html`<${MyBar} />`}
    ${kind !== 'cocktail' && list.length > 0 && html`<p class="small muted">${inStock} ${KINDS[kind].one}${inStock > 1 ? 's' : ''} en cave sur ${list.length} fiche${list.length > 1 ? 's' : ''}.</p>`}
    ${list.length === 0 ? html`<${Empty} mood="sleepy" title=${'Aucun ' + KINDS[kind].one} text="La cave est vide, le shiba reste sobre." />`
      : list.map((d) => html`<a class="list-item" key=${d.id} href=${'#/boissons/' + d.id}>
        ${d.photo_url ? html`<img class="thumb" src=${d.photo_url} alt="" loading="lazy" />` : html`<div class="thumb">${KINDS[d.kind].ic}</div>`}
        <div class="body">
          <div class="title">${d.name} ${d.is_example ? html`<span class="badge example">exemple</span>` : ''} ${d.is_shot ? html`<span class="badge">shot</span>` : ''}</div>
          <div class="meta">
            ${d.type ? html`<span>${d.type}</span>` : ''}${d.region ? html`<span>${d.region}</span>` : ''}${d.vintage ? html`<span>${d.vintage}</span>` : ''}
            ${d.kind !== 'cocktail' ? html`<span class=${d.stock > 0 ? 'badge ok' : 'badge'}>${d.stock > 0 ? `${d.stock} bouteille${d.stock > 1 ? 's' : ''}` : 'pas en stock'}</span>` : ''}
            ${d.peak_from && d.peak_to ? html`<span class=${'badge' + (year >= d.peak_from && year <= d.peak_to ? ' ok' : '')}>apogée ${d.peak_from}–${d.peak_to}</span>` : ''}
            ${soon(d) ? html`<span class="badge warn">à boire avant ${fmtDate(d.drink_before)}</span>` : ''}
          </div>
        </div><span class="chev">›</span></a>`)}
    <a class="fab" href=${'#/boissons/nouveau?kind=' + kind} aria-label="Ajouter">+</a>
  </div>`;
}

// ---------- Mon bar ----------
function barBottles(tables) {
  const names = tables.bar_items.map((b) => b.name);
  for (const d of tables.drinks) if (d.kind === 'spirit' && d.stock > 0) names.push(d.name + (d.type ? ' ' + d.type : ''));
  return names;
}
function MyBar() {
  const s = useStore();
  const [v, setV] = useState('');
  const bottles = barBottles(s.tables);
  const options = useMemo(() => {
    const set = new Set();
    for (const d of s.tables.drinks) if (d.kind === 'cocktail') for (const i of d.ingredients || []) if (i.name) set.add(i.name);
    return [...set].sort();
  }, [s.tables.drinks]);
  const add = async (name) => { name = String(name || '').trim(); if (!name) return; await insertRow('bar_items', { name }); setV(''); };
  const cocktails = s.tables.drinks.filter((d) => d.kind === 'cocktail' && (d.ingredients || []).length);
  const scored = cocktails.map((c) => {
    const missing = (c.ingredients || []).filter((i) => i.name && !bottles.some((b) => ingredientMatches(i.name, b)));
    return { c, missing };
  }).sort((a, b) => a.missing.length - b.missing.length || a.c.name.localeCompare(b.c.name));
  const doable = scored.filter((x) => x.missing.length === 0);
  const almost = scored.filter((x) => x.missing.length === 1);
  return html`<div class="card">
    <h3>Mon bar</h3>
    <p class="tiny muted">Les spiritueux en stock dans ta cave comptent automatiquement. Ajoute le reste (vermouth, sirops, sodas…).</p>
    <div class="chips mb">${s.tables.bar_items.map((b) => html`<span class="chip on" onClick=${() => deleteRow('bar_items', b.id)}>${b.name} <span class="x">✕</span></span>`)}
      ${s.tables.drinks.filter((d) => d.kind === 'spirit' && d.stock > 0).map((d) => html`<a class="chip outline" href=${'#/boissons/' + d.id}>🥃 ${d.name}</a>`)}</div>
    <div class="row"><div class="grow"><${Suggest} value=${v} onInput=${setV} options=${options} placeholder="Bouteille…" onPick=${add} inputProps=${{ onKeyDown: (e) => { if (e.key === 'Enter') add(v); } }} /></div><button class="btn" onClick=${() => add(v)}>+</button></div>
    <hr class="hr" />
    ${bottles.length === 0 ? html`<p class="muted small mb0">Rien au bar. Le shiba propose de l’eau.</p>` : html`
      <div class="small"><b>Faisables maintenant (${doable.length})</b></div>
      ${doable.length ? html`<div class="chips mb">${doable.map((x) => html`<a class="chip outline" href=${'#/boissons/' + x.c.id}>🍸 ${x.c.name}</a>`)}</div>` : html`<p class="muted small">Aucun… pour l’instant.</p>`}
      <div class="small"><b>À un ingrédient près (${almost.length})</b></div>
      ${almost.length ? html`<div class="stack">${almost.map((x) => html`<div class="small"><a href=${'#/boissons/' + x.c.id}>🍸 ${x.c.name}</a> <span class="muted">— il manque ${x.missing[0].name}</span></div>`)}</div>` : html`<p class="muted small mb0">Rien à un ingrédient près.</p>`}`}
  </div>`;
}

// ---------- Fiche ----------
function DrinkDetail({ id }) {
  const s = useStore();
  const d = s.tables.drinks.find((x) => x.id === id);
  const [confirm, confirmUi] = useConfirm();
  if (!d) return html`<div class="page"><${Empty} mood="curious" title="Boisson introuvable" /></div>`;
  const k = KINDS[d.kind];
  const links = backlinks(s.tables, d.name);
  const del = async () => {
    if (!(await confirm(`Supprimer « ${d.name} » ?`, { danger: true, ok: 'Supprimer' }))) return;
    await deleteRow('drinks', id); toast('Fiche supprimée.', { mood: 'sleepy' }); go('/boissons?kind=' + d.kind);
  };
  const stock = (delta) => updateRow('drinks', id, { stock: Math.max(0, (d.stock || 0) + delta) });
  return html`<div class="page">
    <${PageHead} title=${d.name} back=${'#/boissons?kind=' + d.kind}><a class="btn" href=${`#/boissons/${id}/modifier`}>✏️</a></${PageHead}>
    ${d.is_example && html`<p><span class="badge example">Fiche d’exemple — à adapter ou supprimer</span></p>`}
    ${d.photo_url && html`<img class="hero" src=${d.photo_url} alt="" />`}
    <div class="recipe-meta">
      <span class="badge">${k.ic} ${k.one}${d.is_shot ? ' · shot' : ''}</span>
      ${d.type ? html`<span class="badge">${d.type}</span>` : ''}${d.region ? html`<span class="badge">📍 ${d.region}</span>` : ''}${d.vintage ? html`<span class="badge">${d.vintage}</span>` : ''}
    </div>
    ${d.kind !== 'cocktail' && html`<div class="card">
      <h3>Cave</h3>
      <div class="row" style="justify-content:space-between">
        <span>En stock</span>
        <div class="servings-ctl"><button type="button" onClick=${() => stock(-1)}>−</button><span>${d.stock || 0} bout.</span><button type="button" onClick=${() => stock(1)}>+</button></div>
      </div>
      ${d.peak_from || d.peak_to ? html`<div class="row mt" style="justify-content:space-between"><span>Apogée</span><b>${d.peak_from || '?'} – ${d.peak_to || '?'}</b></div>` : ''}
      ${d.drink_before ? html`<div class="row mt" style="justify-content:space-between"><span>À boire avant</span><b>${fmtDate(d.drink_before)}</b></div>` : ''}
    </div>`}
    ${d.kind === 'cocktail' && html`<div class="card">
      <h3>Recette</h3>
      ${(d.ingredients || []).length ? html`<ul class="ing-list">${d.ingredients.map((i) => html`<li><span class="q">${fmtQty(i.qty)}${i.unit ? ' ' + i.unit : ''}</span><span class="n">${i.name}${i.note ? html` <span class="note">(${i.note})</span>` : ''}</span></li>`)}</ul>` : html`<p class="muted small">Dosages non renseignés.</p>`}
      ${d.method && html`<p class="pre mt mb0"><b>Technique :</b> <${WikiText} text=${d.method} tables=${s.tables} /></p>`}
    </div>`}
    ${d.notes && html`<div class="card"><h3>Notes</h3><p class="pre mb0"><${WikiText} text=${d.notes} tables=${s.tables} /></p></div>`}
    <${Backlinks} items=${links} />
    <div class="btn-row end"><button class="btn danger" onClick=${del}>Supprimer</button></div>
    ${confirmUi}
  </div>`;
}

// ---------- Éditeur ----------
const EMPTY = { kind: 'wine', name: '', type: '', region: '', vintage: null, notes: '', stock: 0, peak_from: null, peak_to: null, drink_before: '', is_shot: false, ingredients: [], method: '', photo_url: null, is_example: false };

function DrinkEditor({ id, kind }) {
  const s = useStore();
  const existing = id ? s.tables.drinks.find((x) => x.id === id) : null;
  const initial = useMemo(() => (existing ? { ...EMPTY, ...existing, type: existing.type || '', region: existing.region || '', notes: existing.notes || '', method: existing.method || '', drink_before: existing.drink_before || '' } : { ...EMPTY, kind }), [existing?.id, kind]);
  const [f, setF, clearDraft] = useDraft(id ? 'drink:' + id : 'drink:new:' + kind, initial);
  useEffect(() => { if (existing && f.id !== existing.id) setF(initial); }, [existing?.id]);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const toRow = (x) => ({ kind: x.kind, name: x.name.trim(), type: x.type.trim() || null, region: x.region.trim() || null, vintage: x.vintage || null, notes: x.notes.trim() || null,
    stock: Number(x.stock) || 0, peak_from: x.peak_from || null, peak_to: x.peak_to || null, drink_before: x.drink_before || null, is_shot: !!x.is_shot,
    ingredients: (x.ingredients || []).filter((i) => (i.name || '').trim()).map((i) => ({ qty: i.qty === '' ? null : i.qty, unit: i.unit || null, name: i.name.trim(), note: i.note || null })),
    method: x.method.trim() || null, photo_url: x.photo_url || null, is_example: !!x.is_example });
  const autosave = useAutosave(!!existing, f, async (val) => { if (val.name.trim()) { await updateRow('drinks', id, toRow(val)); clearDraft(); } });
  const create = async () => {
    if (!f.name.trim()) { toast('Il manque un nom.', { error: true }); return; }
    const row = await insertRow('drinks', toRow(f)); clearDraft(); toast('Fiche ajoutée. Santé !'); go('/boissons/' + row.id);
  };
  const k = KINDS[f.kind];
  const names = useMemo(() => { const set = new Set(); for (const d of s.tables.drinks) for (const i of d.ingredients || []) if (i.name) set.add(i.name); return [...set].sort(); }, [s.tables.drinks]);
  return html`<div class="page">
    <${PageHead} title=${existing ? 'Modifier' : 'Nouveau ' + k.one} back=${existing ? '#/boissons/' + id : '#/boissons?kind=' + f.kind}>
      ${existing ? html`<span class="saved-indicator">${autosave}</span>` : html`<button class="btn primary" onClick=${create}>Créer</button>`}
    </${PageHead}>
    ${!existing && html`<${Tabs} tabs=${Object.entries(KINDS).map(([id2, kk]) => ({ id: id2, label: kk.ic + ' ' + kk.label.split(' ')[0] }))} value=${f.kind} onChange=${(kind2) => set({ kind: kind2 })} />`}
    <div class="field"><label>Nom</label><input class="input" value=${f.name} onInput=${(e) => set({ name: e.target.value })} placeholder=${f.kind === 'cocktail' ? 'Negroni' : 'Domaine, cuvée…'} /></div>
    <div class="grid-2">
      <div class="field"><label>Type</label><input class="input" value=${f.type} onInput=${(e) => set({ type: e.target.value })} placeholder=${f.kind === 'wine' ? 'rouge, blanc, nature…' : f.kind === 'spirit' ? 'rhum, gin, mezcal…' : 'long drink, short…'} /></div>
      ${f.kind !== 'cocktail' ? html`<div class="field"><label>Région</label><input class="input" value=${f.region} onInput=${(e) => set({ region: e.target.value })} /></div>`
        : html`<div class="field"><label>Format</label><label style="display:flex;gap:6px;align-items:center;padding-top:8px;font-size:1rem;color:var(--text)"><input type="checkbox" checked=${f.is_shot} onChange=${(e) => set({ is_shot: e.target.checked })} /> C’est un shot</label></div>`}
    </div>
    ${f.kind !== 'cocktail' && html`
      <div class="grid-2">
        <div class="field"><label>Millésime</label><input class="input" type="number" inputmode="numeric" value=${f.vintage ?? ''} onInput=${(e) => set({ vintage: e.target.value ? Number(e.target.value) : null })} /></div>
        <div class="field"><label>Bouteilles en stock</label><input class="input" type="number" inputmode="numeric" min="0" value=${f.stock ?? 0} onInput=${(e) => set({ stock: e.target.value ? Number(e.target.value) : 0 })} /></div>
      </div>
      <div class="grid-3">
        <div class="field"><label>Apogée de</label><input class="input" type="number" inputmode="numeric" value=${f.peak_from ?? ''} onInput=${(e) => set({ peak_from: e.target.value ? Number(e.target.value) : null })} /></div>
        <div class="field"><label>Apogée à</label><input class="input" type="number" inputmode="numeric" value=${f.peak_to ?? ''} onInput=${(e) => set({ peak_to: e.target.value ? Number(e.target.value) : null })} /></div>
        <div class="field"><label>À boire avant</label><input class="input" type="date" value=${f.drink_before} onInput=${(e) => set({ drink_before: e.target.value })} /></div>
      </div>`}
    ${f.kind === 'cocktail' && html`
      <div class="field"><label>Dosages</label><${IngredientsEditor} items=${f.ingredients} onChange=${(ingredients) => set({ ingredients })} names=${names} /></div>
      <div class="field"><label>Technique</label><textarea class="input" value=${f.method} onInput=${(e) => set({ method: e.target.value })} placeholder="Shaker, verre, glace, garniture… [[Technique]] possible"></textarea></div>`}
    <div class="field"><label>Notes</label><textarea class="input" value=${f.notes} onInput=${(e) => set({ notes: e.target.value })} placeholder="Où goûté, avec quoi, impressions…"></textarea></div>
    <${PhotoPicker} url=${f.photo_url} onChange=${(photo_url) => set({ photo_url })} />
    ${existing?.is_example && html`<div class="field"><label><input type="checkbox" checked=${f.is_example} onChange=${(e) => set({ is_example: e.target.checked })} /> Fiche d’exemple</label></div>`}
    <div class="btn-row end mt">${existing ? html`<a class="btn primary" href=${'#/boissons/' + id}>Terminer</a>` : html`<button class="btn primary" onClick=${create}>Créer</button>`}</div>
  </div>`;
}
