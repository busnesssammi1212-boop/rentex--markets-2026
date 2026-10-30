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
