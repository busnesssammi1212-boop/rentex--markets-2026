import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => '৳' + Number(n).toLocaleString();
export const when = d => d ? new Date(d).toLocaleString() : '—';
export const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3500); };
export function particles() {
  const c = $('#fx'), x = c.getContext('2d'); if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const P = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), v: .02 + Math.random() * .04, r: 1 + Math.random() * 1.5 }));
  (function f() { c.width = innerWidth; c.height = innerHeight; x.fillStyle = 'rgba(160,190,255,.35)';
    P.forEach(p => { p.y -= p.v / 60; if (p.y < 0) p.y = 1; x.beginPath(); x.arc(p.x * c.width, p.y * c.height, p.r, 0, 7); x.fill(); }); requestAnimationFrame(f); })();
}

// Cloudflare Turnstile (captcha). Paste your PUBLIC site key. Leave as is to keep captcha off.
export const TS_KEY = 'PASTE-SITE-KEY';
export const TS_ON = !TS_KEY.startsWith('PASTE');
let tsLoad;
export function turnstile(el) {
  if (!TS_ON) return { token: () => undefined, reset() {} };
  tsLoad ||= new Promise(r => { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.onload = r; document.head.append(s); });
  let tok, id;
  tsLoad.then(() => { id = window.turnstile.render(el, { sitekey: TS_KEY, theme: 'dark', callback: t => tok = t, 'expired-callback': () => tok = undefined }); });
  return { token: () => tok, reset() { tok = undefined; window.turnstile?.reset(id); } };
}
