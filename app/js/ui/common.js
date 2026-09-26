// Composants partagés : html, mascotte, toasts, sheets, étoiles, tags, suggestions, photo…
import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import htm from 'htm';
import { useStore, uploadPhoto, toast, allTags } from '../store.js';
import { WIKI_RE } from '../lib/links.js';
import { buildIndex, resolveLink, hrefFor } from '../lib/links.js';

export const html = htm.bind(h);
export { Fragment };

// ---------- Mascotte shiba (SVG inline, plusieurs humeurs) ----------
export function Shiba({ mood = 'happy', size = 64, className = '' }) {
  // mood : happy (défaut), sleepy (yeux fermés, rien à faire), curious (tête penchée), hungry (langue)
  const eyes = mood === 'sleepy'
    ? html`<path d="M176 256 Q192 246 208 256" stroke="#1F1B18" stroke-width="7" stroke-linecap="round" fill="none"/>
           <path d="M304 256 Q320 246 336 256" stroke="#1F1B18" stroke-width="7" stroke-linecap="round" fill="none"/>`
    : mood === 'wink'
    ? html`<ellipse cx="192" cy="254" rx="14" ry="17" fill="#1F1B18"/><circle cx="197" cy="247" r="4.5" fill="#fff"/>
           <path d="M304 256 Q320 246 336 256" stroke="#1F1B18" stroke-width="7" stroke-linecap="round" fill="none"/>`
    : html`<ellipse cx="192" cy="254" rx="14" ry="17" fill="#1F1B18"/><ellipse cx="320" cy="254" rx="14" ry="17" fill="#1F1B18"/>
           <circle cx="197" cy="247" r="4.5" fill="#fff"/><circle cx="325" cy="247" r="4.5" fill="#fff"/>`;
  const mouth = mood === 'hungry'
    ? html`<path d="M256 332 L256 348" stroke="#1F1B18" stroke-width="7" stroke-linecap="round" fill="none"/>
           <path d="M214 346 Q256 384 298 346" stroke="#1F1B18" stroke-width="7" stroke-linecap="round" fill="none"/>
           <path d="M242 362 Q256 392 270 362 Z" fill="#E8887C"/>`
    : mood === 'sleepy'
    ? html`<path d="M256 332 L256 350" stroke="#1F1B18" stroke-width="7" stroke-linecap="round" fill="none"/>
           <path d="M232 356 Q256 364 280 356" stroke="#1F1B18" stroke-width="7" stroke-linecap="round" fill="none"/>`
    : html`<path d="M256 332 L256 352" stroke="#1F1B18" stroke-width="7" stroke-linecap="round" fill="none"/>
           <path d="M214 350 Q235 374 256 352 Q277 374 298 350" stroke="#1F1B18" stroke-width="7" stroke-linecap="round" fill="none"/>`;
  const tilt = mood === 'curious' ? 'rotate(-10 256 276)' : '';
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  return html`<svg class=${className} viewBox="0 0 512 512" width=${size} height=${size} aria-label="Shiba" role="img">
    <g transform=${tilt}>
      <defs><clipPath id=${id}><circle cx="256" cy="276" r="176"/></clipPath></defs>
      <path d="M96 214 L132 60 Q140 44 156 58 L244 150 Z" fill="#D9822B"/>
      <path d="M120 200 L142 92 L214 158 Z" fill="#F6EEDF"/>
      <path d="M416 214 L380 60 Q372 44 356 58 L268 150 Z" fill="#D9822B"/>
      <path d="M392 200 L370 92 L298 158 Z" fill="#F6EEDF"/>
      <circle cx="256" cy="276" r="176" fill="#D9822B"/>
      <g clip-path=${'url(#' + id + ')'}>
        <path d="M80 300 Q140 220 256 236 Q372 220 432 300 L432 470 L80 470 Z" fill="#F6EEDF"/>
        <path d="M256 236 Q236 252 226 300 L286 300 Q276 252 256 236 Z" fill="#F6EEDF"/>
      </g>
      <ellipse cx="190" cy="212" rx="18" ry="11" fill="#F6EEDF"/>
      <ellipse cx="322" cy="212" rx="18" ry="11" fill="#F6EEDF"/>
      ${eyes}
      <path d="M232 300 Q256 288 280 300 Q270 328 256 332 Q242 328 232 300 Z" fill="#1F1B18"/>
      ${mouth}
      <circle cx="150" cy="322" r="16" fill="#E8A87C" opacity=".6"/>
      <circle cx="362" cy="322" r="16" fill="#E8A87C" opacity=".6"/>
      <path d="M206 116 Q196 78 232 78 Q244 52 272 62 Q296 46 316 74 Q346 80 332 116 Z" fill="#fff" stroke="#1F1B18" stroke-width="6" stroke-linejoin="round"/>
      <path d="M212 116 L326 116 L322 140 L216 140 Z" fill="#fff" stroke="#1F1B18" stroke-width="6" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

// ---------- États vides ----------
export function Empty({ mood = 'sleepy', title, text, children }) {
  return html`<div class="empty">
    <${Shiba} mood=${mood} size=${96} />
    ${title && html`<div class="big">${title}</div>`}
    ${text && html`<div>${text}</div>`}
    ${children && html`<div class="mt">${children}</div>`}
  </div>`;
}

// ---------- Toasts ----------
export function Toasts() {
  const s = useStore();
  if (!s.toasts.length) return null;
  return html`<div class="toast-wrap">
    ${s.toasts.map((t) => html`<div key=${t.id} class=${'toast' + (t.error ? ' error' : '')}><${Shiba} mood=${t.error ? 'curious' : t.mood} size=${28} /><span>${t.text}</span></div>`)}
  </div>`;
}

// ---------- Sheet (panneau bas) ----------
export function Sheet({ title, onClose, children, center = false }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="sheet-back" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class=${'sheet' + (center ? ' center-modal' : '')}>
      <div class="sheet-head"><h2>${title}</h2><button class="btn icon ghost" onClick=${onClose} aria-label="Fermer">✕</button></div>
      ${children}
    </div>
  </div>`;
}

// ---------- Confirmation ----------
export function useConfirm() {
  const [req, setReq] = useState(null);
  const confirm = (text, opts = {}) => new Promise((resolve) => setReq({ text, resolve, ...opts }));
  const ui = req && html`<${Sheet} title=${req.title || 'Tu es sûr·e ?'} center onClose=${() => { req.resolve(false); setReq(null); }}>
    <p>${req.text}</p>
    <div class="btn-row end">
      <button class="btn" onClick=${() => { req.resolve(false); setReq(null); }}>Annuler</button>
      <button class=${'btn ' + (req.danger ? 'danger' : 'primary')} onClick=${() => { req.resolve(true); setReq(null); }}>${req.ok || 'Oui'}</button>
    </div>
  </${Sheet}>`;
  return [confirm, ui];
}

// ---------- Étoiles ----------
export function Stars({ value = 0, onChange, small = false }) {
  return html`<span class=${'stars' + (small ? ' small' : '')}>
    ${[1, 2, 3, 4, 5].map((n) => html`<button type="button" class=${n <= value ? 'on' : ''} onClick=${onChange ? () => onChange(n === value ? 0 : n) : null} aria-label=${n + ' étoiles'} disabled=${!onChange}>⭐</button>`)}
  </span>`;
}

// ---------- Champ avec suggestions ----------
export function Suggest({ value, onInput, options = [], placeholder, onPick, inputProps = {} }) {
  const [open, setOpen] = useState(false);
  const v = String(value || '').toLowerCase();
  const matches = v.length >= 1 ? options.filter((o) => o.toLowerCase().includes(v) && o.toLowerCase() !== v).slice(0, 8) : [];
  return html`<div class="suggest">
    <input class="input" value=${value} placeholder=${placeholder} autocomplete="off"
      onInput=${(e) => { onInput(e.target.value); setOpen(true); }}
      onFocus=${() => setOpen(true)} onBlur=${() => setTimeout(() => setOpen(false), 150)} ...${inputProps} />
    ${open && matches.length > 0 && html`<div class="drop">${matches.map((m) => html`<button type="button" onMouseDown=${(e) => e.preventDefault()} onClick=${() => { onPick ? onPick(m) : onInput(m); setOpen(false); }}>${m}</button>`)}</div>`}
  </div>`;
}

// ---------- Tags (saisie semi-automatique, anti-doublons) ----------
export function TagInput({ tags = [], onChange }) {
  const [v, setV] = useState('');
  const known = allTags();
  const add = (t) => {
    t = String(t || '').trim().toLowerCase().replace(/^#/, '');
    if (!t) return;
    const existing = known.find((k) => k.toLowerCase() === t) || t;
    if (!tags.includes(existing)) onChange([...tags, existing]);
    setV('');
  };
  return html`<div>
    <div class="chips mb" style="margin-bottom:6px">
      ${tags.map((t) => html`<span class="chip on" onClick=${() => onChange(tags.filter((x) => x !== t))}>${t} <span class="x">✕</span></span>`)}
    </div>
    <${Suggest} value=${v} onInput=${setV} options=${known.filter((k) => !tags.includes(k))} placeholder="Ajouter un tag (salade, été, rapide…)"
      onPick=${add} inputProps=${{ onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(v); } } }} />
  </div>`;
}

// ---------- Photo ----------
export function PhotoPicker({ url, onChange }) {
  const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try { onChange(await uploadPhoto(f)); toast('Photo ajoutée, le shiba approuve.'); }
    catch (err) { toast('Photo refusée : ' + err.message, { error: true }); }
    finally { setBusy(false); e.target.value = ''; }
  };
  return html`<div class="field">
    <label>Photo (facultative)</label>
    ${url && html`<img src=${url} class="hero" style="aspect-ratio:3/2;max-height:220px" />`}
    <div class="btn-row">
      <span class="btn photo-pick">${busy ? 'Envoi…' : url ? '📷 Changer' : '📷 Ajouter une photo'}<input type="file" accept="image/*" onChange=${onFile} disabled=${busy} /></span>
      ${url && html`<button type="button" class="btn ghost" onClick=${() => onChange(null)}>Retirer</button>`}
    </div>
  </div>`;
}

// ---------- Texte avec liens [[...]] ----------
export function WikiText({ text, tables }) {
  if (!text) return null;
  const idx = buildIndex(tables);
  const parts = [];
  let last = 0, m;
  WIKI_RE.lastIndex = 0;
  const s = String(text);
  while ((m = WIKI_RE.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const target = resolveLink(idx, m[1]);
    parts.push(target
      ? html`<a class="wikilink" href=${hrefFor(target)}>${target.title}</a>`
      : html`<span class="wikilink missing" title="Aucune fiche avec ce nom">${m[1]}</span>`);
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return html`<${Fragment}>${parts}</${Fragment}>`;
}

// ---------- Liste de rétroliens ----------
export function Backlinks({ items, title = 'Cité par' }) {
  if (!items.length) return null;
  const icon = { recette: '🍳', technique: '🔪', boisson: '🍷' };
  return html`<div class="card flat">
    <h3>${title}</h3>
    <div class="chips">${items.map((b) => html`<a class="chip outline" href=${hrefFor(b)}>${icon[b.kind]} ${b.title}</a>`)}</div>
  </div>`;
}

// ---------- Liste éditable de lignes de texte (étapes, pièges) ----------
export function StepsEditor({ items = [], onChange, placeholder = 'Étape…', numbered = true }) {
  const set = (i, v) => onChange(items.map((x, j) => (j === i ? v : x)));
  const move = (i, d) => { const a = [...items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return html`<div>
    ${items.map((s, i) => html`<div class="step-row" key=${i}>
      ${numbered && html`<div class="num">${i + 1}</div>`}
      <textarea class="input" value=${s} placeholder=${placeholder} onInput=${(e) => set(i, e.target.value)} rows="2"></textarea>
      <div class="mini-btns">
        <button type="button" onClick=${() => move(i, -1)} aria-label="Monter">▲</button>
        <button type="button" onClick=${() => move(i, 1)} aria-label="Descendre">▼</button>
        <button type="button" onClick=${() => onChange(items.filter((_, j) => j !== i))} aria-label="Supprimer">✕</button>
      </div>
    </div>`)}
    <button type="button" class="btn small" onClick=${() => onChange([...items, ''])}>+ Ajouter</button>
  </div>`;
}

// ---------- Ingrédients éditables ----------
export function IngredientsEditor({ items = [], onChange, names = [] }) {
  const set = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i, d) => { const a = [...items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return html`<div>
    ${items.length > 0 && html`<div class="ingredient-row tiny muted" style="margin-bottom:2px"><span>Qté</span><span>Unité</span><span>Ingrédient</span><span></span></div>`}
    ${items.map((it, i) => html`<div class="ingredient-row" key=${i}>
      <input class="input" inputmode="decimal" value=${it.qty ?? ''} placeholder="—" onInput=${(e) => set(i, { qty: e.target.value === '' ? null : Number(String(e.target.value).replace(',', '.')) })} />
      <input class="input" value=${it.unit ?? ''} placeholder="g, cl…" onInput=${(e) => set(i, { unit: e.target.value || null })} list="shiba-units" />
      <div class="suggest">
        <${Suggest} value=${it.name ?? ''} onInput=${(v) => set(i, { name: v })} options=${names} placeholder="Ingrédient" />
        ${it.note && html`<div class="tiny muted">${it.note}</div>`}
      </div>
      <div class="mini-btns">
        <button type="button" onClick=${() => move(i, -1)} aria-label="Monter">▲</button>
        <button type="button" onClick=${() => move(i, 1)} aria-label="Descendre">▼</button>
        <button type="button" onClick=${() => onChange(items.filter((_, j) => j !== i))} aria-label="Supprimer">✕</button>
      </div>
    </div>`)}
    <datalist id="shiba-units">${['g', 'kg', 'ml', 'cl', 'l', 'c. à soupe', 'c. à café', 'pincée', 'gousse', 'branche', 'tranche', 'bouquet', 'verre', 'pièce', 'volume'].map((u) => html`<option value=${u} />`)}</datalist>
    <button type="button" class="btn small" onClick=${() => onChange([...items, { qty: null, unit: null, name: '', note: null }])}>+ Ingrédient</button>
  </div>`;
}

// ---------- Brouillon local (sauvegarde automatique des formulaires) ----------
export function useDraft(key, initial) {
  const [value, setValue] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem('shiba-draft:' + key) || 'null'); if (d) return d; } catch { /* ignore */ }
    return initial;
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { localStorage.setItem('shiba-draft:' + key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [value]);
  const clear = () => localStorage.removeItem('shiba-draft:' + key);
  return [value, setValue, clear];
}

// ---------- Sauvegarde automatique différée (fiches existantes) ----------
export function useAutosave(enabled, value, save, delay = 900) {
  const [status, setStatus] = useState('');
  const first = useRef(true);
  const timer = useRef(null);
  useEffect(() => {
    if (!enabled) return;
    if (first.current) { first.current = false; return; }
    setStatus('…');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await save(value); setStatus('Enregistré ✓'); setTimeout(() => setStatus(''), 1800); }
      catch (e) { setStatus('Échec : ' + e.message); }
    }, delay);
    return () => clearTimeout(timer.current);
  }, [JSON.stringify(value)]);
  return status;
}

export function Tabs({ tabs, value, onChange }) {
  return html`<div class="tabs">${tabs.map((t) => html`<button type="button" class=${value === t.id ? 'on' : ''} onClick=${() => onChange(t.id)}>${t.label}</button>`)}</div>`;
}

export function PageHead({ title, back: backHref, children }) {
  return html`<div class="page-head">
    ${backHref && html`<a class="btn icon ghost" href=${backHref} aria-label="Retour">←</a>`}
    <h1>${title}</h1>
    ${children}
  </div>`;
}
