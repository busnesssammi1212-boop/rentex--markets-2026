import { sb, $, esc, money, when, toast, particles } from './supa.js';
particles();
let me, tab = 'stats', cats = [];
const M = $('#main');
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return login();
  const { data } = await sb.from('profiles').select('role,email').eq('id', session.user.id).single(); me = data;
  if (!me || !['admin', 'staff'].includes(me.role)) return (M.innerHTML = '<div class="glass" style="padding:24px"><h2>Access denied</h2><p>This account is not staff.</p><button class="btn" id="lo">Log out</button></div>', $('#lo').onclick = async () => { await sb.auth.signOut(); location.reload(); });
  cats = (await sb.from('categories').select('*').order('sort')).data; render();
}
function login() {
  M.innerHTML = `<div class="glass" style="padding:24px;max-width:400px"><h2>Staff login</h2><div class="row"><input id="em" type="email" placeholder="Email"></div><div class="row"><input id="pw" type="password" placeholder="Password"></div><button class="btn" id="li">Log in</button></div>`;
  $('#li').onclick = async () => { const { error } = await sb.auth.signInWithPassword({ email: $('#em').value, password: $('#pw').value }); error ? toast(error.message) : boot(); };
}
async function render() {
  const t = ['stats', 'payments', 'bookings', 'products', 'customers'];
  M.innerHTML = `<div class="tabs">${t.map(x => `<button class="btn ${x === tab ? '' : 'ghost'} sm" data-t="${x}">${x}</button>`).join('')}</div><div id="v"></div>`;
  M.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; render(); } };
  await V[tab]();
}
const tbl = (h, rows) => `<div class="glass tw" style="padding:10px"><table><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr>${rows.join('') || `<tr><td colspan=${h.length}>Nothing here yet.</td></tr>`}</table></div>`;
const V = {
  async stats() { const { data: s } = await sb.rpc('admin_stats'); $('#v').innerHTML = `<div class="stats">${[['Revenue (verified)', money(s.revenue)], ['Active rentals', s.active], ['Expired', s.expired], ['Pending', s.pending], ['Bookings', s.bookings], ['Customers', s.customers]].map(([k, v]) => `<div class="glass stat"><b>${v}</b>${k}</div>`).join('')}</div>`; },
  async payments() {
    const { data } = await sb.from('payments').select('*,rentals(units,unit,products(name)),profiles(email)').order('created_at', { ascending: false }).limit(100);
    $('#v').innerHTML = tbl(['When', 'Customer', 'Product', 'Method', 'Trx ID', 'Amount', 'Status', ''], data.map(p => `<tr><td>${when(p.created_at)}</td><td>${esc(p.profiles?.email)}</td><td>${esc(p.rentals.products.name)} × ${p.rentals.units} ${p.rentals.unit}</td><td>${p.method}</td><td>${esc(p.trx_id)}</td><td>${money(p.amount)}</td><td><span class="st ${p.status}">${p.status}</span></td><td>${p.status === 'pending' ? `<button class="btn sm" data-a="1" data-id="${p.id}">Approve</button> <button class="btn bad sm" data-a="0" data-id="${p.id}">Reject</button>` : ''}</td></tr>`));
    $('#v').onclick = async e => { const b = e.target.closest('[data-a]'); if (!b) return; const { error } = await sb.rpc('review_payment', { p_payment: b.dataset.id, p_approve: b.dataset.a === '1' }); error ? toast(error.message) : (toast('Updated'), render()); };
  },
  async bookings() { const { data } = await sb.from('rentals').select('*,products(name),profiles(email)').order('created_at', { ascending: false }).limit(200);
    $('#v').innerHTML = tbl(['Customer', 'Product', 'Total', 'Status', 'Expires', ''], data.map(r => `<tr><td>${esc(r.profiles?.email)}</td><td>${esc(r.products.name)}</td><td>${money(r.total)}</td><td><span class="st ${r.status}">${r.status}</span></td><td>${when(r.expires_at)}</td><td>${r.status === 'active' ? `<button class="btn sm" data-dl="${r.id}">${r.delivery_note ? 'Edit details' : 'Send details'}</button>` : ''}</td></tr>`));
    $('#v').onclick = async e => { const b = e.target.closest('[data-dl]'); if (!b) return; const note = prompt('Access details for the customer (account, code, link):'); if (!note) return; const { error } = await sb.rpc('set_delivery', { p_rental: b.dataset.dl, p_note: note }); error ? toast(error.message) : (toast('Sent'), render()); }; },
  async customers() { const { data } = await sb.from('profiles').select('*').order('created_at', { ascending: false }); $('#v').innerHTML = tbl(['Email', 'Role', 'Joined'], data.map(c => `<tr><td>${esc(c.email)}</td><td>${c.role}</td><td>${when(c.created_at)}</td></tr>`)); },
  async products() {
    const { data } = await sb.from('products').select('*,plans(*)').order('created_at', { ascending: false });
    $('#v').innerHTML = `<button class="btn" id="new" style="margin-bottom:14px">Add product</button>` + tbl(['Product', 'Plans', 'Authorized', 'Published', ''], data.map(p => `<tr><td>${esc(p.icon)} ${esc(p.name)}</td><td>${p.plans.map(x => money(x.price) + '/' + x.unit).join(', ')}</td><td>${p.authorized ? 'Yes' : 'No'}</td><td>${p.published ? 'Yes' : 'No'}</td><td><button class="btn ghost sm" data-e="${p.id}">Edit</button> <button class="btn ghost sm" data-p="${p.id}">${p.published ? 'Unpublish' : 'Publish'}</button> <button class="btn bad sm" data-d="${p.id}">Delete</button></td></tr>`));
    $('#new').onclick = () => form(); const byId = id => data.find(p => p.id === id);
    $('#v').onclick = async e => { const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.e) return form(byId(b.dataset.e));
      if (b.dataset.p) { const p = byId(b.dataset.p); if (!p.published && !p.authorized) return toast('Confirm you are authorized to rent this product before publishing.'); await sb.from('products').update({ published: !p.published }).eq('id', p.id); return render(); }
      if (b.dataset.d && confirm('Delete this product? Products with rentals cannot be deleted; unpublish instead.')) { const { error } = await sb.from('products').delete().eq('id', b.dataset.d); error ? toast('Cannot delete: it has rentals. Unpublish instead.') : render(); } };
  }
};
function form(p = { plans: [] }) {
  const d = $('#dlg'), pr = u => p.plans.find(x => x.unit === u)?.price ?? '';
  d.innerHTML = `<h2>${p.id ? 'Edit' : 'Add'} product</h2>
  <div class="row"><input id="n" placeholder="Name" value="${esc(p.name)}"><input id="i" placeholder="Icon (emoji)" value="${esc(p.icon || '✦')}" style="max-width:110px"></div>
  <div class="row"><select id="c">${cats.map(c => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
  <div class="row"><textarea id="ds" placeholder="Description">${esc(p.description)}</textarea></div>
  <div class="row"><input id="ft" placeholder="Features, comma separated" value="${esc((p.features || []).join(', '))}"></div>
  <div class="row"><input id="rq" placeholder="Requirements" value="${esc(p.requirements)}"><input id="tm" placeholder="Rental terms" value="${esc(p.terms)}"></div>
  <div class="row"><div><label>Hourly price (blank = off)</label><input id="ph" type="number" min="0" value="${pr('hour')}"></div><div><label>Daily price</label><input id="pd" type="number" min="0" value="${pr('day')}"></div><div><label>Monthly price</label><input id="pm" type="number" min="0" value="${pr('month')}"></div></div>
  <div class="row"><div><label>Stock (blank = unlimited)</label><input id="sk" type="number" min="0" value="${p.stock ?? ''}"></div></div>
  <label><input id="au" type="checkbox" style="width:auto" ${p.authorized ? 'checked' : ''}> I confirm I am licensed/authorized to rent this product</label>
  <label><input id="pb" type="checkbox" style="width:auto" ${p.published ? 'checked' : ''}> Published</label>
  <div class="row"><button class="btn ghost" id="x">Cancel</button><button class="btn" id="s">Save</button></div>`;
  $('#x').onclick = () => d.close();
  $('#s').onclick = async () => {
    const row = { name: $('#n').value.trim(), icon: $('#i').value, category_id: +$('#c').value, description: $('#ds').value, features: $('#ft').value.split(',').map(s => s.trim()).filter(Boolean), requirements: $('#rq').value, terms: $('#tm').value, stock: $('#sk').value === '' ? null : +$('#sk').value, authorized: $('#au').checked, published: $('#pb').checked && $('#au').checked };
    if (!row.name) return toast('Name is required.');
    const r = p.id ? await sb.from('products').update(row).eq('id', p.id).select().single() : await sb.from('products').insert(row).select().single();
    if (r.error) return toast(r.error.message);
    const plans = [['hour', 'ph'], ['day', 'pd'], ['month', 'pm']].filter(([, k]) => +$('#' + k).value > 0).map(([unit, k]) => ({ product_id: r.data.id, unit, price: +$('#' + k).value }));
    await sb.from('plans').delete().eq('product_id', r.data.id); if (plans.length) await sb.from('plans').insert(plans);
    d.close(); toast('Saved'); render();
  };
  d.showModal();
}
boot();
