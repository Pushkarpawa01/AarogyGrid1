"""
AarogyaGrid backend — configuration.

All values can be overridden with environment variables, so you never
have to hard-code credentials in source control:

    export DB_HOST=localhost
    export DB_PORT=3306
    export DB_USER=root
    export DB_PASSWORD=yourpassword
    export DB_NAME=aarogyagrid
    export SERVER_PORT=8000
"""

import os

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME", "aarogyagrid")

SERVER_HOST = os.environ.get("SERVER_HOST", "0.0.0.0")
# Render (and most PaaS platforms) assign a dynamic port via the PORT
# env var and expect the app to bind to it — so PORT takes priority
# over SERVER_PORT if both are set. Locally, neither is usually set,
# so it falls back to 8000.
SERVER_PORT = int(os.environ.get("PORT", os.environ.get("SERVER_PORT", "8000")))

# Folder that contains index.html, admin.html, app.js, admin.js,
# shared.js, style.css — the server serves these as static files too,
# so you can open http://localhost:8000/ and have everything (frontend
# + API) come from one process, with zero CORS issues.
FRONTEND_DIR = os.environ.get(
    "FRONTEND_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend"),
)
