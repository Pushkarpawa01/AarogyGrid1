# Deploying AarogyaGrid to Render

Render doesn't offer **managed** MySQL the way it does PostgreSQL —
so you have two options for the database. Pick one, then deploy the
Python backend as a Web Service either way.

- **Option A — MySQL on Render itself** (everything in one place, but
  you manage backups yourself; uses a Render Disk for persistence)
- **Option B — External managed MySQL** (e.g. Aiven, Railway, Clever
  Cloud — someone else manages backups/upgrades for you; a few more
  minutes of setup, one less moving part on Render)

Either way, the steps for the Python backend itself (Part 2 below) are
identical.

---

## Part 0 — Push the project to GitHub

Render deploys from a Git repo. If you haven't already:

```bash
cd AarogyaGrid
git init
git add .
git commit -m "Initial commit"
```

Create a new repo on GitHub, then:
```bash
git remote add origin https://github.com/<you>/AarogyaGrid.git
git branch -M main
git push -u origin main
```

---

## Part 1 — Get a MySQL database

### Option A: MySQL on Render

1. In the Render dashboard, click **New +** → **Private Service**.
2. Search the Render template gallery for **"MySQL"** and deploy it
   (it runs the official MySQL Docker image with a persistent disk).
3. Once deployed, open its **Info** tab and note:
   - **Internal hostname** (looks like `mysql-xxxx` or similar — this
     is what other Render services use to reach it on Render's
     private network)
   - **Port** (`3306`)
   - The root password / credentials (shown on the service page, or
     set via its environment variables — check the template's own
     instructions, since exact field names can change)
4. This database is reachable only from other services inside the
   same Render account/private network — not from your laptop
   directly. To run `schema.sql` against it, use Render's **Shell**
   tab on that service (or on the backend web service once it's
   deployed — see Part 3) rather than connecting from your own machine.

> Note this is an **unmanaged** database on Render's infrastructure —
> you're responsible for backups. If that's not what you want, use
> Option B instead.

### Option B: External managed MySQL (simpler to reason about)

Any of these give you a free or cheap MySQL instance with a public
hostname you can connect to from anywhere, including Render and your
own laptop:

- **Aiven** (free MySQL plan available)
- **Railway** (MySQL plugin, usage-based pricing)
- **Clever Cloud** (free MySQL dev plan)

Whichever you pick, after creating the database you'll have:
- A **host** (public hostname)
- A **port** (often not the default 3306 — double-check)
- A **user**, **password**, and **database name**

From your own machine, run the schema against it directly:
```bash
mysql -h <host> -P <port> -u <user> -p < backend/schema.sql
```
(adjust the database name inside `schema.sql`'s `CREATE DATABASE` line
first if your provider already assigned you a fixed database name —
some free tiers don't let you create new databases, only use the one
they gave you)

---

## Part 2 — Deploy the backend as a Render Web Service

1. In the Render dashboard, click **New +** → **Web Service**.
2. Connect your GitHub repo and select it.
3. Fill in:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python server.py`
4. Add these **Environment Variables** (Render's dashboard has an
   "Environment" tab for this):

   | Key | Value |
   |---|---|
   | `DB_HOST` | your MySQL host (internal hostname for Option A, public host for Option B) |
   | `DB_PORT` | `3306` (or whatever your provider gave you) |
   | `DB_USER` | your MySQL user |
   | `DB_PASSWORD` | your MySQL password |
   | `DB_NAME` | `aarogyagrid` |

   You do **not** need to set `PORT` yourself — Render sets it
   automatically, and `server.py` now reads it (see the `config.py`
   change below) and binds to it.
5. Click **Create Web Service**. Render will build and deploy — watch
   the **Logs** tab; you should eventually see:
   ```
   AarogyaGrid backend running on http://0.0.0.0:<port>
   Serving frontend from: /opt/render/project/src/frontend
   MySQL database: aarogyagrid@<your-db-host>:3306
   ```
6. Render gives you a public URL like
   `https://aarogyagrid.onrender.com` — open it. You should see the
   same role-select screen you see locally, now live on the internet.

---

## Part 3 — Run `schema.sql` against the deployed database

**If you used Option B (external MySQL):** you already did this in
Part 1 from your own machine — nothing more to do here.

**If you used Option A (MySQL on Render):** you need to run it from
*inside* Render's network, since the database isn't publicly
reachable. Two ways:

- **Via the backend Web Service's Shell tab** (Render dashboard →
  your web service → **Shell**): this gives you a terminal inside the
  running container, which already has the `mysql` client-less
  environment (Python + PyMySQL only) — so instead, run the schema
  through a quick Python one-liner using PyMySQL:
  ```bash
  python3 -c "
  import pymysql
  conn = pymysql.connect(host='<DB_HOST>', port=3306, user='<DB_USER>', password='<DB_PASSWORD>')
  with open('schema.sql') as f:
      sql = f.read()
  with conn.cursor() as cur:
      for stmt in sql.split(';'):
          s = stmt.strip()
          if s:
              cur.execute(s)
  conn.commit()
  print('Schema applied.')
  "
  ```
  (run this from the `backend` directory, where `schema.sql` lives)
- **Or**, deploy Render's official **Adminer** template (a one-click
  web-based DB admin tool) temporarily, point it at your MySQL
  private service's internal hostname, and paste/run `schema.sql`'s
  contents through its SQL query box.

---

## What changed in the code for this to work on Render

`backend/config.py` now reads the `PORT` environment variable first
(falling back to `SERVER_PORT`, then `8000`), because Render — like
most PaaS platforms — assigns a dynamic port to each Web Service via
`PORT` and expects the app to bind to exactly that port:

```python
SERVER_PORT = int(os.environ.get("PORT", os.environ.get("SERVER_PORT", "8000")))
```

Nothing else needed to change — `server.py` already binds to
`0.0.0.0` by default (`SERVER_HOST`), and `FRONTEND_DIR` is computed
relative to the backend file's own location, so it correctly finds
`../frontend` regardless of where Render checks out the repo.

---

## Quick troubleshooting

- **"Internal server error" on the live site, same as locally** → almost
  always a MySQL connection problem. Check the **Logs** tab on the
  Render web service for the exact `Unhandled error: ...` line — it
  will say exactly what's wrong (wrong password, wrong host, schema
  not applied yet, etc), the same way it did in your local terminal.
- **Site loads but login says "incorrect ID or password" for an admin
  you just created** → you probably ran `schema.sql` against a
  *different* database than the one `DB_NAME` points to in your
  environment variables. Double check they match.
- **Build fails on Render** → check the **Logs** during build; the
  most common cause is `requirements.txt` not being found, which
  means **Root Directory** wasn't set to `backend`.
