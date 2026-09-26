// Minuteurs de cuisine : globaux (survivent à la navigation), bip + vibration à la fin.
import { useEffect, useState } from 'preact/hooks';

let timers = [];
const listeners = new Set();
let tick = null;
let nextId = 1;

function emit() { for (const l of listeners) l(); }
function loop() {
  if (tick) return;
  tick = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const t of timers) {
      if (!t.done && t.endAt <= now) { t.done = true; changed = true; ring(); }
    }
    if (changed) emit(); else emit();
    if (!timers.length) { clearInterval(tick); tick = null; }
  }, 500);
}

export function startTimer(label, seconds) {
  const t = { id: nextId++, label, seconds, endAt: Date.now() + seconds * 1000, done: false };
  timers = [...timers, t];
  emit(); loop();
  return t.id;
}
export function stopTimer(id) { timers = timers.filter((t) => t.id !== id); emit(); }
export function addMinute(id) { timers = timers.map((t) => (t.id === id ? { ...t, endAt: (t.done ? Date.now() : t.endAt) + 60000, done: false } : t)); emit(); loop(); }
export function remaining(t) { return Math.max(0, Math.round((t.endAt - Date.now()) / 1000)); }

export function useTimers() {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => listeners.delete(l); }, []);
  return timers;
}

let audioCtx = null;
export function ring() {
  try {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    [0, 0.35, 0.7, 1.2].forEach((at) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = at > 1 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.3);
    });
  } catch { /* pas de son, tant pis */ }
}
// Débloque l'audio sur iOS au premier geste (les minuteurs sonnent alors même l'écran verrouillé… presque).
export function primeAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch { /* ignore */ }
}
