# AarogyaGrid — Rules & Conventions

These are the constraints and conventions this project is built to.
Keep new work consistent with them.

## Hard constraints

1. **No web framework in the backend.** Plain Python 3 standard
   library only (`http.server`, `json`, `re`, `urllib.parse`, etc).
   No Django, Flask, FastAPI, Bottle, or similar. The one third-party
   dependency allowed is `PyMySQL` (pure Python, no compiled
   extension) for talking to MySQL.
2. **MySQL is the only datastore.** No SQLite fallback, no in-memory
   storage in production code (an in-memory fake is fine in tests —
   see `phases.md`).
3. **No build step for the frontend.** Plain HTML/CSS/JS, loaded
   directly by the browser. No React/Vue/webpack/npm. Any new page or
   component is written as vanilla JS added to `app.js`/`admin.js`/
   `shared.js` and vanilla CSS added to `style.css`.
4. **The chain of trust is never broken.** Nobody signs themselves up
   except the very first Admin account. Hospitals are created by an
   Admin. Doctors and Patients are created by a Hospital. There is no
   "doctor signup" or "patient signup" form anywhere in the UI —
   if you're tempted to add one, that's the wrong feature.
5. **Passwords are always hashed.** Never store or log a plaintext
   password anywhere outside the single request that creates/changes
   it. Use `db.hash_password` / `db.verify_password`.

## API conventions

- All API routes live under `/api/` and return JSON.
- Success responses return the resource (or a list of resources) in
  **camelCase**, even though MySQL columns are snake_case — the
  `*_public()` functions in `server.py` do this translation. Never let
  a raw DB row (with `password_hash` in it) reach the client.
- Error responses are always `{"error": "human-readable message"}`
  with an appropriate HTTP status (400 bad input, 401 bad credentials,
  404 not found, 409 conflict/duplicate, 500 unexpected).
- A resource is only ever deleted by its own ID (`DELETE /api/patients/<id>`,
  not by some other filter) — keeps cascade behavior predictable.
- List endpoints that belong to a hospital take `?hospitalId=` as a
  required query parameter — there is intentionally no "list every
  patient across every hospital" endpoint. A hospital's dashboard
  should never be able to see another hospital's patients.

## Frontend conventions

- `shared.js` is the only place that talks to `fetch()`. `app.js` and
  `admin.js` always go through `API.<resource>.<action>(...)`, never
  call `fetch` directly.
- The only thing kept in `localStorage` is *session identity*
  (`ag_session` / `ag_admin_session`) and small UI preferences
  (`ag_theme`, `ag_sidebar_collapsed`). Application data (patients,
  prescriptions, etc.) is never cached client-side beyond the current
  render — always re-fetch from the API rather than trusting stale
  local state.
- Every mutating action (`create`, `remove`, `update`, `apply`) is
  wrapped in `try { ... } catch(err) { toast(err.message, 'error') }`
  and re-renders the relevant section on success, so the UI never
  silently disagrees with the database.
- Reuse existing CSS classes (`.panel`, `.row-card`, `.badge`,
  `.form-grid`, `.list`, `.stat-card`) before inventing new ones —
  the design system in `style.css` is intentionally small.

## Security notes (current state, and what a hardening pass would add)

This project currently authenticates by **trusting the client** to
report which ID/role it's signed in as, once it has produced a valid
ID+password pair through a `/signin` call. There is no session token,
cookie, or `Authorization` header. This is acceptable for a learning
project / internal tool but **not** for a public production deployment
handling real patient data.

Before any real-world/public deployment, add:
- Signed session tokens (e.g. HMAC-signed cookies or JWTs) issued on
  sign-in and verified on every request, instead of trusting a client-
  supplied ID.
- Rate limiting on `/signin` endpoints to slow down credential
  stuffing / brute force.
- HTTPS (a reverse proxy like nginx/Caddy in front of `server.py`, or
  a TLS-terminating load balancer).
- Row-level authorization checks (e.g. a doctor should not be able to
  submit a consultation for a patient outside their own hospital —
  the backend already checks this for consultations; every new
  mutating endpoint added later must add the equivalent check).
- Audit logging for prescription changes.

## Definition of done for a new feature

A feature isn't done until:
1. The MySQL schema change is reflected in `schema.sql` (both the
   `CREATE TABLE` and, if it changes an existing table, a migration
   note at the bottom).
2. `server.py` has request validation (`ApiError` with a clear
   message) for every required field and every foreign-key
   relationship it touches.
3. `shared.js` has a matching `API.*` method — nothing in `app.js`/
   `admin.js` calls `fetch` directly.
4. The UI shows a `toast` on both success and failure of every
   mutating action.
5. It's been smoke-tested against the actual routing table (see
   `phases.md` for the in-memory test harness pattern used during
   development).
