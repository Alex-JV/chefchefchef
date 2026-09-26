// Recherche instantanée sur les quatre sections.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { html, Shiba, Empty } from './common.js';
import { useStore } from '../store.js';
import { norm } from '../lib/text.js';

export function SearchOverlay({ onClose }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); const onKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden'; return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; }; }, []);
  useEffect(() => { const onHash = () => onClose(); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);

  const nq = norm(q);
  const groups = useMemo(() => {
    if (nq.length < 2) return [];
    const hit = (...fields) => fields.some((f) => f && norm(Array.isArray(f) ? f.join(' ') : f).includes(nq));
    const g = [];
    const rec = s.tables.recipes.filter((r) => hit(r.title, r.tags, (r.ingredients || []).map((i) => i.name), r.notes)).slice(0, 12);
    if (rec.length) g.push({ label: '🍳 Recettes', items: rec.map((r) => ({ href: '#/recettes/' + r.id, title: r.title, sub: (r.tags || []).join(', ') })) });
    const tec = s.tables.techniques.filter((t) => hit(t.title, t.description, t.tags)).slice(0, 8);
    if (tec.length) g.push({ label: '🔪 Techniques', items: tec.map((t) => ({ href: '#/techniques/' + t.id, title: t.title, sub: t.description?.slice(0, 60) })) });
    const dr = s.tables.drinks.filter((d) => hit(d.name, d.type, d.region, d.notes, (d.ingredients || []).map((i) => i.name))).slice(0, 8);
    if (dr.length) g.push({ label: '🍷 Boissons', items: dr.map((d) => ({ href: '#/boissons/' + d.id, title: d.name, sub: [d.type, d.region, d.vintage].filter(Boolean).join(' · ') })) });
    const sh = s.tables.shopping_items.filter((i) => hit(i.name)).slice(0, 5);
    const fr = s.tables.fridge_items.filter((i) => hit(i.name)).slice(0, 5);
    if (sh.length || fr.length) g.push({ label: '🧊 Frigo & courses', items: [...fr.map((i) => ({ href: '#/frigo?tab=frigo', title: i.name, sub: 'dans le frigo' })), ...sh.map((i) => ({ href: '#/frigo?tab=courses', title: i.name, sub: 'liste de courses' }))] });
    return g;
  }, [nq, s.tables]);

  return html`<div class="search-overlay">
    <div class="row">
      <input ref=${ref} class="input grow" placeholder="Chercher partout…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <button class="btn" onClick=${onClose}>Fermer</button>
    </div>
    <div class="results">
      ${nq.length < 2 ? html`<div class="empty"><${Shiba} mood="curious" size=${80} /><div>Tape au moins deux lettres.</div></div>`
        : groups.length === 0 ? html`<${Empty} mood="curious" title="Rien trouvé" text="Le shiba a reniflé les quatre sections, sans succès." />`
        : groups.map((g) => html`<div key=${g.label}><div class="grp">${g.label}</div>${g.items.map((it) => html`<a class="list-item" href=${it.href} key=${it.href + it.title}><div class="body"><div class="title">${it.title}</div>${it.sub && html`<div class="meta">${it.sub}</div>`}</div><span class="chev">›</span></a>`)}</div>`)}
    </div>
  </div>`;
}
