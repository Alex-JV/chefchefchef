// Réglages : profil, thème, export, déconnexion.
import { html, Shiba, PageHead } from './common.js';
import { useStore, PROFILES, setProfile, applyTheme, logout, exportAll, isDemo, toast } from '../store.js';
import { fmtQty } from '../lib/text.js';

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function toMarkdown(data) {
  const out = ['# ChefChefChef — export', '', `_${new Date().toLocaleString('fr-FR')}_`, ''];
  out.push('## Recettes', '');
  for (const r of data.recipes) {
    out.push(`### ${r.title}`, '');
    const meta = [r.servings && `${r.servings} pers.`, r.prep_min && `prépa ${r.prep_min} min`, r.cook_min && `cuisson ${r.cook_min} min`, (r.tags || []).length && `tags : ${r.tags.join(', ')}`].filter(Boolean);
    if (meta.length) out.push(meta.join(' · '), '');
    for (const i of r.ingredients || []) out.push(`- ${[fmtQty(i.qty), i.unit, i.name].filter(Boolean).join(' ')}${i.note ? ` (${i.note})` : ''}`);
    if ((r.ingredients || []).length) out.push('');
    (r.steps || []).forEach((s, i) => out.push(`${i + 1}. ${s}`));
    if ((r.steps || []).length) out.push('');
    if (r.notes) out.push(`> ${r.notes.replace(/\n/g, '\n> ')}`, '');
    if (r.source_url) out.push(`Source : ${r.source_url}`, '');
    const logs = data.recipe_logs.filter((l) => l.recipe_id === r.id);
    if (logs.length) { out.push('Journal :'); for (const l of logs) out.push(`- ${l.cooked_on} ${PROFILES[l.cooked_by]?.emoji || ''} ${l.rating ? '★'.repeat(l.rating) : ''} ${l.comment || ''}`.trim()); out.push(''); }
  }
  out.push('## Techniques', '');
  for (const t of data.techniques) {
    out.push(`### ${t.title}${t.is_example ? ' (exemple)' : ''}`, '', t.description || '', '');
    (t.steps || []).forEach((s, i) => out.push(`${i + 1}. ${s}`));
    if ((t.pitfalls || []).length) { out.push('', 'Pièges :'); for (const p of t.pitfalls) out.push(`- ${p}`); }
    out.push('');
  }
  out.push('## Boissons', '');
  for (const d of data.drinks) {
    out.push(`### ${d.name}${d.is_example ? ' (exemple)' : ''}`, '', [d.kind, d.type, d.region, d.vintage, d.kind !== 'cocktail' && `stock ${d.stock}`, d.peak_from && `apogée ${d.peak_from}-${d.peak_to || '?'}`, d.drink_before && `à boire avant ${d.drink_before}`].filter(Boolean).join(' · '), '');
    for (const i of d.ingredients || []) out.push(`- ${[fmtQty(i.qty), i.unit, i.name].filter(Boolean).join(' ')}`);
    if (d.method) out.push('', `Technique : ${d.method}`);
    if (d.notes) out.push('', d.notes);
    out.push('');
  }
  out.push('## Garde-manger', '', data.pantry_items.map((p) => `- ${p.name}`).join('\n'), '');
  out.push('## Frigo', '', data.fridge_items.map((p) => `- ${p.name}`).join('\n'), '');
  out.push('## Liste de courses', '', data.shopping_items.map((p) => `- [${p.checked ? 'x' : ' '}] ${[fmtQty(p.qty), p.unit, p.name].filter(Boolean).join(' ')} (${p.aisle})`).join('\n'), '');
  out.push('## Planning', '', data.plan_entries.map((e) => `- ${e.day} ${e.slot} : ${data.recipes.find((r) => r.id === e.recipe_id)?.title || '?'}`).join('\n'), '');
  return out.join('\n');
}

export function SettingsSection() {
  const s = useStore();
  const stamp = new Date().toISOString().slice(0, 10);
  const exportJson = () => { download(`chefchefchef-${stamp}.json`, JSON.stringify(exportAll(), null, 2), 'application/json'); toast('Export JSON prêt.'); };
  const exportMd = () => { download(`chefchefchef-${stamp}.md`, toMarkdown(exportAll()), 'text/markdown'); toast('Export Markdown prêt.'); };
  const counts = s.tables;
  return html`<div class="page">
    <${PageHead} title="Réglages" back="#/recettes" />
    <div class="card">
      <h3>Qui cuisine ?</h3>
      <div class="chips">${Object.values(PROFILES).map((p) => html`<button type="button" class=${'chip' + (s.profile === p.id ? ' on' : '')} style="font-size:1.1rem;padding:6px 14px" onClick=${() => setProfile(p.id)}>${p.emoji} ${p.label}</button>`)}</div>
      <p class="tiny muted mt mb0">Le profil sert à signer le journal, les articles cochés et les ajouts. Pas de compte, pas d’email.</p>
    </div>
    <div class="card">
      <h3>Apparence</h3>
      <div class="chips">${[['auto', '🌗 Auto'], ['light', '☀️ Clair'], ['dark', '🌙 Sombre']].map(([id, l]) => html`<button type="button" class=${'chip' + (s.theme === id ? ' on' : '')} onClick=${() => applyTheme(id)}>${l}</button>`)}</div>
    </div>
    <div class="card">
      <h3>Exporter toutes les données</h3>
      <p class="small muted">${counts.recipes.length} recettes · ${counts.techniques.length} techniques · ${counts.drinks.length} boissons · ${counts.recipe_logs.length} entrées de journal.</p>
      <div class="btn-row"><button class="btn" onClick=${exportMd}>📄 Markdown (lisible)</button><button class="btn" onClick=${exportJson}>🧾 JSON (complet)</button></div>
    </div>
    <div class="card">
      <h3>Installer sur l’écran d’accueil</h3>
      <p class="small mb0">iPhone : Safari → Partager → « Sur l’écran d’accueil ». Android : menu Chrome → « Installer l’application ». Raccourci clavier <span class="kbd">⌘K</span> pour chercher.</p>
    </div>
    <div class="card">
      <h3>Connexion</h3>
      <p class="small muted">${isDemo ? 'Mode démo : données locales à ce navigateur.' : 'Base partagée Supabase, mises à jour en temps réel.'}</p>
      <button class="btn danger" onClick=${async () => { await logout(); }}>Se déconnecter</button>
    </div>
    <div class="center muted small mt"><${Shiba} mood="wink" size=${48} /><div>ChefChefChef — fait maison, pour nous trois.</div></div>
  </div>`;
}
