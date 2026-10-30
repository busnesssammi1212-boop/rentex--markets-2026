import { sb, $, esc, money, when, toast, particles } from './supa.js';
import { PAY } from './config.js';
particles();
let cats = [], prods = [], cat = 0, user = null;
const U = { hour: 'hour', day: 'day', month: 'month' };
async function load() {
  const [c, p] = await Promise.all([sb.from('categories').select('*').order('sort'), sb.from('products').select('*,plans(*)').order('created_at', { ascending: false })]);
  if (c.error || p.error) return toast('Could not load products. Check config.js.');
  cats = c.data; prods = p.data; chips(); draw();
}
function chips() { $('#chips').innerHTML = [{ id: 0, name: 'All' }, ...cats].map(c => `<button class="chip ${c.id === cat ? 'on' : ''}" data-id="${c.id}">${esc(c.name)}</button>`).join(''); }
$('#chips').onclick = e => { const b = e.target.closest('.chip'); if (b) { cat = +b.dataset.id; chips(); draw(); } };
$('#q').oninput = draw;
function draw() {
  const q = $('#q').value.toLowerCase();
  const list = prods.filter(p => (!cat || p.category_id === cat) && (p.name + p.description).toLowerCase().includes(q));
  $('#grid').innerHTML = list.map(p => {
    const pl = (p.plans || []).filter(x => x.active), out = !pl.length || p.stock === 0;
    return `<article class="card glass"><div class="ico">${esc(p.icon)}</div><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p>
    <div class="price">${pl.map(x => `${money(x.price)}/${U[x.unit]}`).join(' · ') || 'No plans'}</div>
    <span class="tag ${out ? 'out' : ''}">${out ? 'Unavailable' : 'Available'}</span><button class="btn" data-id="${p.id}" ${out ? 'disabled' : ''}>Rent Now</button></article>`; }).join('') || '<p class="note">No products match your search.</p>';
}
$('#grid').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) detail(prods.find(p => p.id === b.dataset.id)); };
function detail(p) {
  const d = $('#dlg'), pl = p.plans.filter(x => x.active);
  d.innerHTML = `<h2>${esc(p.icon)} ${esc(p.name)}</h2><p>${esc(p.description)}</p>
  <b>Features</b><ul class="f">${(p.features || []).map(f => `<li>${esc(f)}</li>`).join('')}</ul>
  <b>Requirements</b><p class="note">${esc(p.requirements || 'None')}</p><b>Rental terms</b><p class="note">${esc(p.terms || 'Access ends automatically at expiry. No refunds after activation.')}</p>
  <div class="row"><div><label>Plan</label><select id="pl">${pl.map(x => `<option value="${x.id}" data-p="${x.price}">${money(x.price)} per ${x.unit}</option>`).join('')}</select></div>
  <div><label>Duration</label><input id="un" type="number" min="1" value="1"></div></div>
  <div class="row"><div><label>Pay with</label><select id="mt"><option value="bkash">bKash</option><option value="nagad">Nagad</option></select></div><div><label>Transaction ID</label><input id="tx" placeholder="After sending payment"></div></div>
  <p class="note" id="how"></p><p><b id="tot"></b> <span class="note">(final price is calculated on the server)</span></p>
  <div class="row"><button class="btn ghost" id="x">Close</button><button class="btn" id="go">Rent Now</button></div>`;
  const upd = () => { const o = $('#pl').selectedOptions[0]; $('#tot').textContent = 'Total ≈ ' + money(o.dataset.p * (+$('#un').value || 0)); $('#how').textContent = `Send the total to ${PAY[$('#mt').value]} (${$('#mt').value}), then enter the transaction ID. Access starts after staff verify it.`; };
  ['pl', 'un', 'mt'].forEach(i => $('#' + i).oninput = upd); upd();
  $('#x').onclick = () => d.close();
  $('#go').onclick = async () => {
    if (!user) { d.close(); return authDlg(); }
    const { error } = await sb.rpc('create_rental', { p_plan: $('#pl').value, p_units: +$('#un').value, p_method: $('#mt').value, p_trx: $('#tx').value });
    if (error) return toast(error.message); toast('Booking submitted. Waiting for payment verification.'); d.close(); dash();
  };
  d.showModal();
}
function authDlg() {
  const d = $('#authDlg');
  d.innerHTML = `<h2>Log in or sign up</h2><div class="row"><input id="em" type="email" placeholder="Email" autocomplete="email"></div><div class="row"><input id="pw" type="password" placeholder="Password (min 8)" autocomplete="current-password"></div>
  <div class="row"><button class="btn ghost" id="su">Sign up</button><button class="btn" id="li">Log in</button></div>`;
  const run = async fn => { const { error } = await sb.auth[fn]({ email: $('#em').value, password: $('#pw').value }); error ? toast(error.message) : (d.close(), toast(fn === 'signUp' ? 'Check your email if confirmation is on.' : 'Welcome back.')); };
  $('#li').onclick = () => run('signInWithPassword'); $('#su').onclick = () => run('signUp'); d.showModal();
}
async function dash() {
  if (!user) return authDlg();
  const [r, n] = await Promise.all([sb.from('rentals').select('*,products(name,icon),payments(status,method)').eq('user_id', user.id).order('created_at', { ascending: false }), sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(8)]);
  const d = $('#dashDlg');
  d.innerHTML = `<h2>My rentals</h2><div class="tw"><table><tr><th>Product</th><th>Total</th><th>Status</th><th>Starts</th><th>Expires</th></tr>${(r.data || []).map(x => `<tr><td>${esc(x.products.icon)} ${esc(x.products.name)}</td><td>${money(x.total)}</td><td><span class="st ${x.status}">${x.status}</span></td><td>${when(x.starts_at)}</td><td>${when(x.expires_at)}</td></tr>`).join('') || '<tr><td colspan=5>No rentals yet.</td></tr>'}</table></div>
  <h3>Notifications</h3>${(n.data || []).map(x => `<p class="note">${when(x.created_at)} — ${esc(x.message)}</p>`).join('') || '<p class="note">Nothing new.</p>'}<button class="btn ghost" id="c">Close</button>`;
  $('#c').onclick = () => d.close(); d.open || d.showModal();
}
$('#dashBtn').onclick = dash;
$('#authBtn').onclick = async () => user ? (await sb.auth.signOut()) : authDlg();
sb.auth.onAuthStateChange((_e, s) => {
  user = s?.user ?? null; $('#authBtn').textContent = user ? 'Log out' : 'Log in';
  if (user) sb.channel('mine').on('postgres_changes', { event: '*', schema: 'public', table: 'rentals', filter: `user_id=eq.${user.id}` }, () => { toast('Your rental was updated.'); if ($('#dashDlg').open) dash(); }).subscribe();
});
load();
