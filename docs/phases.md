# AarogyaGrid — Build Phases

A record of how this project was built, and a template for how future
work on it should be phased.

## Phase 0 — Prototype (pre-existing, localStorage only)
- Admin / Hospital / Patient dashboards, all data in browser
  `localStorage`. No backend, no real persistence across devices.
- Established the visual design system (`style.css`), the role/login
  flow, and the panel/list/badge UI patterns still used today.

## Phase 1 — Real backend (plain Python + MySQL)
**Goal:** replace `localStorage` with a real, shared backend, with no
web framework, using MySQL for storage.

- Designed the schema: `admins`, `hospitals`, `patients`, `doctors`
  (`backend/schema.sql`).
- Built `server.py` on `http.server` with a small regex-based router,
  JSON request/response handling, and static-file serving for the
  frontend from the same process.
- Built `db.py`: PyMySQL connection helper + PBKDF2 password hashing.
- Rewired the frontend: `shared.js` gained an `API` client; `app.js`
  and `admin.js` were converted from synchronous `localStorage` reads
  to `async`/`await` calls against the API.
- **Verification approach:** rather than requiring a live MySQL server
  to validate `server.py`'s routing/logic, a small test harness
  (`db` module replaced with an in-memory fake matching the same
  function signatures — `fetch_one`/`fetch_all`/`execute`) was used to
  exercise every route end-to-end (signup, signin, CRUD, deletes, 404s)
  before shipping. This is the pattern to reuse for any future backend
  change: swap in a fake `db` module, hit the real `Handler` over
  HTTP, assert on responses.

## Phase 2 — Doctor role, prescription flow, prescription photo, collapsible sidebar
**Goal:** doctors get their own login and can submit prescriptions
that flow through the hospital before reaching the patient; hospitals
can see which doctor is handling which patient; patients can have a
prescription photo attached; the sidebar can collapse.

- Schema: added `doctors.password_hash` (+ `image`), added
  `patients.prescription_image`, added a new `consultations` table
  (doctor → hospital → patient link, with a `pending`/`applied`
  status). Migration notes added to `schema.sql` for existing
  databases created before this phase.
- Backend: added doctor sign-in/get/update endpoints, changed doctor
  creation to take a hospital-issued ID+password (same pattern as
  patients), and added the `consultations` endpoints (`create`,
  `list?doctorId=`/`?hospitalId=`, `apply`, `delete`). The `apply`
  endpoint is the only thing that ever writes to
  `patients.prescription` outside of the hospital's own patient form —
  this is what enforces "doctor → hospital → patient", not
  "doctor → patient" directly.
- Frontend:
  - New "Doctor Dashboard" role card + login flow in `index.html`/`app.js`.
  - Hospital's "Doctors" form now collects a login ID + password (like
    the patient form always did).
  - New **Doctor Assignments** tab on the hospital dashboard: groups
    every consultation by doctor, shows patient names, and offers an
    "Apply to patient" action per pending item.
  - New **Add Consultation** / **My Consultations** tabs on the doctor
    dashboard.
  - Patient "Add Patient" form gained an optional prescription-photo
    file input; the patient dashboard renders it if present.
  - Collapsible sidebar (`initSidebarToggle()` in `shared.js`,
    `.sidebar.collapsed` CSS), wired into both `app.js` and `admin.js`
    init, state persisted in `localStorage`.
- **Verification:** extended the Phase 1 in-memory test harness to
  cover doctor signup/signin, consultation create → list (by doctor
  and by hospital) → apply → delete, and confirmed the `apply` step
  actually updates the patient's `prescription` field. All backend
  files pass `python3 -m py_compile`; all frontend JS passes
  `node --check`; every DOM id referenced by `app.js`/`admin.js` was
  cross-checked against the HTML (excluding ones injected dynamically,
  e.g. the profile-modal fields).

## Suggested Phase 3 (not yet built) — Production hardening
See `rules.md` → "Security notes" for the specific list (session
tokens, rate limiting, HTTPS, audit logging). Also worth considering:
- Pagination for hospitals/patients/doctors lists once they grow large.
- Structured logging instead of print statements.
- A `docker-compose.yml` bundling `server.py` + MySQL for one-command
  local setup.
- Automated tests committed to the repo (the in-memory harness used
  during development, formalized into a `tests/` directory + CI).
