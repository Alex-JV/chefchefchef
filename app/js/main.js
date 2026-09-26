import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { html, Shiba, Toasts, Empty } from './ui/common.js';
import { useStore, boot, profileEmoji, loadData, isDemo } from './store.js';
import { useRoute } from './router.js';
import { Login } from './ui/login.js';
import { RecipesSection } from './ui/recipes.js';
import { TechniquesSection } from './ui/techniques.js';
import { DrinksSection } from './ui/drinks.js';
import { FridgeSection } from './ui/fridge.js';
import { SettingsSection } from './ui/settings.js';
import { SearchOverlay } from './ui/search.js';

const NAV = [
  { id: 'recettes', label: 'Recettes', ic: '🍳' },
  { id: 'techniques', label: 'Techniques', ic: '🔪' },
  { id: 'boissons', label: 'Boissons', ic: '🍷' },
  { id: 'frigo', label: 'Frigo', ic: '🧊' },
];

function App() {
  const s = useStore();
  const route = useRoute();
  const [search, setSearch] = useState(false);

  useEffect(() => { boot(); }, []);
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearch(true); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!s.authed) return html`<${Login} /><${Toasts} />`;
  if (!s.ready) return html`<div class="boot"><div><div class="boot-dog">🐕</div><p>Le shiba rapporte les recettes…</p></div></div>`;
  if (s.loadError) return html`<div class="page"><${Empty} mood="curious" title="Impossible de charger les données" text=${s.loadError}>
    <button class="btn primary" onClick=${loadData}>Réessayer</button>
  </${Empty}></div>`;

  const cooking = route.section === 'recettes' && route.sub === 'cuisine';
  let page;
  switch (route.section) {
    case 'techniques': page = html`<${TechniquesSection} route=${route} />`; break;
    case 'boissons': page = html`<${DrinksSection} route=${route} />`; break;
    case 'frigo': page = html`<${FridgeSection} route=${route} />`; break;
    case 'reglages': page = html`<${SettingsSection} route=${route} />`; break;
    default: page = html`<${RecipesSection} route=${route} />`;
  }

  return html`<div class="app">
    ${!cooking && html`<header class="topbar">
      <a class="brand" href="#/recettes"><${Shiba} size=${34} /> ChefChefChef</a>
      <div class="spacer"></div>
      <button class="search-btn" onClick=${() => setSearch(true)} aria-label="Rechercher">🔍 <span class="small">Chercher</span></button>
      <a class="profile-chip" href="#/reglages" title="Réglages">${profileEmoji(s.profile)}</a>
    </header>`}
    ${!s.online && html`<div class="offline-bar">Hors ligne — lecture seule, le shiba attend le réseau.</div>`}
    ${isDemo && !cooking && html`<div class="demo-banner" style="margin:8px 16px 0">Mode démo (données locales à ce navigateur). Branche Supabase dans <span class="kbd">config.js</span> pour partager à deux.</div>`}
    ${page}
    ${!cooking && html`<nav class="bottom-nav">
      ${NAV.map((n) => html`<a href=${'#/' + n.id} class=${route.section === n.id ? 'active' : ''}><span class="ic">${n.ic}</span>${n.label}</a>`)}
    </nav>`}
    ${search && html`<${SearchOverlay} onClose=${() => setSearch(false)} />`}
    <${Toasts} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => null));
}
