/* ============================================================
   AarogyaGrid — app.js  (Hospital + Doctor + Patient portal, index.html)
   Admin lives on its own page: admin.html / admin.js
   This file, admin.js both talk to the SAME backend API
   (see shared.js) — that's what keeps everything connected.

   Data flow for prescriptions:
   Doctor fills a consultation for a patient -> it lands on the
   Hospital's "Doctor Assignments" tab (status: pending) -> hospital
   clicks "Apply to patient" -> it copies into the patient's own
   record, which is what the patient's dashboard reads (status: applied).
   ============================================================ */

let STATE = { session: getData(DB.session)[0] || null };

/* ============================================================
   AUTH SCREEN NAVIGATION (Hospital / Patient / Doctor)
   ============================================================ */
let currentAuthRole = null;

qsa('.role-card[data-role]').forEach(card=>{
  card.addEventListener('click', ()=> openLoginPanel(card.dataset.role));
});

function openLoginPanel(role){
  currentAuthRole = role;
  qs('#roleSelect').classList.add('hidden');
  qs('#loginPanel').classList.remove('hidden');
  qs('#errMsg').classList.remove('show');
  qs('#signinForm').reset();
  const titles = { hospital:'Hospital', patient:'Patient', doctor:'Doctor' };
  const issuedBy = { hospital:'admin', patient:'hospital', doctor:'hospital' };
  qs('#panelTitle').textContent = titles[role] + ' Login';
  qs('#panelSub').textContent = `Sign in with the ID and password issued by your ${issuedBy[role]}`;
  qs('#signinIdLabel').textContent = titles[role] + ' ID';
}

qs('#backToRoles').addEventListener('click', ()=>{
  qs('#loginPanel').classList.add('hidden');
  qs('#roleSelect').classList.remove('hidden');
});

function showErr(msg){ const e = qs('#errMsg'); e.textContent = msg; e.classList.add('show'); }

/* ---- SIGN IN ---- */
qs('#signinForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const id = qs('#signinId').value.trim();
  const pass = qs('#signinPass').value;

  const signinFns = {
    hospital: ()=> API.hospitals.signin(id, pass),
    patient:  ()=> API.patients.signin(id, pass),
    doctor:   ()=> API.doctors.signin(id, pass),
  };

  try{
    const record = await signinFns[currentAuthRole]();
    STATE.session = { role: currentAuthRole, id: record.id };
    setData(DB.session, [STATE.session]);
    enterDashboard();
  }catch(err){
    showErr(err.message || 'Incorrect ID or password. Please check the credentials and try again.');
  }
});

/* ============================================================
   ENTER DASHBOARD
   ============================================================ */
function enterDashboard(){
  qs('#screen-auth').classList.remove('active');
  qs('#screen-dash').classList.add('active');
  buildNav();
  renderSidebarProfile();
  const first = { hospital:'hospital-overview', patient:'patient-overview', doctor:'doctor-overview' }[STATE.session.role];
  navigate(first);
}

async function getCurrentRecord(){
  const role = STATE.session.role;
  if(role==='hospital') return API.hospitals.get(STATE.session.id);
  if(role==='doctor') return API.doctors.get(STATE.session.id);
  return API.patients.get(STATE.session.id);
}

function buildNav(){
  const role = STATE.session.role;
  const nav = qs('#navItems');
  let items = [];
  if(role==='hospital') items = [
    {s:'hospital-overview', label:'Overview', icon:ICONS.grid},
    {s:'hospital-patients', label:'Patients', icon:ICONS.patients},
    {s:'hospital-doctors', label:'Doctors', icon:ICONS.doctor},
    {s:'hospital-assignments', label:'Doctor Assignments', icon:ICONS.link}
  ];
  if(role==='patient') items = [{s:'patient-overview', label:'My Dashboard', icon:ICONS.grid}];
  if(role==='doctor') items = [
    {s:'doctor-overview', label:'Overview', icon:ICONS.grid},
    {s:'doctor-patients', label:'Add Consultation', icon:ICONS.patients},
    {s:'doctor-consultations', label:'My Consultations', icon:ICONS.send}
  ];

  nav.innerHTML = items.map(it=>`<div class="nav-item" data-nav="${it.s}">${it.icon}<span>${it.label}</span></div>`).join('');
  qsa('.nav-item', nav).forEach(el=> el.addEventListener('click', ()=> navigate(el.dataset.nav)));
}

function navigate(sectionName){
  qsa('.section').forEach(s=> s.classList.toggle('active', s.dataset.section===sectionName));
  qsa('.nav-item').forEach(n=> n.classList.toggle('active', n.dataset.nav===sectionName));

  if(sectionName==='hospital-overview') renderHospitalOverview();
  if(sectionName==='hospital-patients') renderPatients();
  if(sectionName==='hospital-doctors') renderDoctors();
  if(sectionName==='hospital-assignments') renderAssignments();
  if(sectionName==='patient-overview') renderPatientOverview();
  if(sectionName==='doctor-overview') renderDoctorOverview();
  if(sectionName==='doctor-patients') renderDoctorPatientPicker();
  if(sectionName==='doctor-consultations') renderDoctorConsultations();
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
  STATE.session = null;
  localStorage.removeItem(DB.session);
  qs('#screen-dash').classList.remove('active');
  qs('#screen-auth').classList.add('active');
  qs('#loginPanel').classList.add('hidden');
  qs('#roleSelect').classList.remove('hidden');
});

/* ============================================================
   HOSPITAL — OVERVIEW
   ============================================================ */
async function renderHospitalOverview(){
  const rec = await getCurrentRecord().catch(()=>null);
  if(!rec) return;
  qs('#hospGreetName').textContent = rec.name;

  const [patients, doctors] = await Promise.all([
    API.patients.listByHospital(rec.id),
    API.doctors.listByHospital(rec.id),
  ]);
  const upcoming = patients.filter(p=> p.appointmentDate && daysDiff(p.appointmentDate) >= 0 && daysDiff(p.appointmentDate) <= 7).length;

  qs('#statTotalPatients').textContent = patients.length;
  qs('#statTotalDoctors').textContent = doctors.length;
  qs('#statUpcomingAppts').textContent = upcoming;

  const st = subStatus(rec.subscriptionExpiry);
  const banner = qs('#hospSubBanner');
  if(st==='expired'){
    banner.innerHTML = `<div class="notify-banner" style="background:var(--danger-soft);border-color:var(--danger);"><span style="stroke:var(--danger);display:flex;">${ICONS.bell}</span><div><b style="color:var(--danger)">Subscription expired</b><div style="font-size:12.5px;color:var(--ink-dim);">It expired on ${fmtDate(rec.subscriptionExpiry)}. Contact your admin to renew.</div></div></div>`;
  } else if(st==='soon'){
    banner.innerHTML = `<div class="notify-banner">${ICONS.bell}<div><b>Subscription expiring soon</b><div style="font-size:12.5px;color:var(--ink-dim);">Renews on ${fmtDate(rec.subscriptionExpiry)} — reach out to your admin.</div></div></div>`;
  } else {
    banner.innerHTML = '';
  }
}

/* ============================================================
   HOSPITAL — PATIENTS
   ============================================================ */
qs('#toggleAddPatient').addEventListener('click', ()=> qs('#addPatientForm').classList.toggle('hidden'));
qs('#cancelAddPatient').addEventListener('click', ()=>{ qs('#addPatientForm').classList.add('hidden'); qs('#addPatientForm').reset(); });

function fileToDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

qs('#addPatientForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const id = qs('#p_id').value.trim();
  const rxFile = qs('#p_rx_image').files[0];

  try{
    const prescriptionImage = rxFile ? await fileToDataUrl(rxFile) : null;
    await API.patients.create({
      id, password: qs('#p_pass').value,
      name: qs('#p_name').value.trim(),
      age: qs('#p_age').value.trim(),
      phone: qs('#p_phone').value.trim(),
      appointmentDate: qs('#p_appt').value,
      prescription: qs('#p_rx').value.trim(),
      prescriptionImage,
      hospitalId: STATE.session.id,
    });
    qs('#addPatientForm').reset();
    qs('#addPatientForm').classList.add('hidden');
    toast('Patient added. Share their ID & password so they can sign in.');
    renderPatients();
  }catch(err){
    toast(err.message || 'That Patient ID already exists — pick a different one.', 'error');
  }
});

async function renderPatients(){
  const patients = await API.patients.listByHospital(STATE.session.id).catch(()=>[]);
  const list = qs('#patientList');
  if(patients.length===0){ list.innerHTML = emptyState('No patients yet — add your first patient above.'); return; }

  list.innerHTML = patients.slice().reverse().map(p=>{
    const d = p.appointmentDate ? daysDiff(p.appointmentDate) : null;
    let badge = '';
    if(d!==null){
      if(d < 0) badge = `<span class="badge badge-danger">Past visit</span>`;
      else if(d===0) badge = `<span class="badge badge-accent">Today</span>`;
      else badge = `<span class="badge badge-success">In ${d}d</span>`;
    }
    return `
    <div class="row-card">
      <div class="r-avatar">${initials(p.name)}</div>
      <div class="r-info">
        <b>${escapeHtml(p.name)}</b>
        <div class="meta">
          <span>ID: ${escapeHtml(p.id)}</span>
          <span>${escapeHtml(p.age||'—')}</span>
          <span>Appt: ${fmtDate(p.appointmentDate)}</span>
        </div>
      </div>
      ${badge}
      <div class="r-actions">
        <button class="icon-btn" title="Remove" data-del-pat="${p.id}">${ICONS.trash}</button>
      </div>
    </div>`;
  }).join('');

  qsa('[data-del-pat]', list).forEach(b=> b.addEventListener('click', async ()=>{
    if(!confirm('Remove this patient record?')) return;
    try{
      await API.patients.remove(b.dataset.delPat);
      toast('Patient removed.');
      renderPatients();
    }catch(err){
      toast(err.message || 'Could not remove patient.', 'error');
    }
  }));
}

/* ============================================================
   HOSPITAL — DOCTORS
   ============================================================ */
qs('#toggleAddDoctor').addEventListener('click', ()=> qs('#addDoctorForm').classList.toggle('hidden'));
qs('#cancelAddDoctor').addEventListener('click', ()=>{ qs('#addDoctorForm').classList.add('hidden'); qs('#addDoctorForm').reset(); });

qs('#addDoctorForm').addEventListener('submit', async e=>{
  e.preventDefault();

  try{
    await API.doctors.create({
      id: qs('#d_id').value.trim(),
      password: qs('#d_pass').value,
      name: qs('#d_name').value.trim(),
      specialization: qs('#d_spec').value.trim(),
      phone: qs('#d_phone').value.trim(),
      days: qs('#d_days').value.trim(),
      hospitalId: STATE.session.id,
    });
    qs('#addDoctorForm').reset();
    qs('#addDoctorForm').classList.add('hidden');
    toast('Doctor added. Share their ID & password so they can sign in.');
    renderDoctors();
  }catch(err){
    toast(err.message || 'That Doctor ID already exists — pick a different one.', 'error');
  }
});

async function renderDoctors(){
  const doctors = await API.doctors.listByHospital(STATE.session.id).catch(()=>[]);
  const list = qs('#doctorList');
  if(doctors.length===0){ list.innerHTML = emptyState('No doctors yet — add your first doctor above.'); return; }

  list.innerHTML = doctors.slice().reverse().map(d=>`
    <div class="row-card">
      <div class="r-avatar">${initials(d.name)}</div>
      <div class="r-info">
        <b>${escapeHtml(d.name)}</b>
        <div class="meta">
          <span>ID: ${escapeHtml(d.id)}</span>
          <span>${escapeHtml(d.specialization||'—')}</span>
          <span>${escapeHtml(d.phone||'—')}</span>
          <span>${escapeHtml(d.days||'—')}</span>
        </div>
      </div>
      <div class="r-actions">
        <button class="icon-btn" title="Remove" data-del-doc="${d.id}">${ICONS.trash}</button>
      </div>
    </div>`).join('');

  qsa('[data-del-doc]', list).forEach(b=> b.addEventListener('click', async ()=>{
    if(!confirm('Remove this doctor record?')) return;
    try{
      await API.doctors.remove(b.dataset.delDoc);
      toast('Doctor removed.');
      renderDoctors();
    }catch(err){
      toast(err.message || 'Could not remove doctor.', 'error');
    }
  }));
}

/* ============================================================
   HOSPITAL — DOCTOR ↔ PATIENT ASSIGNMENTS
   (consultations doctors have filled in, grouped by doctor)
   ============================================================ */
async function renderAssignments(){
  const wrap = qs('#assignmentsWrap');
  const consultations = await API.consultations.listByHospital(STATE.session.id).catch(()=>[]);

  if(consultations.length===0){
    wrap.innerHTML = emptyState('No consultations yet — once a doctor sends one in, it will show up here.');
    return;
  }

  const byDoctor = {};
  consultations.forEach(c=>{
    (byDoctor[c.doctorId] ||= { name: c.doctorName, items: [] }).items.push(c);
  });

  wrap.innerHTML = Object.entries(byDoctor).map(([doctorId, group])=>{
    const patientNames = [...new Set(group.items.map(c=> c.patientName))];
    const rows = group.items.map(c=>{
      const badge = c.status==='applied'
        ? `<span class="badge badge-success">${ICONS.check} Sent to patient</span>`
        : `<span class="badge badge-accent">Pending review</span>`;
      const applyBtn = c.status==='pending'
        ? `<button class="btn btn-primary btn-sm" data-apply="${c.id}">Apply to patient</button>`
        : '';
      return `
      <div class="row-card">
        <div class="r-avatar">${initials(c.patientName)}</div>
        <div class="r-info">
          <b>${escapeHtml(c.patientName)}</b>
          <div class="meta">
            <span>Visit: ${fmtDate(c.visitDate)}</span>
            <span>Submitted: ${fmtDate(c.createdAt)}</span>
          </div>
        </div>
        ${badge}
        <div class="r-actions">
          ${applyBtn}
          <button class="icon-btn" title="Remove" data-del-consult="${c.id}">${ICONS.trash}</button>
        </div>
      </div>`;
    }).join('');

    return `
    <div class="assign-group">
      <div class="assign-group-head">
        <div class="r-avatar" style="width:30px;height:30px;font-size:11px;">${initials(group.name)}</div>
        <b>Dr. ${escapeHtml(group.name)}</b>
        <span>${patientNames.length} patient${patientNames.length!==1?'s':''} · ${group.items.length} consultation${group.items.length!==1?'s':''}</span>
      </div>
      <div class="list">${rows}</div>
    </div>`;
  }).join('');

  qsa('[data-apply]', wrap).forEach(b=> b.addEventListener('click', async ()=>{
    try{
      await API.consultations.apply(b.dataset.apply);
      toast('Prescription sent to the patient\u2019s dashboard.');
      renderAssignments();
    }catch(err){
      toast(err.message || 'Could not apply this consultation.', 'error');
    }
  }));
  qsa('[data-del-consult]', wrap).forEach(b=> b.addEventListener('click', async ()=>{
    if(!confirm('Remove this consultation record?')) return;
    try{
      await API.consultations.remove(b.dataset.delConsult);
      toast('Consultation removed.');
      renderAssignments();
    }catch(err){
      toast(err.message || 'Could not remove consultation.', 'error');
    }
  }));
}

/* ============================================================
   DOCTOR — OVERVIEW
   ============================================================ */
async function renderDoctorOverview(){
  const rec = await getCurrentRecord().catch(()=>null);
  if(!rec) return;
  qs('#doctorGreetName').textContent = `Welcome, Dr. ${rec.name}`;

  const consultations = await API.consultations.listByDoctor(rec.id).catch(()=>[]);
  const uniquePatients = new Set(consultations.map(c=> c.patientId)).size;
  const applied = consultations.filter(c=> c.status==='applied').length;

  qs('#statDoctorConsults').textContent = consultations.length;
  qs('#statDoctorPatients').textContent = uniquePatients;
  qs('#statDoctorApplied').textContent = applied;
}

/* ============================================================
   DOCTOR — ADD A CONSULTATION (fill a patient's prescription)
   ============================================================ */
async function renderDoctorPatientPicker(){
  const rec = await getCurrentRecord().catch(()=>null);
  if(!rec) return;
  const patients = await API.patients.listByHospital(rec.hospitalId).catch(()=>[]);
  const select = qs('#c_patient');
  if(patients.length===0){
    select.innerHTML = `<option value="">No patients at this hospital yet</option>`;
    return;
  }
  select.innerHTML = patients.map(p=> `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.id)})</option>`).join('');
}

qs('#addConsultForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const patientId = qs('#c_patient').value;
  if(!patientId){ toast('No patient selected.', 'error'); return; }

  try{
    await API.consultations.create({
      doctorId: STATE.session.id,
      patientId,
      prescription: qs('#c_rx').value.trim(),
      notes: qs('#c_notes').value.trim(),
      visitDate: qs('#c_visit').value,
    });
    qs('#addConsultForm').reset();
    toast('Sent to your hospital for review.');
    renderDoctorPatientPicker();
  }catch(err){
    toast(err.message || 'Could not submit consultation.', 'error');
  }
});

/* ============================================================
   DOCTOR — MY CONSULTATIONS
   ============================================================ */
async function renderDoctorConsultations(){
  const consultations = await API.consultations.listByDoctor(STATE.session.id).catch(()=>[]);
  const list = qs('#doctorConsultList');
  if(consultations.length===0){ list.innerHTML = emptyState('You haven\u2019t submitted any consultations yet.'); return; }

  list.innerHTML = consultations.map(c=>{
    const badge = c.status==='applied'
      ? `<span class="badge badge-success">${ICONS.check} Reached patient</span>`
      : `<span class="badge badge-accent">Pending hospital review</span>`;
    return `
    <div class="row-card">
      <div class="r-avatar">${initials(c.patientName)}</div>
      <div class="r-info">
        <b>${escapeHtml(c.patientName)}</b>
        <div class="meta">
          <span>Visit: ${fmtDate(c.visitDate)}</span>
          <span>Submitted: ${fmtDate(c.createdAt)}</span>
        </div>
      </div>
      ${badge}
    </div>`;
  }).join('');
}

/* ============================================================
   PATIENT — OVERVIEW
   ============================================================ */
async function renderPatientOverview(){
  const rec = await getCurrentRecord().catch(()=>null);
  if(!rec) return;
  qs('#patientGreet').textContent = `Welcome, ${rec.name}`;

  const hospital = await API.hospitals.get(rec.hospitalId).catch(()=>null);

  const notifyWrap = qs('#patientNotifyWrap');
  const nextMeet = qs('#patientNextMeet');
  if(rec.appointmentDate){
    const d = daysDiff(rec.appointmentDate);
    if(d>=0 && d<=3){
      notifyWrap.innerHTML = `<div class="notify-banner">${ICONS.bell}<div><b>${d===0?'Your appointment is today':`Appointment in ${d} day${d!==1?'s':''}`}</b><div style="font-size:12.5px;color:var(--ink-dim);">${fmtDate(rec.appointmentDate)} at ${escapeHtml(hospital?hospital.name:'your hospital')}</div></div></div>`;
    } else { notifyWrap.innerHTML=''; }
    nextMeet.innerHTML = `<div class="next-meet"><div class="lbl">Next Meeting Date</div><div class="date">${fmtDate(rec.appointmentDate)}</div></div>`;
  } else {
    notifyWrap.innerHTML=''; nextMeet.innerHTML='';
  }

  qs('#patientRx').textContent = rec.prescription && rec.prescription.trim() ? rec.prescription : 'No prescription has been added yet.';

  const rxImg = qs('#patientRxImage');
  if(rec.prescriptionImage){ rxImg.src = rec.prescriptionImage; rxImg.classList.remove('hidden'); }
  else { rxImg.classList.add('hidden'); rxImg.removeAttribute('src'); }

  qs('#patientDetailsGrid').innerHTML = `
    <div class="field"><label>Name</label><input disabled value="${escapeHtml(rec.name)}"></div>
    <div class="field"><label>Age / Gender</label><input disabled value="${escapeHtml(rec.age||'—')}"></div>
    <div class="field"><label>Phone</label><input disabled value="${escapeHtml(rec.phone||'—')}"></div>
    <div class="field"><label>Hospital</label><input disabled value="${escapeHtml(hospital?hospital.name:'—')}"></div>
    <div class="field"><label>Patient ID</label><input disabled value="${escapeHtml(rec.id)}"></div>
    <div class="field"><label>Appointment Date</label><input disabled value="${fmtDate(rec.appointmentDate)}"></div>
  `;
}

/* ============================================================
   PROFILE MODAL (Hospital / Patient / Doctor)
   ============================================================ */
qs('#profileStrip').addEventListener('click', openProfileModal);
qs('#closeProfileModal').addEventListener('click', ()=> qs('#profileModal').classList.add('hidden'));
qs('#profileModal').addEventListener('click', e=>{ if(e.target.id==='profileModal') qs('#profileModal').classList.add('hidden'); });

async function openProfileModal(){
  const role = STATE.session.role;
  const rec = await getCurrentRecord().catch(()=>null);
  if(!rec) return;

  qs('#modalName').textContent = rec.name || rec.id;
  qs('#modalRole').textContent = role + ' account';
  qs('#modalAvatarText').textContent = rec.image ? '' : initials(rec.name||rec.id);
  qs('#modalAvatar').style.backgroundImage = rec.image ? `url(${rec.image})` : '';

  let fieldsHtml = '';
  if(role==='hospital'){
    fieldsHtml = `
      <div class="field"><label>Hospital Name</label><input id="pf_name" value="${escapeHtml(rec.name||'')}"></div>
      <div class="field"><label>Telephone Number</label><input id="pf_mobile" value="${escapeHtml(rec.telephone||rec.phone||'')}"></div>
      <div class="field"><label>Username</label><input disabled value="${escapeHtml(rec.id)}"></div>
      <div class="field"><label>New Password (leave blank to keep current)</label><input id="pf_pass" type="password" placeholder="••••••••"></div>
    `;
  } else if(role==='doctor'){
    fieldsHtml = `
      <div class="field"><label>Doctor Name</label><input id="pf_name" value="${escapeHtml(rec.name||'')}"></div>
      <div class="field"><label>Specialization</label><input id="pf_spec" value="${escapeHtml(rec.specialization||'')}"></div>
      <div class="field"><label>Phone</label><input id="pf_mobile" value="${escapeHtml(rec.phone||'')}"></div>
      <div class="field"><label>Doctor ID</label><input disabled value="${escapeHtml(rec.id)}"></div>
      <div class="field"><label>New Password (leave blank to keep current)</label><input id="pf_pass" type="password" placeholder="••••••••"></div>
    `;
  } else {
    fieldsHtml = `
      <div class="field"><label>Name</label><input disabled value="${escapeHtml(rec.name||'')}"></div>
      <div class="field"><label>Patient ID</label><input disabled value="${escapeHtml(rec.id)}"></div>
      <div class="field"><label>New Password (leave blank to keep current)</label><input id="pf_pass" type="password" placeholder="••••••••"></div>
    `;
  }
  qs('#profileFields').innerHTML = fieldsHtml;
  qs('#profileModal').classList.remove('hidden');
}

qs('#avatarInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const role = STATE.session.role;
      const apiByRole = { hospital: API.hospitals, doctor: API.doctors, patient: API.patients };
      await apiByRole[role].update(STATE.session.id, { image: reader.result });
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
  const role = STATE.session.role;

  const nameEl = qs('#pf_name'); const mobileEl = qs('#pf_mobile');
  const specEl = qs('#pf_spec'); const passEl = qs('#pf_pass');
  const payload = {};
  if(nameEl) payload.name = nameEl.value.trim();
  if(mobileEl){ payload.telephone = mobileEl.value.trim(); payload.phone = mobileEl.value.trim(); }
  if(specEl) payload.specialization = specEl.value.trim();
  if(passEl && passEl.value.trim()) payload.password = passEl.value.trim();

  try{
    const apiByRole = { hospital: API.hospitals, doctor: API.doctors, patient: API.patients };
    await apiByRole[role].update(STATE.session.id, payload);

    toast('Profile updated.');
    qs('#profileModal').classList.add('hidden');
    renderSidebarProfile();
    if(role==='hospital') renderHospitalOverview();
    if(role==='doctor') renderDoctorOverview();
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
  const savedSession = getData(DB.session)[0];
  if(savedSession){
    try{
      const getFns = { hospital: API.hospitals.get, patient: API.patients.get, doctor: API.doctors.get };
      await getFns[savedSession.role](savedSession.id);
      STATE.session = savedSession;
      enterDashboard();
      return;
    }catch(e){
      localStorage.removeItem(DB.session);
    }
  }
})();
