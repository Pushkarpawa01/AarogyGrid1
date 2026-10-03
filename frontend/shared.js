/* ============================================================
   AarogyaGrid — shared.js
   Loaded by BOTH index.html (hospital + patient) and admin.html.

   Data now lives in MySQL, served by the Python backend
   (server.py) at /api/*. This file exposes a small `API` client
   that app.js / admin.js call with `await`. Only the *session*
   (who is currently logged in) still lives in localStorage —
   that's just "which ID is this browser tab logged in as", not
   app data, so it's fine to keep client-side.
   ============================================================ */

const DB = {
  session:      'ag_session',        // active hospital/patient session (index.html)
  adminSession: 'ag_admin_session',  // active admin session (admin.html) — kept separate
  theme:        'ag_theme'           // shared, so both pages stay in the same mode
};

const qs  = (s,el=document)=>el.querySelector(s);
const qsa = (s,el=document)=>[...el.querySelectorAll(s)];

/* ---------- tiny localStorage helpers, used only for session + theme ---------- */
function getData(key){ try{ return JSON.parse(localStorage.getItem(key)) || []; }catch(e){ return []; } }
function setData(key,val){ localStorage.setItem(key, JSON.stringify(val)); }

/* ============================================================
   API client — talks to the Python/MySQL backend.
   Same origin as the page (server.py serves both the static
   files and /api/*), so plain relative paths work.
   ============================================================ */
const API_BASE = '/api';

async function apiRequest(method, path, body){
  const opts = { method, headers: {} };
  if(body !== undefined){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try{
    res = await fetch(API_BASE + path, opts);
  }catch(err){
    throw new Error('Could not reach the server. Is the backend running?');
  }
  let data = null;
  try{ data = await res.json(); }catch(e){ /* empty body, fine for 204s */ }
  if(!res.ok){
    const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

const API = {
  admin: {
    signup: (payload)=> apiRequest('POST', '/admin/signup', payload),
    signin: (id, password)=> apiRequest('POST', '/admin/signin', {id, password}),
    get:    (id)=> apiRequest('GET', `/admin/${encodeURIComponent(id)}`),
    update: (id, payload)=> apiRequest('PUT', `/admin/${encodeURIComponent(id)}`, payload),
  },
  hospitals: {
    list:   ()=> apiRequest('GET', '/hospitals'),
    create: (payload)=> apiRequest('POST', '/hospitals', payload),
    remove: (id)=> apiRequest('DELETE', `/hospitals/${encodeURIComponent(id)}`),
    signin: (id, password)=> apiRequest('POST', '/hospital/signin', {id, password}),
    get:    (id)=> apiRequest('GET', `/hospital/${encodeURIComponent(id)}`),
    update: (id, payload)=> apiRequest('PUT', `/hospital/${encodeURIComponent(id)}`, payload),
  },
  patients: {
    listByHospital: (hospitalId)=> apiRequest('GET', `/patients?hospitalId=${encodeURIComponent(hospitalId)}`),
    create: (payload)=> apiRequest('POST', '/patients', payload),
    remove: (id)=> apiRequest('DELETE', `/patients/${encodeURIComponent(id)}`),
    signin: (id, password)=> apiRequest('POST', '/patient/signin', {id, password}),
    get:    (id)=> apiRequest('GET', `/patient/${encodeURIComponent(id)}`),
    update: (id, payload)=> apiRequest('PUT', `/patient/${encodeURIComponent(id)}`, payload),
  },
  doctors: {
    listByHospital: (hospitalId)=> apiRequest('GET', `/doctors?hospitalId=${encodeURIComponent(hospitalId)}`),
    create: (payload)=> apiRequest('POST', '/doctors', payload),
    remove: (id)=> apiRequest('DELETE', `/doctors/${encodeURIComponent(id)}`),
    signin: (id, password)=> apiRequest('POST', '/doctor/signin', {id, password}),
    get:    (id)=> apiRequest('GET', `/doctor/${encodeURIComponent(id)}`),
    update: (id, payload)=> apiRequest('PUT', `/doctor/${encodeURIComponent(id)}`, payload),
  },
  consultations: {
    listByDoctor:   (doctorId)=> apiRequest('GET', `/consultations?doctorId=${encodeURIComponent(doctorId)}`),
    listByHospital: (hospitalId)=> apiRequest('GET', `/consultations?hospitalId=${encodeURIComponent(hospitalId)}`),
    create: (payload)=> apiRequest('POST', '/consultations', payload),
    apply:  (id)=> apiRequest('POST', `/consultations/${encodeURIComponent(id)}/apply`),
    remove: (id)=> apiRequest('DELETE', `/consultations/${encodeURIComponent(id)}`),
  },
};

function initials(name){
  if(!name) return '?';
  return name.trim().split(/\s+/).slice(0,2).map(w=>w[0].toUpperCase()).join('');
}
function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
function fmtDate(str){
  if(!str) return '—';
  const d = new Date(str+'T00:00:00');
  if(isNaN(d)) return str;
  return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
function daysDiff(dateStr){
  const d = new Date(dateStr+'T00:00:00'); const t = new Date(todayISO()+'T00:00:00');
  return Math.round((d-t)/86400000);
}
function subStatus(expiry){
  const d = daysDiff(expiry);
  if(d < 0) return 'expired';
  if(d <= 7) return 'soon';
  return 'active';
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const ICONS = {
  grid:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
  patients:`<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5S15.5 16.4 15.5 20M16 8.2c1.3.3 2.3 1.5 2.3 2.9M21 20c0-2.6-1.7-4.7-4-5.5"/></svg>`,
  doctor:`<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M8 3v4a4 4 0 008 0V3M4 10v3a8 8 0 0016 0v-3M12 21v-3"/><circle cx="19" cy="6" r="2"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>`,
  copy:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/></svg>`,
  bell:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>`,
  sun:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  moon:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>`,
  empty: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10h8M8 14h5"/></svg>`,
  link:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1"/></svg>`,
  send:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`
};

/* ---------- toast (needs a #toastWrap element on the page) ---------- */
function toast(msg, type='success'){
  const wrap = qs('#toastWrap');
  if(!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, 2600);
}

function copyCreds(id, pass){
  const text = `ID: ${id}\nPassword: ${pass}`;
  if(navigator.clipboard) navigator.clipboard.writeText(text).catch(()=>{});
  toast('Login copied to clipboard.');
}

function emptyState(msg){
  return `<div class="empty-state">${ICONS.empty}<p>${msg}</p></div>`;
}

/* ---------- theme (shared across both pages via ag_theme) ---------- */
function applyTheme(){
  const theme = localStorage.getItem(DB.theme) || 'light';
  document.body.classList.toggle('dark', theme==='dark');
  const label = qs('#themeLabel'); if(label) label.textContent = theme==='dark' ? 'Day Mode' : 'Night Mode';
  const icon = qs('#themeIcon');
  if(icon) icon.innerHTML = (theme==='dark' ? ICONS.sun : ICONS.moon).match(/<svg[^>]*>(.*)<\/svg>/s)[1];
}
function toggleTheme(){
  const cur = localStorage.getItem(DB.theme) || 'light';
  localStorage.setItem(DB.theme, cur==='dark' ? 'light' : 'dark');
  applyTheme();
}

/* ---------- collapsible sidebar (shared by index.html + admin.html) ----------
   Persists per-device via localStorage so it stays collapsed/expanded
   across reloads. Needs <aside class="sidebar"> and a button with
   id="sidebarToggle" somewhere inside it. ---------- */
const DB_SIDEBAR = 'ag_sidebar_collapsed';
function applySidebarState(){
  const collapsed = localStorage.getItem(DB_SIDEBAR) === '1';
  const sidebar = qs('.sidebar');
  if(sidebar) sidebar.classList.toggle('collapsed', collapsed);
}
function initSidebarToggle(){
  applySidebarState();
  const btn = qs('#sidebarToggle');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    const sidebar = qs('.sidebar');
    if(!sidebar) return;
    const collapsed = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed', collapsed);
    localStorage.setItem(DB_SIDEBAR, collapsed ? '1' : '0');
  });
}

/* ---------- 3D tilt-on-hover ---------- */
function initTilt(){
  qsa('.tilt').forEach(el=>{
    el.addEventListener('mousemove', e=>{
      const r = el.getBoundingClientRect();
      const rx = (((e.clientY - r.top)/r.height) - 0.5) * -10;
      const ry = (((e.clientX - r.left)/r.width) - 0.5) * 10;
      el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(4px)`;
    });
    el.addEventListener('mouseleave', ()=>{ el.style.transform = 'perspective(700px) rotateX(0) rotateY(0)'; });
  });
}
