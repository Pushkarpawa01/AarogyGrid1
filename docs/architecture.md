# AarogyaGrid — Architecture

## 1. High-level shape

```
┌─────────────────────────────┐        ┌────────────────────────────┐
│   Browser (index.html /     │  HTTP  │   server.py                │
│   admin.html + *.js)        │◄──────►│   (http.server, stdlib)    │
│                             │  JSON  │                             │
│   shared.js: API client     │        │   routes /api/* to handler │
│   app.js: hospital/doctor/  │        │   functions in server.py   │
│   patient dashboards        │        │                             │
│   admin.js: admin dashboard │        │   serves static files from │
└─────────────────────────────┘        │   /frontend for everything │
                                        │   else                     │
                                        └──────────────┬──────────────┘
                                                        │ PyMySQL
                                                        ▼
                                        ┌────────────────────────────┐
                                        │   MySQL — aarogyagrid DB   │
                                        │   admins, hospitals,       │
                                        │   patients, doctors,       │
                                        │   consultations            │
                                        └────────────────────────────┘
```

One Python process (`server.py`) does two jobs:
1. Serves the static frontend files (`frontend/*.html`, `*.js`, `*.css`)
   for any GET request that doesn't start with `/api/`.
2. Answers `/api/*` requests as JSON, backed by MySQL.

This means there's no CORS to configure and nothing else to run —
`python3 server.py` is the whole backend.

## 2. Backend layout

```
backend/
  server.py    — HTTP routing + all endpoint handlers + the request/response cycle
  db.py        — MySQL connection (PyMySQL) + password hashing + tiny query helpers
  config.py    — environment-variable configuration (DB creds, ports, frontend path)
  schema.sql   — CREATE TABLE statements (run once) + migration notes
  requirements.txt
```

### `server.py`
- `ROUTES`: a list of `(HTTP_METHOD, regex, handler_function)` tuples.
  Regex named groups (e.g. `(?P<patient_id>[^/]+)`) become keyword
  arguments passed into the handler.
- Each handler function (`h_*`) takes `body` (parsed JSON), `query`
  (parsed querystring), and any path parameters, and returns
  `(status_code, payload)`.
- `*_public()` functions shape a raw MySQL row into the JSON contract
  the frontend expects (camelCase keys, no password hash ever leaves
  the server).
- `ApiError` is raised by handlers for any expected failure (not
  found, wrong password, duplicate ID, etc) and turned into a JSON
  `{"error": "..."}` response with the right status code.
- `Handler(BaseHTTPRequestHandler)` does the actual HTTP protocol
  work: reads the request, matches it against `ROUTES`, calls the
  handler, and writes the JSON (or static file) response.

### `db.py`
- `get_connection()` opens a fresh PyMySQL connection per call (simple
  and safe for a small app; no connection pool).
- `hash_password` / `verify_password`: PBKDF2-HMAC-SHA256, 200,000
  iterations, random 16-byte salt per record, stored as `salt$hash`
  hex in the `password_hash` column.
- `fetch_one` / `fetch_all` / `execute`: thin wrappers around a cursor
  so handler functions never touch `pymysql` directly.

## 3. Data model

```
admins            hospitals              doctors                 patients
────────          ────────               ───────                 ────────
id (PK)           id (PK)                id (PK)                 id (PK)
password_hash     password_hash          password_hash           password_hash
name              name                   name                    name
mobile            phone / telephone      specialization          age
email             address                phone                   phone
image             subscription_expiry    days                    appointment_date
created_at        image                  hospital_id (FK) ───┐   prescription
                  added_at               image                │   prescription_image
                                          added_at             │   hospital_id (FK) ──┐
                                                                │                      │
                                                                └──────────────────────┼── both point at hospitals.id
                                                                                        │
                                          consultations                                │
                                          ─────────────                                │
                                          id (PK)                                      │
                                          doctor_id  (FK -> doctors.id)                │
                                          patient_id (FK -> patients.id) ──────────────┘
                                          hospital_id (FK -> hospitals.id)
                                          prescription, notes, visit_date
                                          status ('pending' | 'applied')
                                          created_at, applied_at
```

All foreign keys are `ON DELETE CASCADE` — removing a hospital removes
its doctors, patients, and consultations; removing a doctor or patient
removes their consultations.

## 4. Frontend layout

```
frontend/
  index.html   — role picker (Hospital / Patient / Doctor) + all three dashboards
  admin.html   — admin sign-in/up + admin dashboard
  shared.js    — API client (`API.admin.*`, `API.hospitals.*`, ...), theme,
                 toast, sidebar-collapse, small formatting helpers — loaded
                 by BOTH pages
  app.js       — hospital / doctor / patient dashboard logic (index.html only)
  admin.js     — admin dashboard logic (admin.html only)
  style.css    — shared design system for both pages
```

### The `API` client (`shared.js`)
Every backend call goes through `API.<resource>.<action>(...)`, e.g.
`API.consultations.listByHospital(hospitalId)`. Internally this is a
thin `fetch()` wrapper (`apiRequest`) that:
- Serializes the body as JSON when present.
- Throws a JS `Error` with the server's `error` message on any
  non-2xx response, so callers can just `try { await API... } catch(e){ toast(e.message) }`.

### Session handling
The *only* thing kept in `localStorage` is which ID/role this browser
tab is currently signed in as (`ag_session` for hospital/doctor/
patient, `ag_admin_session` for admin — kept separate on purpose, so
an admin and a hospital can be logged in in two different tabs without
clobbering each other). Everything else — every record, every
password — lives in MySQL and is fetched fresh on every render.

## 5. Request lifecycle example — "Doctor submits a consultation"

1. Doctor's browser: `app.js` → `API.consultations.create({doctorId, patientId, prescription, notes, visitDate})`
2. `shared.js` → `POST /api/consultations` with a JSON body.
3. `server.py` matches the route to `h_consultations_create`.
4. Handler validates the doctor and patient exist and belong to the
   same hospital, inserts a row with `status='pending'`, re-reads it
   joined with doctor/patient names, and returns it as JSON.
5. Browser gets the created consultation back, clears the form, and
   shows a toast.
6. Next time the Hospital opens **Doctor Assignments**, `app.js` calls
   `API.consultations.listByHospital(hospitalId)`, which hits
   `h_consultations_list`, which joins `consultations` with `doctors`
   and `patients` so the UI can group by doctor and show names without
   extra round-trips.
7. Hospital clicks **Apply to patient** → `API.consultations.apply(id)`
   → `POST /api/consultations/<id>/apply` → `h_consultations_apply`
   copies `consultations.prescription` into `patients.prescription`
   and flips the status.
8. Patient's next dashboard load reads the updated `prescription` field
   straight off their own record.
