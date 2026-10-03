/* ============================================================
   AarogyaGrid — admin.js  (admin.html only)
   Uses DB.adminSession (separate from the hospital/patient
   session on index.html) but reads/writes hospitals and patients
   through the API — the same data index.html reads — so a
   hospital added here can sign in on index.html immediately.
   ============================================================ */

let STATE = { admin: getData(DB.adminSession)[0] || null };

/* ---- tabs ---- */
qsa('#authTabs button').forEach(btn=>{
  btn.addEventListener('click', ()=> switchAuthTab(btn.dataset.tab));
});
function switchAuthTab(tab){
  qsa('#authTabs button').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
  qs('#signinForm').classList.toggle('hidden', tab!=='signin');
  qs('#signupForm').classList.toggle('hidden', tab!=='signup');
  qs('#errMsg').classList.remove('show');
}
function showErr(msg){ const e = qs('#errMsg'); e.textContent = msg; e.classList.add('show'); }

/* ---- sign in ---- */
qs('#signinForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const id = qs('#signinId').value.trim();
  const pass = qs('#signinPass').value;
  try{
    const record = await API.admin.signin(id, pass);
    STATE.admin = { id: record.id };
    setData(DB.adminSession, [STATE.admin]);
    enterDashboard();
  }catch(err){
    showErr(err.message || 'Incorrect ID or password. Please check the credentials and try again.');
  }
});

/* ---- sign up ---- */
qs('#signupForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const name = qs('#suName').value.trim();
  const id = qs('#suId').value.trim();
  const pass = qs('#suPass').value;
  const mobile = qs('#suMobile').value.trim();

  try{
    await API.admin.signup({ id, password: pass, name, mobile });
    toast('Admin account created — you can sign in now.');
    switchAuthTab('signin');
    qs('#signinId').value = id;
    qs('#signupForm').reset();
  }catch(err){
    showErr(err.message || 'That Admin ID is already taken — please choose another.');
  }
});

/* ============================================================
   ENTER DASHBOARD
   ============================================================ */
function enterDashboard(){
  qs('#screen-auth').classList.remove('active');
  qs('#screen-dash').classList.add('active');
  renderSidebarProfile();
  renderAdminOverview();
}

async function getCurrentRecord(){
  return API.admin.get(STATE.admin.id);
}

async function renderSidebarProfile(){
  const rec = await getCurrentRecord().catch(()=>null);
  if(!rec) return;
  const name = rec.name || rec.id;
  qs('#sideName').textContent = name;
  qs('#sideId').textContent = rec.id;
  const av = qs('#sideAvatar');
  if(rec.image){ av.style.backgroundImage = `url(${rec.image})`; av.textContent=''; }
  else { av.style.backgroundImage=''; av.textContent = initials(name); }
}

qs('#logoutBtn').addEventListener('click', ()=>{
  STATE.admin = null;
  localStorage.removeItem(DB.adminSession);
  qs('#screen-dash').classList.remove('active');
  qs('#screen-auth').classList.add('active');
});

/* ============================================================
   HOSPITALS
   ============================================================ */
qs('#toggleAddHospital').addEventListener('click', ()=> qs('#addHospitalForm').classList.toggle('hidden'));
qs('#cancelAddHospital').addEventListener('click', ()=>{ qs('#addHospitalForm').classList.add('hidden'); qs('#addHospitalForm').reset(); });

qs('#addHospitalForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const id = qs('#h_id').value.trim();

  try{
    await API.hospitals.create({
      id, password: qs('#h_pass').value,
      name: qs('#h_name').value.trim(),
      phone: qs('#h_phone').value.trim(),
      address: qs('#h_addr').value.trim(),
      subscriptionExpiry: qs('#h_expiry').value,
    });
    qs('#addHospitalForm').reset();
    qs('#addHospitalForm').classList.add('hidden');
    toast('Hospital added. Share the ID & password shown below with them.');
    renderAdminOverview();
  }catch(err){
    toast(err.message || 'That Hospital ID already exists — pick a different one.', 'error');
  }
});

async function renderAdminOverview(){
  const [hospitals, allPatientsPerHospital] = await Promise.all([
    API.hospitals.list(),
    (async ()=>{
      // patient counts are looked up per-hospital, so first fetch hospitals,
      // then fan out — done inline below once we have the hospital list
      return null;
    })(),
  ]);

  // fetch patient lists for every hospital (for counts + "hospitals in use")
  const patientLists = await Promise.all(hospitals.map(h=> API.patients.listByHospital(h.id).catch(()=>[])));
  const patientCountByHospital = {};
  let inUse = 0;
  hospitals.forEach((h, i)=>{
    const count = patientLists[i].length;
    patientCountByHospital[h.id] = count;
    if(count > 0) inUse++;
  });

  const active = hospitals.filter(h=> subStatus(h.subscriptionExpiry)!=='expired').length;
  const expired = hospitals.filter(h=> subStatus(h.subscriptionExpiry)==='expired').length;

  qs('#statTotalHosp').textContent = hospitals.length;
  qs('#statActiveHosp').textContent = active;
  qs('#statExpiredHosp').textContent = expired;
  qs('#statUsingHosp').textContent = inUse;

  const list = qs('#hospitalList');
  if(hospitals.length===0){
    list.innerHTML = emptyState('No hospitals yet — add your first hospital above.');
    return;
  }
  list.innerHTML = hospitals.slice().reverse().map(h=>{
    const st = subStatus(h.subscriptionExpiry);
    const badge = st==='expired' ? `<span class="badge badge-danger"><span class="badge-dot"></span>Expired</span>`
                : st==='soon' ? `<span class="badge badge-accent"><span class="badge-dot"></span>Expiring soon</span>`
                : `<span class="badge badge-success"><span class="badge-dot"></span>Active</span>`;
    const patientCount = patientCountByHospital[h.id] || 0;
    return `
    <div class="row-card">
      <div class="r-avatar">${initials(h.name)}</div>
      <div class="r-info">
        <b>${escapeHtml(h.name)}</b>
        <div class="meta">
          <span>ID: ${escapeHtml(h.id)}</span>
          <span>Expires: ${fmtDate(h.subscriptionExpiry)}</span>
          <span>${patientCount} patient${patientCount!==1?'s':''}</span>
        </div>
      </div>
      ${badge}
      <div class="r-actions">
        <button class="icon-btn" title="Remove" data-del-hosp="${h.id}">${ICONS.trash}</button>
      </div>
    </div>`;
  }).join('');

  // credentials are only known to the hospital itself once set (password is
  // hashed server-side), so "copy login" now just copies the ID for admin
  // reference; the password was shown at creation time via the toast above.
  qsa('[data-del-hosp]', list).forEach(b=> b.addEventListener('click', async ()=>{
    if(!confirm('Remove this hospital? Their login will stop working.')) return;
    try{
      await API.hospitals.remove(b.dataset.delHosp);
      toast('Hospital removed.');
      renderAdminOverview();
    }catch(err){
      toast(err.message || 'Could not remove hospital.', 'error');
    }
  }));
}

/* ============================================================
   PROFILE MODAL (Admin)
   ============================================================ */
qs('#profileStrip').addEventListener('click', openProfileModal);
qs('#closeProfileModal').addEventListener('click', ()=> qs('#profileModal').classList.add('hidden'));
qs('#profileModal').addEventListener('click', e=>{ if(e.target.id==='profileModal') qs('#profileModal').classList.add('hidden'); });

async function openProfileModal(){
  const rec = await getCurrentRecord().catch(()=>null);
  if(!rec) return;

  qs('#modalName').textContent = rec.name || rec.id;
  qs('#modalAvatarText').textContent = rec.image ? '' : initials(rec.name||rec.id);
  qs('#modalAvatar').style.backgroundImage = rec.image ? `url(${rec.image})` : '';

  qs('#profileFields').innerHTML = `
    <div class="field"><label>Full Name</label><input id="pf_name" value="${escapeHtml(rec.name||'')}"></div>
    <div class="field"><label>Mobile Number</label><input id="pf_mobile" value="${escapeHtml(rec.mobile||'')}"></div>
    <div class="field"><label>Email (optional)</label><input id="pf_email" value="${escapeHtml(rec.email||'')}"></div>
    <div class="field"><label>Admin ID</label><input disabled value="${escapeHtml(rec.id)}"></div>
    <div class="field"><label>New Password (leave blank to keep current)</label><input id="pf_pass" type="password" placeholder="••••••••"></div>
  `;
  qs('#profileModal').classList.remove('hidden');
}

qs('#avatarInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      await API.admin.update(STATE.admin.id, { image: reader.result });
      openProfileModal();
      renderSidebarProfile();
    }catch(err){
      toast(err.message || 'Could not update photo.', 'error');
    }
  };
  reader.readAsDataURL(file);
});

qs('#profileForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const payload = {
    name: qs('#pf_name').value.trim(),
    mobile: qs('#pf_mobile').value.trim(),
    email: qs('#pf_email').value.trim(),
  };
  const pass = qs('#pf_pass').value.trim();
  if(pass) payload.password = pass;

  try{
    await API.admin.update(STATE.admin.id, payload);
    toast('Profile updated.');
    qs('#profileModal').classList.add('hidden');
    renderSidebarProfile();
  }catch(err){
    toast(err.message || 'Could not update profile.', 'error');
  }
});

/* ============================================================
   INIT
   ============================================================ */
qs('#themeToggle').addEventListener('click', toggleTheme);

(async function init(){
  applyTheme();
  initTilt();
  initSidebarToggle();
  const saved = getData(DB.adminSession)[0];
  if(saved){
    try{
      await API.admin.get(saved.id);
      STATE.admin = saved;
      enterDashboard();
      return;
    }catch(e){
      localStorage.removeItem(DB.adminSession);
    }
  }
})();
