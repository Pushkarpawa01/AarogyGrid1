"""
AarogyaGrid backend — MySQL access layer.

Uses PyMySQL (pure-Python, `pip install pymysql`), so there is no
compiled C extension to worry about. No ORM, no framework — just
parameterised SQL, which is all this app needs.
"""

import hashlib
import hmac
import os
import pymysql
import pymysql.cursors

import config


def get_connection():
    """Open a fresh connection with a dict cursor (rows come back as dicts)."""
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


# ------------------------------------------------------------------
# Password hashing (PBKDF2-HMAC-SHA256, stdlib only — no plaintext,
# unlike the original localStorage prototype).
# ------------------------------------------------------------------
_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
    except (ValueError, AttributeError):
        return False
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(digest_hex)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return hmac.compare_digest(actual, expected)


# ------------------------------------------------------------------
# Small query helpers used by server.py
# ------------------------------------------------------------------
def fetch_one(sql, params=None):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchone()
    finally:
        conn.close()


def fetch_all(sql, params=None):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()
    finally:
        conn.close()


def execute(sql, params=None):
    """INSERT / UPDATE / DELETE. Returns affected row count."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.rowcount
    finally:
        conn.close()
