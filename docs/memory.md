# AarogyaGrid — Project Memory

A 4-role healthcare web app: **Admin → Hospital → {Doctor, Patient}**,
where each role issues the login for the role(s) below it, and a
doctor's prescription only reaches a patient after the hospital
reviews and applies it. Backend is plain Python (`http.server`, no
framework) + MySQL (via `PyMySQL`). Frontend is plain HTML/CSS/JS, no
build step.

> This file is the up-to-date picture of the project. `phases.md` has
> the history of *how* it got here; `prd.md`/`architecture.md`/
> `rules.md`/`design.md` have the detailed specs. Read this one first.

## Files

```
AarogyaGrid/
├── backend/
│   ├── server.py        Plain-stdlib HTTP server: routes /api/*, serves ../frontend statically
│   ├── db.py             PyMySQL connection + password hashing (PBKDF2) + query helpers
│   ├── config.py         Env-var config: DB host/port/user/password/name, server port, frontend dir
│   ├── schema.sql         CREATE TABLE statements + migration notes for existing DBs
│   ├── requirements.txt  Just PyMySQL
│   └── README.md         Setup + run instructions
├── frontend/
│   ├── index.html        Role picker (Hospital/Patient/Doctor) + all three dashboards
│   ├── admin.html        Admin sign in/up + admin dashboard
│   ├── app.js             Hospital + Doctor + Patient dashboard logic
│   ├── admin.js           Admin dashboard logic
│   ├── shared.js          API client, session/theme/sidebar-collapse helpers, icons, formatting
│   └── style.css          One stylesheet used by both pages
└── docs/
    ├── prd.md, architecture.md, rules.md, phases.md, design.md, memory.md (this file)
```

**Why the frontend is split into `index.html` + `admin.html`:** Admin
is deliberately a separate page/portal, but still "connected" — data
added on `admin.html` (a hospital) must be usable on `index.html`
(that hospital signing in) and vice versa. That connection now happens
through the shared backend API (`shared.js`'s `API` object), not
shared `localStorage` like the original prototype — both pages hit the
same MySQL-backed server.

## Data model (MySQL tables, `backend/schema.sql`)

- `admins` — `id, password_hash, name, mobile, email, image, created_at`
- `hospitals` — `id, password_hash, name, phone, telephone, address, subscription_expiry, image, added_at`
- `patients` — `id, password_hash, name, age, phone, appointment_date, prescription, prescription_image, hospital_id (FK), image, added_at`
- `doctors` — `id, password_hash, name, specialization, phone, days, hospital_id (FK), image, added_at`
- `consultations` — `id, doctor_id (FK), patient_id (FK), hospital_id (FK), prescription, notes, visit_date, status ('pending'|'applied'), created_at, applied_at`

All foreign keys cascade on delete. Passwords are **never** stored
plaintext — see `db.hash_password`/`db.verify_password` (PBKDF2-HMAC-
SHA256, salted, 200k iterations).

**No data is ever auto-seeded or fabricated.** Hospitals are added
only by an admin; patients/doctors only by a hospital; consultations
only by a doctor. All stats (hospital counts, active/expired
subscriptions, doctor/patient counts) are computed live from whatever
has actually been entered, via live queries — nothing is cached or
guessed client-side.

## Credential chain & prescription flow

1. Admin signs up/in on `admin.html` → adds a hospital with a chosen
   Login ID + password + subscription expiry date → shares that
   ID/password with the hospital directly (the admin typed it in, so
   they already have it — there's no "recover password" feature since
   passwords are hashed server-side).
2. Hospital signs in on `index.html` with that ID/password → adds
   patients (ID/password, prescription, appointment date, optional
   prescription photo) and doctors (ID/password, specialization,
   available days) → shares each new login with the person it belongs to.
3. Doctor signs in on `index.html` with their hospital-issued
   ID/password → picks one of their hospital's patients → submits a
   **consultation** (prescription + notes + visit date). This does
   **not** touch the patient's record yet — it's `status: pending`.
4. Hospital sees it on the **Doctor Assignments** tab, grouped by
   doctor (so "which doctor has which patient" is answerable at a
   glance) → clicks **Apply to patient** → this copies the
   prescription onto the patient's actual record and flips the
   consultation to `status: applied`.
5. Patient signs in on `index.html` → sees their prescription (text +
   optional photo), personal details, an appointment banner (fires
   within 3 days of the appointment date), and a "Next Meeting Date" card.

## Subscription status logic

`subStatus(expiryDate)` in `shared.js`: `expired` if the date has
passed, `soon` if within 7 days, otherwise `active`. Used for badge
colors on the Admin hospital list and the warning banner a hospital
sees on their own overview page.

## UI conventions worth remembering

- Sidebar is collapsible on **every** dashboard (admin + hospital/
  doctor/patient) via a chevron button in the sidebar header —
  `initSidebarToggle()` in `shared.js`, state in `localStorage`
  (`ag_sidebar_collapsed`), CSS in `.sidebar.collapsed`.
- Session state (`ag_session` for hospital/doctor/patient,
  `ag_admin_session` for admin — kept separate on purpose) and UI
  prefs (`ag_theme`, `ag_sidebar_collapsed`) are the *only* things in
  `localStorage`. Everything else is fetched from the API on every render.
- All backend calls go through `API.<resource>.<action>()` in
  `shared.js` — `app.js`/`admin.js` never call `fetch` directly.
- Status badges use one consistent color vocabulary everywhere: green
  = good/active/applied, amber = attention/pending/expiring, red =
  bad/expired/destructive.

## Known trade-offs (see `rules.md` → Security notes for detail)

- No session tokens — the client just says "I am hospital X" after a
  successful sign-in, and the server trusts it. Fine for a self-hosted
  / internal tool, **not** hardened for public production use as-is.
- Deleting a hospital/doctor/patient is immediate and cascades — no
  soft-delete or undo.
- No pagination anywhere yet — fine at prototype scale, would need
  addressing if a hospital's patient list grows into the thousands.
