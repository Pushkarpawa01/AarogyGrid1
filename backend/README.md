# AarogyaGrid backend

A plain-Python backend for the AarogyaGrid app — **no Django, no
Flask, no FastAPI**. Just the standard library's `http.server` for
HTTP, and MySQL (via the pure-Python `PyMySQL` driver) for storage.
It replaces the old `localStorage`-only prototype: the frontend
(`index.html`, `admin.html`, `app.js`, `admin.js`, `shared.js`,
`style.css`) is unchanged in look and behavior, just now talks to
this server instead of the browser's local storage.

## 1. Install MySQL and create the database

```bash
mysql -u root -p < schema.sql
```

This creates the `aarogyagrid` database and its four tables
(`admins`, `hospitals`, `patients`, `doctors`).

## 2. Install the one Python dependency

```bash
pip install -r requirements.txt --break-system-packages
# or, in a venv:
python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
```

`PyMySQL` is pure Python — no compiler, no system MySQL client
library required.

## 3. Configure the connection (optional — defaults shown)

```bash
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=root
export DB_PASSWORD=yourpassword
export DB_NAME=aarogyagrid
export SERVER_PORT=8000
```

## 4. Run it

```bash
python3 server.py
```

Then open **http://localhost:8000/** — the server answers both the
static frontend files and the `/api/*` JSON endpoints from the same
process, so there's nothing else to run and no CORS to configure.

## Upgrading an existing database (Doctor login, prescription photo, consultations)

If you already ran `schema.sql` before this feature set was added,
your database is missing a few columns/tables. Run this once against
your existing `aarogyagrid` database (safe — these statements only
add things, they don't touch existing data):

```sql
USE aarogyagrid;
ALTER TABLE patients ADD COLUMN prescription_image LONGTEXT NULL AFTER prescription;
ALTER TABLE doctors  ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '' AFTER id;
ALTER TABLE doctors  ADD COLUMN image LONGTEXT NULL AFTER hospital_id;
```

Then create the `consultations` table — copy the `CREATE TABLE
consultations (...)` block from `schema.sql` and run it.

If any doctors were created before this upgrade, they won't have a
password set (empty `password_hash`) — remove and re-add them from
the hospital dashboard so they get a proper login.

## How the pieces fit together

```
project/            <- unchanged frontend (served as static files)
  index.html, admin.html, app.js, admin.js, shared.js, style.css

backend/
  server.py         <- http.server-based router + all /api/* handlers
  db.py             <- MySQL access (PyMySQL) + password hashing
  config.py         <- env-var configuration
  schema.sql         <- run once to create the database/tables
  requirements.txt
```

`shared.js` now exposes an `API` object (`API.admin.signin(...)`,
`API.hospitals.create(...)`, etc.) that `app.js`/`admin.js` call with
`await` instead of reading/writing `localStorage`. The only thing
still kept in `localStorage` is the *session* — which ID this browser
tab is currently signed in as — everything else (admins, hospitals,
patients, doctors, passwords) lives in MySQL.

Passwords are never stored in plain text: the server hashes them with
PBKDF2-HMAC-SHA256 (200,000 iterations, random salt per record) before
they touch the database.

## API summary

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/signup` | create an admin account |
| POST | `/api/admin/signin` | admin login |
| GET/PUT | `/api/admin/<id>` | fetch / update an admin |
| GET | `/api/hospitals` | list all hospitals |
| POST | `/api/hospitals` | add a hospital (admin) |
| DELETE | `/api/hospitals/<id>` | remove a hospital |
| POST | `/api/hospital/signin` | hospital login |
| GET/PUT | `/api/hospital/<id>` | fetch / update a hospital |
| GET | `/api/patients?hospitalId=<id>` | list a hospital's patients |
| POST | `/api/patients` | add a patient (hospital) |
| DELETE | `/api/patients/<id>` | remove a patient |
| POST | `/api/patient/signin` | patient login |
| GET/PUT | `/api/patient/<id>` | fetch / update a patient |
| GET | `/api/doctors?hospitalId=<id>` | list a hospital's doctors |
| POST | `/api/doctors` | add a doctor (hospital-issued login) |
| DELETE | `/api/doctors/<id>` | remove a doctor |
| POST | `/api/doctor/signin` | doctor login |
| GET/PUT | `/api/doctor/<id>` | fetch / update a doctor |
| GET | `/api/consultations?doctorId=<id>` | a doctor's own submissions |
| GET | `/api/consultations?hospitalId=<id>` | everything for a hospital (assignment view) |
| POST | `/api/consultations` | doctor submits a prescription for a patient |
| POST | `/api/consultations/<id>/apply` | hospital pushes it onto the patient's record |
| DELETE | `/api/consultations/<id>` | remove a consultation |

See `../docs/prd.md` and `../docs/architecture.md` for the full
picture of how the doctor → hospital → patient prescription flow works.
