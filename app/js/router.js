// Routeur par hash : #/recettes, #/recettes/:id, #/recettes/:id/cuisine, ...
import { useEffect, useState } from 'preact/hooks';

export function parseHash() {
  const h = (location.hash || '#/recettes').replace(/^#/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(query));
  return { path, parts, section: parts[0] || 'recettes', id: parts[1] || null, sub: parts[2] || null, q };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => { setRoute(parseHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(path) { location.hash = path.startsWith('#') ? path : '#' + path; }
export function back(fallback) {
  if (history.length > 1) history.back(); else go(fallback || '/recettes');
}
