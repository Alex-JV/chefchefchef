// Section Recettes : liste, fiche, éditeur, ajout par texte collé, mode cuisine, journal.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { html, Shiba, Empty, Sheet, Stars, TagInput, PhotoPicker, WikiText, Backlinks, StepsEditor, IngredientsEditor, useDraft, useAutosave, useConfirm, PageHead, Fragment } from './common.js';
import { useStore, insertRow, updateRow, deleteRow, toast, parseRecipeText, profileEmoji, allIngredientNames, PROFILES, getState } from '../store.js';
import { go } from '../router.js';
import { fmtMinutes, fmtQty, scaleQty, findDurations, fmtDuration, todayISO, fmtDate, norm } from '../lib/text.js';
import { backlinks } from '../lib/links.js';
import { startTimer, stopTimer, addMinute, remaining, useTimers, primeAudio } from '../lib/timers.js';
import { addRecipeToShopping } from './shopping-logic.js';

export function RecipesSection({ route }) {
  if (route.id === 'nouvelle') return html`<${RecipeEditor} />`;
  if (route.id && route.sub === 'cuisine') return html`<${CookMode} id=${route.id} />`;
  if (route.id && route.sub === 'modifier') return html`<${RecipeEditor} id=${route.id} />`;
  if (route.id) return html`<${RecipeDetail} id=${route.id} />`;
  return html`<${RecipeList} />`;
}

// ============================================================ Liste
function RecipeList() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [tags, setTags] = useState([]);
  const [sort, setSort] = useState('recent');
  const [addOpen, setAddOpen] = useState(false);
  const recipes = s.tables.recipes;

  const tagCounts = useMemo(() => {
    const m = new Map();
    for (const r of recipes) for (const t of r.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [recipes]);
  const ratings = useMemo(() => {
    const m = new Map();
    for (const l of s.tables.recipe_logs) { if (!l.rating) continue; const a = m.get(l.recipe_id) || []; a.push(l.rating); m.set(l.recipe_id, a); }
    return new Map([...m.entries()].map(([k, v]) => [k, v.reduce((x, y) => x + y, 0) / v.length]));
  }, [s.tables.recipe_logs]);

  const nq = norm(q);
  let list = recipes.filter((r) => {
    if (tags.length && !tags.every((t) => (r.tags || []).includes(t))) return false;
    if (!nq) return true;
    return norm(r.title).includes(nq) || (r.ingredients || []).some((i) => norm(i.name).includes(nq)) || (r.tags || []).some((t) => norm(t).includes(nq));
  });
  list = [...list].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, 'fr');
    if (sort === 'time') return ((a.prep_min || 0) + (a.cook_min || 0) || 9999) - ((b.prep_min || 0) + (b.cook_min || 0) || 9999);
    if (sort === 'rating') return (ratings.get(b.id) || 0) - (ratings.get(a.id) || 0);
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  return html`<div class="page">
    <${PageHead} title="Recettes">
      <select class="input" style="width:auto;min-height:36px;padding:6px 8px" value=${sort} onChange=${(e) => setSort(e.target.value)}>
        <option value="recent">Récentes</option><option value="title">A → Z</option><option value="time">Rapides</option><option value="rating">Mieux notées</option>
      </select>
    </${PageHead}>
    <div class="field"><input class="input" placeholder="Filtrer par titre, ingrédient, tag…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    ${tagCounts.length > 0 && html`<div class="chips scroll mb">
      ${tagCounts.map(([t, n]) => html`<button type="button" class=${'chip' + (tags.includes(t) ? ' on' : '')} onClick=${() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}>${t} <span class="tiny" style="opacity:.7">${n}</span></button>`)}
    </div>`}
    ${list.length === 0
      ? html`<${Empty} mood=${recipes.length ? 'curious' : 'hungry'} title=${recipes.length ? 'Rien ne correspond' : 'Aucune recette pour l’instant'} text=${recipes.length ? 'Le shiba a reniflé partout, en vain. Change de filtre ?' : 'Colle une note de téléphone ou une page web, le shiba s’occupe du reste.'} />`
      : list.map((r) => html`<${RecipeCard} key=${r.id} r=${r} rating=${ratings.get(r.id)} />`)}
    <button class="fab" onClick=${() => setAddOpen(true)} aria-label="Ajouter une recette">+</button>
    ${addOpen && html`<${AddSheet} onClose=${() => setAddOpen(false)} />`}
  </div>`;
}

function RecipeCard({ r, rating }) {
  const total = (r.prep_min || 0) + (r.cook_min || 0);
  return html`<a class="list-item" href=${'#/recettes/' + r.id}>
    ${r.photo_url ? html`<img class="thumb" src=${r.photo_url} alt="" loading="lazy" />` : html`<div class="thumb"><${Shiba} size=${40} mood=${r.ambiguous ? 'curious' : 'happy'} /></div>`}
    <div class="body">
      <div class="title">${r.title}</div>
      <div class="meta">
        ${r.servings ? html`<span>👥 ${r.servings}</span>` : ''}
        ${total ? html`<span>⏱ ${fmtMinutes(total)}</span>` : ''}
        ${rating ? html`<span>⭐ ${Math.round(rating * 10) / 10}</span>` : ''}
        ${r.ambiguous ? html`<span class="badge warn">à relire</span>` : ''}
      </div>
      ${(r.tags || []).length > 0 && html`<div class="chips" style="margin-top:4px">${r.tags.slice(0, 4).map((t) => html`<span class="tag">${t}</span>`)}</div>`}
    </div>
    <span class="chev">›</span>
  </a>`;
}

function AddSheet({ onClose }) {
  const [mode, setMode] = useState('paste');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const go2 = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { parsed, via, warning } = await parseRecipeText(text);
    setBusy(false);
    sessionStorage.setItem('shiba-parsed', JSON.stringify({ parsed, via, warning, source_text: text }));
    onClose();
    go('/recettes/nouvelle?from=paste');
  };
  return html`<${Sheet} title="Nouvelle recette" onClose=${onClose}>
    <div class="tabs"><button type="button" class=${mode === 'paste' ? 'on' : ''} onClick=${() => setMode('paste')}>📋 Coller un texte</button><button type="button" class=${mode === 'form' ? 'on' : ''} onClick=${() => setMode('form')}>✍️ Formulaire</button></div>
    ${mode === 'paste' ? html`
      <p class="small muted">Colle une note de téléphone, un texte copié d’un site, une liste griffonnée… Le shiba structure en titre, portions, ingrédients, étapes et tags. Tu relis avant d’enregistrer.</p>
      <textarea class="input" rows="10" placeholder="Poulet enoki&#10;Pour 2 personnes&#10;2 hauts de cuisses de poulet&#10;400 g d'enokis…&#10;&#10;Faire revenir le poulet…" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
      <div class="btn-row end mt"><button class="btn primary" disabled=${busy || !text.trim()} onClick=${go2}>${busy ? 'Le shiba lit…' : 'Structurer ✨'}</button></div>`
    : html`
      <p class="small muted">Tu remplis tout toi-même, à l’ancienne.</p>
      <div class="btn-row end"><a class="btn primary" href="#/recettes/nouvelle" onClick=${onClose}>Ouvrir le formulaire</a></div>`}
  </${Sheet}>`;
}

// ============================================================ Fiche
function RecipeDetail({ id }) {
  const s = useStore();
  const r = s.tables.recipes.find((x) => x.id === id);
  const [serv, setServ] = useState(r?.servings || null);
  const [logOpen, setLogOpen] = useState(false);
  const [confirm, confirmUi] = useConfirm();
  const timers = useTimers();
  useEffect(() => { if (r) setServ(r.servings || null); }, [r?.id, r?.servings]);
  if (!r) return html`<div class="page"><${Empty} mood="curious" title="Recette introuvable" text="Elle a peut-être été supprimée par l’autre profil." /></div>`;

  const logs = s.tables.recipe_logs.filter((l) => l.recipe_id === id).sort((a, b) => String(b.cooked_on).localeCompare(String(a.cooked_on)));
  const avg = logs.filter((l) => l.rating).reduce((acc, l, _, arr) => acc + l.rating / arr.length, 0);
  const links = backlinks(s.tables, r.title);
  const factor = r.servings && serv ? serv / r.servings : 1;

  const del = async () => {
    if (!(await confirm(`Supprimer « ${r.title} » ? Le journal part avec.`, { danger: true, ok: 'Supprimer' }))) return;
    await deleteRow('recipes', id);
    toast('Recette supprimée. Le shiba fait une petite mine.', { mood: 'sleepy' });
    go('/recettes');
  };
  const toShopping = async () => {
    const n = await addRecipeToShopping(r, serv || r.servings);
    toast(n ? `${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à la liste de courses.` : 'Tout est déjà au frigo ou dans le garde-manger !');
  };
  const [planOpen, setPlanOpen] = useState(false);

  return html`<div class="page">
    <${PageHead} title=${r.title} back="#/recettes" />
    ${r.photo_url && html`<img class="hero" src=${r.photo_url} alt="" />`}
    <div class="recipe-meta">
      ${r.prep_min ? html`<span class="badge">🔪 prépa ${fmtMinutes(r.prep_min)}</span>` : ''}
      ${r.cook_min ? html`<span class="badge">🔥 cuisson ${fmtMinutes(r.cook_min)}</span>` : ''}
      ${avg ? html`<span class="badge">⭐ ${Math.round(avg * 10) / 10} · ${logs.length}×</span>` : ''}
      ${r.ambiguous ? html`<span class="badge warn">⚠️ à relire (import ambigu)</span>` : ''}
    </div>
    ${(r.tags || []).length > 0 && html`<div class="chips mb">${r.tags.map((t) => html`<span class="tag">${t}</span>`)}</div>`}
    <div class="btn-row mb">
      <a class="btn primary" href=${`#/recettes/${id}/cuisine`}>👨‍🍳 Mode cuisine</a>
      <a class="btn" href=${`#/recettes/${id}/modifier`}>✏️ Modifier</a>
      <button class="btn" onClick=${toShopping}>🛒 Courses</button>
      <button class="btn" onClick=${() => setPlanOpen(true)}>📅 Planifier</button>
    </div>

    ${timers.length > 0 && html`<div class="stack mb">${timers.map((t) => html`<${TimerBar} t=${t} />`)}</div>`}

    <div class="card">
      <div class="row mb" style="justify-content:space-between">
        <h2 class="mb0">Ingrédients</h2>
        ${r.servings ? html`<div class="servings-ctl">
          <button type="button" onClick=${() => setServ(Math.max(1, (serv || r.servings) - 1))}>−</button>
          <span>${serv} pers.${serv !== r.servings ? ' *' : ''}</span>
          <button type="button" onClick=${() => setServ((serv || r.servings) + 1)}>+</button>
        </div>` : html`<span class="badge">portions non précisées</span>`}
      </div>
      ${serv && serv !== r.servings && html`<p class="tiny muted">* quantités recalculées depuis la recette pour ${r.servings} pers. <button class="btn small ghost" onClick=${() => setServ(r.servings)}>revenir à ${r.servings}</button></p>`}
      ${(r.ingredients || []).length ? html`<ul class="ing-list">${r.ingredients.map((i) => html`<li>
        <span class="q">${fmtQty(scaleQty(i.qty, r.servings, serv))}${i.unit ? ' ' + i.unit : ''}</span>
        <span class="n">${i.name}${i.note ? html` <span class="note">(${i.note})</span>` : ''}</span>
      </li>`)}</ul>` : html`<p class="muted">Aucun ingrédient structuré.</p>`}
    </div>

    <div class="card">
      <h2>Étapes</h2>
      ${(r.steps || []).length ? html`<ol class="steps">${r.steps.map((st) => html`<li><div class="t"><${WikiText} text=${st} tables=${s.tables} />${findDurations(st).map((d) => html`<button type="button" class="timer-inline" onClick=${() => { primeAudio(); startTimer(`${r.title} · ${d.label}`, d.seconds); toast(`Minuteur ${d.label} lancé.`); }}>⏱ ${d.label}</button>`)}</div></li>`)}</ol>` : html`<p class="muted">Aucune étape structurée.</p>`}
    </div>

    ${r.notes && html`<div class="card"><h3>Notes</h3><p class="pre mb0"><${WikiText} text=${r.notes} tables=${s.tables} /></p></div>`}
    ${r.source_url && html`<p class="small">Source : <a href=${r.source_url} target="_blank" rel="noopener">${r.source_url.replace(/^https?:\/\//, '').slice(0, 60)}</a></p>`}
    ${r.source_text && html`<details class="source card flat" open=${r.ambiguous}>
      <summary>Texte d’origine ${r.ambiguous ? '(gardé visible : import ambigu)' : ''}</summary>
      <pre class="pre source-box mt">${r.source_text}</pre>
    </details>`}

    <${Backlinks} items=${links} />

    <div class="card">
      <div class="row" style="justify-content:space-between"><h2 class="mb0">Journal</h2><button class="btn small primary" onClick=${() => setLogOpen(true)}>+ J’ai cuisiné ça</button></div>
      ${logs.length === 0 ? html`<p class="muted small mt">Jamais cuisinée pour l’instant. Le shiba attend le verdict.</p>`
        : logs.map((l) => html`<${LogItem} key=${l.id} l=${l} />`)}
    </div>

    <div class="btn-row end"><button class="btn danger" onClick=${del}>Supprimer la recette</button></div>
    ${logOpen && html`<${LogSheet} recipeId=${id} onClose=${() => setLogOpen(false)} />`}
    ${planOpen && html`<${PlanSheet} recipe=${r} onClose=${() => setPlanOpen(false)} />`}
    ${confirmUi}
  </div>`;
}

function LogItem({ l }) {
  const [confirm, ui] = useConfirm();
  return html`<div class="log-item">
    <span class="who" title=${PROFILES[l.cooked_by]?.label || ''}>${profileEmoji(l.cooked_by)}</span>
    <div style="flex:1">
      <div class="small"><b>${fmtDate(l.cooked_on)}</b> · cuisinée par ${profileEmoji(l.cooked_by)} ${l.rating ? html`<${Stars} value=${l.rating} small />` : ''}</div>
      ${l.comment && html`<div class="small pre">${l.comment}</div>`}
    </div>
    <button class="btn small ghost" onClick=${async () => { if (await confirm('Supprimer cette entrée du journal ?', { danger: true, ok: 'Supprimer' })) await deleteRow('recipe_logs', l.id); }}>✕</button>
    ${ui}
  </div>`;
}

function LogSheet({ recipeId, onClose }) {
  const s = useStore();
  const [date, setDate] = useState(todayISO());
  const [by, setBy] = useState(s.profile);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const save = async () => {
    await insertRow('recipe_logs', { recipe_id: recipeId, cooked_on: date, cooked_by: by, rating: rating || null, comment: comment.trim() || null });
    toast('Noté dans le journal. Bon appétit !');
    onClose();
  };
  return html`<${Sheet} title="J’ai cuisiné ça" onClose=${onClose}>
    <div class="grid-2">
      <div class="field"><label>Date</label><input class="input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /></div>
      <div class="field"><label>Par</label><div class="chips" style="padding-top:6px">${Object.values(PROFILES).map((p) => html`<button type="button" class=${'chip' + (by === p.id ? ' on' : '')} onClick=${() => setBy(p.id)} style="font-size:1.1rem">${p.emoji}</button>`)}</div></div>
    </div>
    <div class="field"><label>Note</label><${Stars} value=${rating} onChange=${setRating} /></div>
    <div class="field"><label>Commentaire</label><textarea class="input" value=${comment} onInput=${(e) => setComment(e.target.value)} placeholder="Trop bon, mais doubler l’ail la prochaine fois…"></textarea></div>
    <div class="btn-row end"><button class="btn primary" onClick=${save}>Enregistrer</button></div>
  </${Sheet}>`;
}

function PlanSheet({ recipe, onClose }) {
  const [day, setDay] = useState(todayISO());
  const [slot, setSlot] = useState('soir');
  const save = async () => {
    await insertRow('plan_entries', { day, slot, recipe_id: recipe.id, servings: recipe.servings || null });
    toast(`« ${recipe.title} » posée sur le planning.`);
    onClose();
  };
  return html`<${Sheet} title="Planifier" onClose=${onClose} center>
    <div class="grid-2">
      <div class="field"><label>Jour</label><input class="input" type="date" value=${day} onInput=${(e) => setDay(e.target.value)} /></div>
      <div class="field"><label>Repas</label><select class="input" value=${slot} onChange=${(e) => setSlot(e.target.value)}><option value="midi">Midi</option><option value="soir">Soir</option></select></div>
    </div>
    <div class="btn-row end"><button class="btn primary" onClick=${save}>Ajouter au planning</button></div>
  </${Sheet}>`;
}

export function TimerBar({ t }) {
  const timers = useTimers(); // force le rafraîchissement
  const rem = remaining(t);
  return html`<div class=${'timer-big' + (t.done ? ' done' : '')}>
    <span>⏱</span>
    <span class="time">${t.done ? 'Terminé !' : fmtDuration(rem)}</span>
    <span class="small" style="opacity:.8;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.label}</span>
    <button class="btn small" style="color:#fff;background:rgba(255,255,255,.15);border-color:transparent" onClick=${() => addMinute(t.id)}>+1 min</button>
    <button class="btn small" style="color:#fff;background:rgba(255,255,255,.15);border-color:transparent" onClick=${() => stopTimer(t.id)}>✕</button>
  </div>`;
}

// ============================================================ Éditeur
const EMPTY = { title: '', servings: null, prep_min: null, cook_min: null, tags: [], ingredients: [], steps: [], notes: '', source_url: '', source_text: '', photo_url: null, ambiguous: false };

function RecipeEditor({ id }) {
  const s = useStore();
  const existing = id ? s.tables.recipes.find((x) => x.id === id) : null;
  const fromPaste = !id && new URLSearchParams(location.hash.split('?')[1] || '').get('from') === 'paste';
  const pasteInfo = useMemo(() => {
    if (!fromPaste) return null;
    try { return JSON.parse(sessionStorage.getItem('shiba-parsed') || 'null'); } catch { return null; }
  }, [fromPaste]);

  const initial = useMemo(() => {
    if (existing) return { ...EMPTY, ...existing, notes: existing.notes || '', source_url: existing.source_url || '', source_text: existing.source_text || '' };
    if (pasteInfo?.parsed) {
      const p = pasteInfo.parsed;
      return { ...EMPTY, title: p.title || '', servings: p.servings ?? null, prep_min: p.prep_min ?? null, cook_min: p.cook_min ?? null, tags: p.tags || [],
        ingredients: (p.ingredients || []).map((i) => ({ qty: i.qty ?? null, unit: i.unit ?? null, name: i.name || '', note: i.note ?? null })),
        steps: p.steps || [], notes: p.notes || '', source_url: p.source_url || '', source_text: pasteInfo.source_text || '', ambiguous: !!p.ambiguous };
    }
    return EMPTY;
  }, [existing?.id, pasteInfo]);

  const draftKey = id ? 'recipe:' + id : fromPaste ? 'recipe:paste' : 'recipe:new';
  const [f, setF, clearDraft] = useDraft(draftKey, initial);
  // Fiche existante : si le brouillon local correspond à une autre version, on repart de la fiche.
  useEffect(() => { if (existing && f.id !== existing.id) setF(initial); }, [existing?.id]);
  useEffect(() => { if (pasteInfo) { setF(initial); sessionStorage.removeItem('shiba-parsed'); } }, [pasteInfo]);

  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const names = useMemo(() => allIngredientNames(), [s.tables.recipes.length]);
  const toRow = (x) => ({
    title: x.title.trim(), servings: x.servings || null, prep_min: x.prep_min || null, cook_min: x.cook_min || null, tags: x.tags,
    ingredients: x.ingredients.filter((i) => (i.name || '').trim()).map((i) => ({ qty: i.qty === '' ? null : i.qty, unit: i.unit || null, name: i.name.trim(), note: i.note || null })),
    steps: x.steps.map((st) => st.trim()).filter(Boolean), notes: x.notes.trim() || null, source_url: x.source_url.trim() || null,
    source_text: x.source_text || null, photo_url: x.photo_url || null, ambiguous: !!x.ambiguous,
  });

  const autosave = useAutosave(!!existing, f, async (val) => { if (val.title.trim()) { await updateRow('recipes', id, toRow(val)); clearDraft(); } });

  const create = async () => {
    if (!f.title.trim()) { toast('Il manque un titre.', { error: true }); return; }
    const row = await insertRow('recipes', toRow(f));
    clearDraft();
    toast('Recette ajoutée ! Le shiba remue la queue.');
    go('/recettes/' + row.id);
  };

  return html`<div class="page">
    <${PageHead} title=${existing ? 'Modifier' : 'Nouvelle recette'} back=${existing ? '#/recettes/' + id : '#/recettes'}>
      ${existing ? html`<span class="saved-indicator">${autosave}</span>` : html`<button class="btn primary" onClick=${create}>Créer</button>`}
    </${PageHead}>
    ${pasteInfo && html`<div class=${'demo-banner'} style=${pasteInfo.warning ? '' : 'background:#DDF0E3;color:#1E5A34'}>
      ${pasteInfo.warning ? pasteInfo.warning : `Structuré par ${pasteInfo.via}. Relis, corrige, puis « Créer ».`}
      ${f.ambiguous && pasteInfo.parsed?.ambiguity_reason ? html`<div class="tiny">Ambigu : ${pasteInfo.parsed.ambiguity_reason}</div>` : ''}
    </div>`}
    <div class="field"><label>Titre</label><input class="input" value=${f.title} onInput=${(e) => set({ title: e.target.value })} placeholder="Poulet enoki" /></div>
    <div class="grid-3">
      <div class="field"><label>Portions</label><input class="input" type="number" inputmode="numeric" min="1" value=${f.servings ?? ''} onInput=${(e) => set({ servings: e.target.value ? Number(e.target.value) : null })} /></div>
      <div class="field"><label>Prépa (min)</label><input class="input" type="number" inputmode="numeric" min="0" value=${f.prep_min ?? ''} onInput=${(e) => set({ prep_min: e.target.value ? Number(e.target.value) : null })} /></div>
      <div class="field"><label>Cuisson (min)</label><input class="input" type="number" inputmode="numeric" min="0" value=${f.cook_min ?? ''} onInput=${(e) => set({ cook_min: e.target.value ? Number(e.target.value) : null })} /></div>
    </div>
    <div class="field"><label>Tags</label><${TagInput} tags=${f.tags} onChange=${(tags) => set({ tags })} /></div>
    <div class="field"><label>Ingrédients</label><${IngredientsEditor} items=${f.ingredients} onChange=${(ingredients) => set({ ingredients })} names=${names} /></div>
    <div class="field"><label>Étapes <span class="tiny muted">— écris [[Nom d’une fiche]] pour lier une technique, un vin, un cocktail</span></label><${StepsEditor} items=${f.steps} onChange=${(steps) => set({ steps })} /></div>
    <div class="field"><label>Notes</label><textarea class="input" value=${f.notes} onInput=${(e) => set({ notes: e.target.value })} placeholder="Conseils, variantes, [[Technique]]…"></textarea></div>
    <div class="field"><label>Source (lien)</label><input class="input" type="url" value=${f.source_url} onInput=${(e) => set({ source_url: e.target.value })} placeholder="https://…" /></div>
    <${PhotoPicker} url=${f.photo_url} onChange=${(photo_url) => set({ photo_url })} />
    <div class="field"><label><input type="checkbox" checked=${f.ambiguous} onChange=${(e) => set({ ambiguous: e.target.checked })} /> Marquer « à relire » (garde le texte d’origine bien visible)</label></div>
    ${f.source_text && html`<details class="source"><summary>Texte d’origine</summary><textarea class="input mt" rows="6" value=${f.source_text} onInput=${(e) => set({ source_text: e.target.value })}></textarea></details>`}
    <div class="btn-row end mt">
      ${existing ? html`<a class="btn primary" href=${'#/recettes/' + id}>Terminer</a>` : html`<button class="btn primary" onClick=${create}>Créer la recette</button>`}
    </div>
  </div>`;
}

// ============================================================ Mode cuisine
function CookMode({ id }) {
  const s = useStore();
  const r = s.tables.recipes.find((x) => x.id === id);
  const [i, setI] = useState(0);
  const [showIng, setShowIng] = useState(false);
  const timers = useTimers();
  const touch = useRef(null);
  const steps = r?.steps || [];

  // Écran maintenu allumé
  useEffect(() => {
    let lock = null;
    const acquire = async () => { try { if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen'); } catch { /* ignore */ } };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); if (lock) lock.release().catch(() => null); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); if (e.key === 'Escape') go('/recettes/' + id); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [steps.length]);

  if (!r) return html`<div class="page"><${Empty} mood="curious" title="Recette introuvable" /></div>`;
  if (!steps.length) return html`<div class="cook"><div class="head"><a class="btn icon" href=${'#/recettes/' + id}>✕</a><b>${r.title}</b></div><${Empty} mood="curious" title="Pas d’étapes" text="Cette recette n’a pas d’étapes structurées. Ajoute-les en la modifiant." /></div>`;

  const st = steps[i];
  const durations = findDurations(st);
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current; touch.current = null;
    if (dx < -60) setI(Math.min(steps.length - 1, i + 1)); else if (dx > 60) setI(Math.max(0, i - 1));
  };

  return html`<div class="cook" onTouchStart=${onTouchStart} onTouchEnd=${onTouchEnd}>
    <div class="head">
      <a class="btn icon" href=${'#/recettes/' + id} aria-label="Quitter">✕</a>
      <b style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.title}</b>
      <button class="btn small" onClick=${() => setShowIng(true)}>Ingrédients</button>
    </div>
    <div class="progress"><div style=${`width:${((i + 1) / steps.length) * 100}%`}></div></div>
    ${timers.map((t) => html`<div class="mb"><${TimerBar} t=${t} /></div>`)}
    <div class="step"><div><div class="step-num">ÉTAPE ${i + 1} / ${steps.length}</div><${WikiText} text=${st} tables=${s.tables} /></div></div>
    ${durations.length > 0 && html`<div class="timers">${durations.map((d) => html`<button class="btn" onClick=${() => { primeAudio(); startTimer(`Étape ${i + 1} · ${d.label}`, d.seconds); }}>⏱ Lancer ${d.label}</button>`)}</div>`}
    <div class="nav">
      <button class="btn" disabled=${i === 0} onClick=${() => setI(i - 1)}>← Précédent</button>
      ${i < steps.length - 1 ? html`<button class="btn primary" onClick=${() => setI(i + 1)}>Suivant →</button>` : html`<a class="btn primary" href=${'#/recettes/' + id} onClick=${() => toast('C’est prêt ! Pense au journal.', { mood: 'hungry' })}>Terminé 🎉</a>`}
    </div>
    ${showIng && html`<${Sheet} title="Ingrédients" onClose=${() => setShowIng(false)}>
      <ul class="ing-list">${(r.ingredients || []).map((it) => html`<li><span class="q">${fmtQty(it.qty)}${it.unit ? ' ' + it.unit : ''}</span><span class="n">${it.name}</span></li>`)}</ul>
    </${Sheet}>`}
  </div>`;
}
