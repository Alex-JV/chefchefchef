// Section Techniques : fiches de gestes de cuisine, avec recettes qui les utilisent.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { html, Shiba, Empty, TagInput, PhotoPicker, WikiText, Backlinks, StepsEditor, useDraft, useAutosave, useConfirm, PageHead } from './common.js';
import { useStore, insertRow, updateRow, deleteRow, toast } from '../store.js';
import { go } from '../router.js';
import { norm } from '../lib/text.js';
import { backlinks } from '../lib/links.js';

export function TechniquesSection({ route }) {
  if (route.id === 'nouvelle') return html`<${TechniqueEditor} />`;
  if (route.id && route.sub === 'modifier') return html`<${TechniqueEditor} id=${route.id} />`;
  if (route.id) return html`<${TechniqueDetail} id=${route.id} />`;
  return html`<${TechniqueList} />`;
}

function TechniqueList() {
  const s = useStore();
  const [q, setQ] = useState('');
  const nq = norm(q);
  const list = s.tables.techniques.filter((t) => !nq || norm(t.title).includes(nq) || norm(t.description).includes(nq) || (t.tags || []).some((x) => norm(x).includes(nq)))
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  return html`<div class="page">
    <${PageHead} title="Techniques"><a class="btn primary small" href="#/techniques/nouvelle">＋ Ajouter</a></${PageHead}>
    <div class="field"><input class="input" placeholder="Cuisson, découpe, sauce…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    ${list.length === 0 ? html`<${Empty} mood="curious" title="Aucune technique" text="Pocher, ciseler, déglacer… note ici les gestes à ne pas oublier."><a class="btn primary" href="#/techniques/nouvelle">＋ Ajouter une technique</a></${Empty}>`
      : list.map((t) => html`<a class="list-item" key=${t.id} href=${'#/techniques/' + t.id}>
        ${t.photo_url ? html`<img class="thumb" src=${t.photo_url} alt="" loading="lazy" />` : html`<div class="thumb">🔪</div>`}
        <div class="body">
          <div class="title">${t.title} ${t.is_example ? html`<span class="badge example">exemple</span>` : ''}</div>
          <div class="meta">${t.description ? html`<span>${t.description.slice(0, 90)}${t.description.length > 90 ? '…' : ''}</span>` : ''}</div>
          ${(t.tags || []).length > 0 && html`<div class="chips" style="margin-top:4px">${t.tags.slice(0, 4).map((x) => html`<span class="tag">${x}</span>`)}</div>`}
        </div><span class="chev">›</span></a>`)}
    <a class="fab" href="#/techniques/nouvelle"><span class="fab-plus">＋</span> Nouvelle technique</a>
  </div>`;
}

function TechniqueDetail({ id }) {
  const s = useStore();
  const t = s.tables.techniques.find((x) => x.id === id);
  const [confirm, confirmUi] = useConfirm();
  if (!t) return html`<div class="page"><${Empty} mood="curious" title="Technique introuvable" /></div>`;
  const links = backlinks(s.tables, t.title);
  const recipesUsing = links.filter((l) => l.kind === 'recette');
  const others = links.filter((l) => l.kind !== 'recette');
  const del = async () => {
    if (!(await confirm(`Supprimer « ${t.title} » ?`, { danger: true, ok: 'Supprimer' }))) return;
    await deleteRow('techniques', id); toast('Technique supprimée.', { mood: 'sleepy' }); go('/techniques');
  };
  return html`<div class="page">
    <${PageHead} title=${t.title} back="#/techniques"><a class="btn" href=${`#/techniques/${id}/modifier`}>✏️</a></${PageHead}>
    ${t.is_example && html`<p><span class="badge example">Fiche d’exemple — à adapter ou supprimer</span></p>`}
    ${t.photo_url && html`<img class="hero" src=${t.photo_url} alt="" />`}
    ${(t.tags || []).length > 0 && html`<div class="chips mb">${t.tags.map((x) => html`<span class="tag">${x}</span>`)}</div>`}
    ${t.description && html`<div class="card"><p class="pre mb0"><${WikiText} text=${t.description} tables=${s.tables} /></p></div>`}
    ${(t.steps || []).length > 0 && html`<div class="card"><h2>Étapes</h2><ol class="steps">${t.steps.map((st) => html`<li><div class="t"><${WikiText} text=${st} tables=${s.tables} /></div></li>`)}</ol></div>`}
    ${(t.pitfalls || []).length > 0 && html`<div class="card"><h2>Pièges à éviter</h2><ul>${t.pitfalls.map((p) => html`<li><${WikiText} text=${p} tables=${s.tables} /></li>`)}</ul></div>`}
    <div class="card flat"><h3>Recettes qui l’utilisent</h3>
      ${recipesUsing.length ? html`<div class="chips">${recipesUsing.map((b) => html`<a class="chip outline" href=${'#/recettes/' + b.row.id}>🍳 ${b.title}</a>`)}</div>`
        : html`<p class="muted small mb0">Aucune pour l’instant. Écris <span class="kbd">[[${t.title}]]</span> dans une étape de recette pour la lier.</p>`}
    </div>
    <${Backlinks} items=${others} title="Aussi cité par" />
    <div class="btn-row end"><button class="btn danger" onClick=${del}>Supprimer</button></div>
    ${confirmUi}
  </div>`;
}

const EMPTY = { title: '', description: '', steps: [], pitfalls: [], tags: [], photo_url: null, is_example: false };

function TechniqueEditor({ id }) {
  const s = useStore();
  const existing = id ? s.tables.techniques.find((x) => x.id === id) : null;
  const initial = useMemo(() => (existing ? { ...EMPTY, ...existing, description: existing.description || '' } : EMPTY), [existing?.id]);
  const [f, setF, clearDraft] = useDraft(id ? 'technique:' + id : 'technique:new', initial);
  useEffect(() => { if (existing && f.id !== existing.id) setF(initial); }, [existing?.id]);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const toRow = (x) => ({ title: x.title.trim(), description: x.description.trim() || null, steps: x.steps.map((v) => v.trim()).filter(Boolean), pitfalls: x.pitfalls.map((v) => v.trim()).filter(Boolean), tags: x.tags, photo_url: x.photo_url || null, is_example: !!x.is_example });
  const autosave = useAutosave(!!existing, f, async (val) => { if (val.title.trim()) { await updateRow('techniques', id, toRow(val)); clearDraft(); } });
  const create = async () => {
    if (!f.title.trim()) { toast('Il manque un titre.', { error: true }); return; }
    const row = await insertRow('techniques', toRow(f)); clearDraft(); toast('Technique ajoutée.'); go('/techniques/' + row.id);
  };
  return html`<div class="page">
    <${PageHead} title=${existing ? 'Modifier' : 'Nouvelle technique'} back=${existing ? '#/techniques/' + id : '#/techniques'}>
      ${existing ? html`<span class="saved-indicator">${autosave}</span>` : html`<button class="btn primary" onClick=${create}>Créer</button>`}
    </${PageHead}>
    <div class="field"><label>Nom</label><input class="input" value=${f.title} onInput=${(e) => set({ title: e.target.value })} placeholder="Pocher un œuf" /></div>
    <div class="field"><label>Description</label><textarea class="input" value=${f.description} onInput=${(e) => set({ description: e.target.value })} placeholder="À quoi ça sert, quand l’utiliser…"></textarea></div>
    <div class="field"><label>Tags</label><${TagInput} tags=${f.tags} onChange=${(tags) => set({ tags })} /></div>
    <div class="field"><label>Étapes</label><${StepsEditor} items=${f.steps} onChange=${(steps) => set({ steps })} /></div>
    <div class="field"><label>Pièges à éviter</label><${StepsEditor} items=${f.pitfalls} onChange=${(pitfalls) => set({ pitfalls })} numbered=${false} placeholder="Piège…" /></div>
    <${PhotoPicker} url=${f.photo_url} onChange=${(photo_url) => set({ photo_url })} />
    ${existing?.is_example && html`<div class="field"><label class="check-label"><input type="checkbox" checked=${f.is_example} onChange=${(e) => set({ is_example: e.target.checked })} /> Fiche d’exemple</label></div>`}
    <div class="btn-row end mt">${existing ? html`<a class="btn primary" href=${'#/techniques/' + id}>Terminer</a>` : html`<button class="btn primary" onClick=${create}>Créer</button>`}</div>
  </div>`;
}
