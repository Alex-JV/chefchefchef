import { useState } from 'preact/hooks';
import { html, Shiba } from './common.js';
import { PROFILES, login, isDemo } from '../store.js';

export function Login() {
  const [profile, setProfile] = useState(localStorage.getItem('shiba-profile') || null);
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!profile) { setErr('Choisis d’abord qui tu es.'); return; }
    setBusy(true); setErr('');
    const r = await login(profile, pwd);
    setBusy(false);
    if (!r.ok) setErr(r.error);
  };

  return html`<div class="login">
    <${Shiba} mood="happy" size=${140} className="logo" />
    <h1>Shiba Cuisine</h1>
    <p class="muted">Qui passe en cuisine ?</p>
    <div class="profiles">
      ${Object.values(PROFILES).map((p) => html`<button type="button" class=${'profile-btn' + (profile === p.id ? ' on' : '')} onClick=${() => setProfile(p.id)}>${p.emoji}<small>${p.label}</small></button>`)}
    </div>
    ${isDemo && html`<div class="demo-banner">Mode démo : Supabase n’est pas configuré, les données restent dans ce navigateur. N’importe quel mot de passe fonctionne.</div>`}
    <form onSubmit=${submit}>
      <div class="field"><input class="input" type="password" placeholder="Mot de passe partagé" value=${pwd} onInput=${(e) => setPwd(e.target.value)} autocomplete="current-password" /></div>
      ${err && html`<p class="small" style="color:var(--danger)">${err}</p>`}
      <button class="btn primary block" disabled=${busy}>${busy ? 'Le shiba vérifie…' : 'Entrer dans la cuisine'}</button>
    </form>
  </div>`;
}
