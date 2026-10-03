"""
AarogyaGrid backend — plain Python, no Django/Flask/FastAPI.

Built entirely on the standard library's `http.server`, talking to
MySQL through PyMySQL. Run it with:

    python3 server.py

then open http://localhost:8000/ (it serves the existing
index.html / admin.html / *.js / style.css from ../frontend as static
files, and answers /api/* requests as JSON).

Routes
------
Admin
  POST   /api/admin/signup
  POST   /api/admin/signin
  GET    /api/admin/<id>
  PUT    /api/admin/<id>

Hospitals (added by an admin, signed into by a hospital)
  GET    /api/hospitals
  POST   /api/hospitals
  DELETE /api/hospitals/<id>
  POST   /api/hospital/signin
  GET    /api/hospital/<id>
  PUT    /api/hospital/<id>

Patients (added by a hospital, signed into by a patient)
  GET    /api/patients?hospitalId=<id>
  POST   /api/patients
  DELETE /api/patients/<id>
  POST   /api/patient/signin
  GET    /api/patient/<id>
  PUT    /api/patient/<id>

Doctors (added by a hospital, signed into by a doctor)
  GET    /api/doctors?hospitalId=<id>
  POST   /api/doctors
  DELETE /api/doctors/<id>
  POST   /api/doctor/signin
  GET    /api/doctor/<id>
  PUT    /api/doctor/<id>

Consultations (a doctor fills a patient's prescription; the hospital
reviews it and applies it to the patient's record — this is what
carries "doctor -> hospital -> patient" data flow, and also what lets
the hospital see which doctor is handling which patient)
  GET    /api/consultations?doctorId=<id>     (a doctor's own submissions)
  GET    /api/consultations?hospitalId=<id>   (everything for a hospital, for the assignment view)
  POST   /api/consultations
  POST   /api/consultations/<id>/apply
  DELETE /api/consultations/<id>
"""

import json
import mimetypes
import os
import re
import time
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import config
import db


# ------------------------------------------------------------------ #
# small helpers
# ------------------------------------------------------------------ #
def today_iso():
    return date.today().isoformat()


def none_if_blank(v):
    return v if v not in (None, "",) else None


def new_id(prefix):
    return f"{prefix}_{int(time.time() * 1000)}"


def admin_public(row):
    if not row:
        return None
    return {
        "id": row["id"], "name": row["name"], "mobile": row["mobile"],
        "email": row["email"], "image": row["image"],
        "createdAt": str(row["created_at"]) if row["created_at"] else None,
    }


def hospital_public(row):
    if not row:
        return None
    return {
        "id": row["id"], "name": row["name"], "phone": row["phone"],
        "telephone": row["telephone"], "address": row["address"],
        "subscriptionExpiry": str(row["subscription_expiry"]) if row["subscription_expiry"] else None,
        "image": row["image"],
        "addedAt": str(row["added_at"]) if row["added_at"] else None,
    }


def patient_public(row):
    if not row:
        return None
    return {
        "id": row["id"], "name": row["name"], "age": row["age"],
        "phone": row["phone"],
        "appointmentDate": str(row["appointment_date"]) if row["appointment_date"] else None,
        "prescription": row["prescription"],
        "prescriptionImage": row.get("prescription_image"),
        "hospitalId": row["hospital_id"],
        "image": row["image"],
        "addedAt": str(row["added_at"]) if row["added_at"] else None,
    }


def doctor_public(row):
    if not row:
        return None
    return {
        "id": row["id"], "name": row["name"], "specialization": row["specialization"],
        "phone": row["phone"], "days": row["days"], "hospitalId": row["hospital_id"],
        "image": row.get("image"),
        "addedAt": str(row["added_at"]) if row["added_at"] else None,
    }


def consultation_public(row):
    if not row:
        return None
    return {
        "id": row["id"], "doctorId": row["doctor_id"], "patientId": row["patient_id"],
        "hospitalId": row["hospital_id"], "prescription": row["prescription"],
        "notes": row["notes"],
        "visitDate": str(row["visit_date"]) if row.get("visit_date") else None,
        "status": row["status"],
        "createdAt": str(row["created_at"]) if row["created_at"] else None,
        "appliedAt": str(row["applied_at"]) if row.get("applied_at") else None,
        # convenience fields, present only on the joined list queries below
        "doctorName": row.get("doctor_name"),
        "patientName": row.get("patient_name"),
    }


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


# ------------------------------------------------------------------ #
# route handlers — each returns (status_code, dict_or_list)
# ------------------------------------------------------------------ #
def h_admin_signup(body, **_):
    id_ = (body.get("id") or "").strip()
    password = body.get("password") or ""
    if not id_ or not password:
        raise ApiError(400, "Admin ID and password are required.")
    if db.fetch_one("SELECT id FROM admins WHERE id=%s", (id_,)):
        raise ApiError(409, "That Admin ID is already taken — please choose another.")
    db.execute(
        "INSERT INTO admins (id, password_hash, name, mobile, email, image, created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (id_, db.hash_password(password), (body.get("name") or "").strip(),
         (body.get("mobile") or "").strip(), "", None, today_iso()),
    )
    return 201, {"ok": True}


def h_admin_signin(body, **_):
    id_ = (body.get("id") or "").strip()
    password = body.get("password") or ""
    row = db.fetch_one("SELECT * FROM admins WHERE id=%s", (id_,))
    if not row or not db.verify_password(password, row["password_hash"]):
        raise ApiError(401, "Incorrect ID or password. Please check the credentials and try again.")
    return 200, admin_public(row)


def h_admin_get(admin_id, **_):
    row = db.fetch_one("SELECT * FROM admins WHERE id=%s", (admin_id,))
    if not row:
        raise ApiError(404, "Admin not found.")
    return 200, admin_public(row)


def h_admin_update(admin_id, body, **_):
    row = db.fetch_one("SELECT * FROM admins WHERE id=%s", (admin_id,))
    if not row:
        raise ApiError(404, "Admin not found.")
    name = body.get("name", row["name"])
    mobile = body.get("mobile", row["mobile"])
    email = body.get("email", row["email"])
    image = body.get("image", row["image"])
    if body.get("password"):
        db.execute("UPDATE admins SET password_hash=%s WHERE id=%s",
                   (db.hash_password(body["password"]), admin_id))
    db.execute(
        "UPDATE admins SET name=%s, mobile=%s, email=%s, image=%s WHERE id=%s",
        (name, mobile, email, image, admin_id),
    )
    return 200, admin_public(db.fetch_one("SELECT * FROM admins WHERE id=%s", (admin_id,)))


def h_hospitals_list(**_):
    rows = db.fetch_all("SELECT * FROM hospitals ORDER BY added_at DESC, id DESC")
    return 200, [hospital_public(r) for r in rows]


def h_hospitals_create(body, **_):
    id_ = (body.get("id") or "").strip()
    password = body.get("password") or ""
    if not id_ or not password:
        raise ApiError(400, "Hospital ID and password are required.")
    if db.fetch_one("SELECT id FROM hospitals WHERE id=%s", (id_,)):
        raise ApiError(409, "That Hospital ID already exists — pick a different one.")
    phone = (body.get("phone") or "").strip()
    db.execute(
        "INSERT INTO hospitals (id, password_hash, name, phone, telephone, address, "
        "subscription_expiry, image, added_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (id_, db.hash_password(password), (body.get("name") or "").strip(), phone, phone,
         (body.get("address") or "").strip(), none_if_blank(body.get("subscriptionExpiry")),
         None, today_iso()),
    )
    return 201, hospital_public(db.fetch_one("SELECT * FROM hospitals WHERE id=%s", (id_,)))


def h_hospitals_delete(hospital_id, **_):
    affected = db.execute("DELETE FROM hospitals WHERE id=%s", (hospital_id,))
    if not affected:
        raise ApiError(404, "Hospital not found.")
    return 200, {"ok": True}


def h_hospital_signin(body, **_):
    id_ = (body.get("id") or "").strip()
    password = body.get("password") or ""
    row = db.fetch_one("SELECT * FROM hospitals WHERE id=%s", (id_,))
    if not row or not db.verify_password(password, row["password_hash"]):
        raise ApiError(401, "Incorrect ID or password. Please check the credentials and try again.")
    return 200, hospital_public(row)


def h_hospital_get(hospital_id, **_):
    row = db.fetch_one("SELECT * FROM hospitals WHERE id=%s", (hospital_id,))
    if not row:
        raise ApiError(404, "Hospital not found.")
    return 200, hospital_public(row)


def h_hospital_update(hospital_id, body, **_):
    row = db.fetch_one("SELECT * FROM hospitals WHERE id=%s", (hospital_id,))
    if not row:
        raise ApiError(404, "Hospital not found.")
    name = body.get("name", row["name"])
    telephone = body.get("telephone", row["telephone"])
    phone = body.get("phone", telephone)
    address = body.get("address", row["address"])
    image = body.get("image", row["image"])
    if body.get("password"):
        db.execute("UPDATE hospitals SET password_hash=%s WHERE id=%s",
                   (db.hash_password(body["password"]), hospital_id))
    db.execute(
        "UPDATE hospitals SET name=%s, phone=%s, telephone=%s, address=%s, image=%s WHERE id=%s",
        (name, phone, telephone, address, image, hospital_id),
    )
    return 200, hospital_public(db.fetch_one("SELECT * FROM hospitals WHERE id=%s", (hospital_id,)))


def h_patients_list(query, **_):
    hospital_id = (query.get("hospitalId") or [None])[0]
    if not hospital_id:
        raise ApiError(400, "hospitalId query parameter is required.")
    rows = db.fetch_all(
        "SELECT * FROM patients WHERE hospital_id=%s ORDER BY added_at DESC, id DESC",
        (hospital_id,),
    )
    return 200, [patient_public(r) for r in rows]


def h_patients_create(body, **_):
    id_ = (body.get("id") or "").strip()
    password = body.get("password") or ""
    hospital_id = (body.get("hospitalId") or "").strip()
    if not id_ or not password or not hospital_id:
        raise ApiError(400, "Patient ID, password and hospitalId are required.")
    if not db.fetch_one("SELECT id FROM hospitals WHERE id=%s", (hospital_id,)):
        raise ApiError(404, "Hospital not found.")
    if db.fetch_one("SELECT id FROM patients WHERE id=%s", (id_,)):
        raise ApiError(409, "That Patient ID already exists — pick a different one.")
    db.execute(
        "INSERT INTO patients (id, password_hash, name, age, phone, appointment_date, "
        "prescription, prescription_image, hospital_id, image, added_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (id_, db.hash_password(password), (body.get("name") or "").strip(),
         (body.get("age") or "").strip(), (body.get("phone") or "").strip(),
         none_if_blank(body.get("appointmentDate")), (body.get("prescription") or "").strip(),
         body.get("prescriptionImage"), hospital_id, None, today_iso()),
    )
    return 201, patient_public(db.fetch_one("SELECT * FROM patients WHERE id=%s", (id_,)))


def h_patients_delete(patient_id, **_):
    affected = db.execute("DELETE FROM patients WHERE id=%s", (patient_id,))
    if not affected:
        raise ApiError(404, "Patient not found.")
    return 200, {"ok": True}


def h_patient_signin(body, **_):
    id_ = (body.get("id") or "").strip()
    password = body.get("password") or ""
    row = db.fetch_one("SELECT * FROM patients WHERE id=%s", (id_,))
    if not row or not db.verify_password(password, row["password_hash"]):
        raise ApiError(401, "Incorrect ID or password. Please check the credentials and try again.")
    return 200, patient_public(row)


def h_patient_get(patient_id, **_):
    row = db.fetch_one("SELECT * FROM patients WHERE id=%s", (patient_id,))
    if not row:
        raise ApiError(404, "Patient not found.")
    return 200, patient_public(row)


def h_patient_update(patient_id, body, **_):
    row = db.fetch_one("SELECT * FROM patients WHERE id=%s", (patient_id,))
    if not row:
        raise ApiError(404, "Patient not found.")
    name = body.get("name", row["name"])
    phone = body.get("phone", body.get("telephone", row["phone"]))
    age = body.get("age", row["age"])
    prescription = body.get("prescription", row["prescription"])
    prescription_image = body.get("prescriptionImage", row.get("prescription_image"))
    appointment_date = body.get("appointmentDate", row["appointment_date"])
    image = body.get("image", row["image"])
    if body.get("password"):
        db.execute("UPDATE patients SET password_hash=%s WHERE id=%s",
                   (db.hash_password(body["password"]), patient_id))
    db.execute(
        "UPDATE patients SET name=%s, phone=%s, age=%s, prescription=%s, prescription_image=%s, "
        "appointment_date=%s, image=%s WHERE id=%s",
        (name, phone, age, prescription, prescription_image,
         none_if_blank(appointment_date), image, patient_id),
    )
    return 200, patient_public(db.fetch_one("SELECT * FROM patients WHERE id=%s", (patient_id,)))


def h_doctors_list(query, **_):
    hospital_id = (query.get("hospitalId") or [None])[0]
    if not hospital_id:
        raise ApiError(400, "hospitalId query parameter is required.")
    rows = db.fetch_all(
        "SELECT * FROM doctors WHERE hospital_id=%s ORDER BY added_at DESC, id DESC",
        (hospital_id,),
    )
    return 200, [doctor_public(r) for r in rows]


def h_doctors_create(body, **_):
    id_ = (body.get("id") or "").strip()
    password = body.get("password") or ""
    hospital_id = (body.get("hospitalId") or "").strip()
    if not id_ or not password or not hospital_id:
        raise ApiError(400, "Doctor ID, password and hospitalId are required.")
    if not db.fetch_one("SELECT id FROM hospitals WHERE id=%s", (hospital_id,)):
        raise ApiError(404, "Hospital not found.")
    if db.fetch_one("SELECT id FROM doctors WHERE id=%s", (id_,)):
        raise ApiError(409, "That Doctor ID already exists — pick a different one.")
    db.execute(
        "INSERT INTO doctors (id, password_hash, name, specialization, phone, days, "
        "hospital_id, image, added_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (id_, db.hash_password(password), (body.get("name") or "").strip(),
         (body.get("specialization") or "").strip(), (body.get("phone") or "").strip(),
         (body.get("days") or "").strip(), hospital_id, None, today_iso()),
    )
    return 201, doctor_public(db.fetch_one("SELECT * FROM doctors WHERE id=%s", (id_,)))


def h_doctors_delete(doctor_id, **_):
    affected = db.execute("DELETE FROM doctors WHERE id=%s", (doctor_id,))
    if not affected:
        raise ApiError(404, "Doctor not found.")
    return 200, {"ok": True}


def h_doctor_signin(body, **_):
    id_ = (body.get("id") or "").strip()
    password = body.get("password") or ""
    row = db.fetch_one("SELECT * FROM doctors WHERE id=%s", (id_,))
    if not row or not db.verify_password(password, row["password_hash"]):
        raise ApiError(401, "Incorrect ID or password. Please check the credentials and try again.")
    return 200, doctor_public(row)


def h_doctor_get(doctor_id, **_):
    row = db.fetch_one("SELECT * FROM doctors WHERE id=%s", (doctor_id,))
    if not row:
        raise ApiError(404, "Doctor not found.")
    return 200, doctor_public(row)


def h_doctor_update(doctor_id, body, **_):
    row = db.fetch_one("SELECT * FROM doctors WHERE id=%s", (doctor_id,))
    if not row:
        raise ApiError(404, "Doctor not found.")
    name = body.get("name", row["name"])
    specialization = body.get("specialization", row["specialization"])
    phone = body.get("phone", row["phone"])
    days = body.get("days", row["days"])
    image = body.get("image", row.get("image"))
    if body.get("password"):
        db.execute("UPDATE doctors SET password_hash=%s WHERE id=%s",
                   (db.hash_password(body["password"]), doctor_id))
    db.execute(
        "UPDATE doctors SET name=%s, specialization=%s, phone=%s, days=%s, image=%s WHERE id=%s",
        (name, specialization, phone, days, image, doctor_id),
    )
    return 200, doctor_public(db.fetch_one("SELECT * FROM doctors WHERE id=%s", (doctor_id,)))


# ------------------------------------------------------------------ #
# consultations — the doctor -> hospital -> patient prescription flow
# ------------------------------------------------------------------ #
_CONSULT_SELECT = """
    SELECT c.*, d.name AS doctor_name, p.name AS patient_name
    FROM consultations c
    JOIN doctors d ON d.id = c.doctor_id
    JOIN patients p ON p.id = c.patient_id
"""


def h_consultations_list(query, **_):
    doctor_id = (query.get("doctorId") or [None])[0]
    hospital_id = (query.get("hospitalId") or [None])[0]
    if doctor_id:
        rows = db.fetch_all(
            _CONSULT_SELECT + " WHERE c.doctor_id=%s ORDER BY c.created_at DESC, c.id DESC",
            (doctor_id,),
        )
    elif hospital_id:
        rows = db.fetch_all(
            _CONSULT_SELECT + " WHERE c.hospital_id=%s ORDER BY c.created_at DESC, c.id DESC",
            (hospital_id,),
        )
    else:
        raise ApiError(400, "doctorId or hospitalId query parameter is required.")
    return 200, [consultation_public(r) for r in rows]


def h_consultations_create(body, **_):
    doctor_id = (body.get("doctorId") or "").strip()
    patient_id = (body.get("patientId") or "").strip()
    if not doctor_id or not patient_id:
        raise ApiError(400, "doctorId and patientId are required.")

    doctor = db.fetch_one("SELECT * FROM doctors WHERE id=%s", (doctor_id,))
    if not doctor:
        raise ApiError(404, "Doctor not found.")
    patient = db.fetch_one("SELECT * FROM patients WHERE id=%s", (patient_id,))
    if not patient:
        raise ApiError(404, "Patient not found.")
    if patient["hospital_id"] != doctor["hospital_id"]:
        raise ApiError(400, "That patient does not belong to this doctor's hospital.")

    cid = new_id("cons")
    db.execute(
        "INSERT INTO consultations (id, doctor_id, patient_id, hospital_id, prescription, "
        "notes, visit_date, status, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (cid, doctor_id, patient_id, doctor["hospital_id"],
         (body.get("prescription") or "").strip(), (body.get("notes") or "").strip(),
         none_if_blank(body.get("visitDate")), "pending", today_iso()),
    )
    row = db.fetch_one(_CONSULT_SELECT + " WHERE c.id=%s", (cid,))
    return 201, consultation_public(row)


def h_consultations_apply(consultation_id, **_):
    row = db.fetch_one("SELECT * FROM consultations WHERE id=%s", (consultation_id,))
    if not row:
        raise ApiError(404, "Consultation not found.")
    patient = db.fetch_one("SELECT * FROM patients WHERE id=%s", (row["patient_id"],))
    if not patient:
        raise ApiError(404, "Patient not found.")

    db.execute(
        "UPDATE patients SET prescription=%s WHERE id=%s",
        (row["prescription"], row["patient_id"]),
    )
    db.execute(
        "UPDATE consultations SET status=%s, applied_at=%s WHERE id=%s",
        ("applied", today_iso(), consultation_id),
    )
    updated = db.fetch_one(_CONSULT_SELECT + " WHERE c.id=%s", (consultation_id,))
    return 200, consultation_public(updated)


def h_consultations_delete(consultation_id, **_):
    affected = db.execute("DELETE FROM consultations WHERE id=%s", (consultation_id,))
    if not affected:
        raise ApiError(404, "Consultation not found.")
    return 200, {"ok": True}


# ------------------------------------------------------------------ #
# routing table: (METHOD, regex) -> handler
# named groups in the regex are passed as kwargs to the handler
# ------------------------------------------------------------------ #
ROUTES = [
    ("POST",   r"^/api/admin/signup$",                    h_admin_signup),
    ("POST",   r"^/api/admin/signin$",                    h_admin_signin),
    ("GET",    r"^/api/admin/(?P<admin_id>[^/]+)$",       h_admin_get),
    ("PUT",    r"^/api/admin/(?P<admin_id>[^/]+)$",       h_admin_update),

    ("GET",    r"^/api/hospitals$",                        h_hospitals_list),
    ("POST",   r"^/api/hospitals$",                        h_hospitals_create),
    ("DELETE", r"^/api/hospitals/(?P<hospital_id>[^/]+)$", h_hospitals_delete),
    ("POST",   r"^/api/hospital/signin$",                  h_hospital_signin),
    ("GET",    r"^/api/hospital/(?P<hospital_id>[^/]+)$",  h_hospital_get),
    ("PUT",    r"^/api/hospital/(?P<hospital_id>[^/]+)$",  h_hospital_update),

    ("GET",    r"^/api/patients$",                         h_patients_list),
    ("POST",   r"^/api/patients$",                         h_patients_create),
    ("DELETE", r"^/api/patients/(?P<patient_id>[^/]+)$",   h_patients_delete),
    ("POST",   r"^/api/patient/signin$",                   h_patient_signin),
    ("GET",    r"^/api/patient/(?P<patient_id>[^/]+)$",    h_patient_get),
    ("PUT",    r"^/api/patient/(?P<patient_id>[^/]+)$",    h_patient_update),

    ("GET",    r"^/api/doctors$",                          h_doctors_list),
    ("POST",   r"^/api/doctors$",                          h_doctors_create),
    ("DELETE", r"^/api/doctors/(?P<doctor_id>[^/]+)$",     h_doctors_delete),
    ("POST",   r"^/api/doctor/signin$",                    h_doctor_signin),
    ("GET",    r"^/api/doctor/(?P<doctor_id>[^/]+)$",      h_doctor_get),
    ("PUT",    r"^/api/doctor/(?P<doctor_id>[^/]+)$",      h_doctor_update),

    ("GET",    r"^/api/consultations$",                          h_consultations_list),
    ("POST",   r"^/api/consultations$",                          h_consultations_create),
    ("POST",   r"^/api/consultations/(?P<consultation_id>[^/]+)/apply$", h_consultations_apply),
    ("DELETE", r"^/api/consultations/(?P<consultation_id>[^/]+)$",       h_consultations_delete),
]
COMPILED_ROUTES = [(m, re.compile(p), fn) for m, p, fn in ROUTES]


# ------------------------------------------------------------------ #
# HTTP handler
# ------------------------------------------------------------------ #
class Handler(BaseHTTPRequestHandler):
    server_version = "AarogyaGridHTTP/1.0"

    # -- utility -----------------------------------------------------
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self):
        # Harmless even when frontend is served from this same process;
        # keeps things working if someone serves the HTML elsewhere.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            raise ApiError(400, "Request body must be valid JSON.")
        if not isinstance(data, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        return data

    def log_message(self, fmt, *args):
        # Quieter, timestamped one-line logging instead of the default.
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    # -- dispatch ------------------------------------------------------
    def _dispatch(self, method):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            self._handle_api(method, path, parse_qs(parsed.query))
        elif method == "GET":
            self._handle_static(path)
        else:
            self._send_json(405, {"error": "Method not allowed."})

    def _handle_api(self, method, path, query):
        for route_method, pattern, fn in COMPILED_ROUTES:
            if route_method != method:
                continue
            match = pattern.match(path)
            if not match:
                continue
            try:
                body = self._read_json_body() if method in ("POST", "PUT") else {}
                status, payload = fn(body=body, query=query, **match.groupdict())
                self._send_json(status, payload)
            except ApiError as e:
                self._send_json(e.status, {"error": e.message})
            except Exception as e:  # pragma: no cover - safety net
                print("Unhandled error:", e)
                self._send_json(500, {"error": "Internal server error."})
            return
        self._send_json(404, {"error": "No such API route."})

    def _handle_static(self, path):
        if path == "/":
            path = "/index.html"
        # prevent path traversal outside FRONTEND_DIR
        safe_rel = os.path.normpath(path).lstrip("/\\")
        full_path = os.path.join(config.FRONTEND_DIR, safe_rel)
        if not os.path.abspath(full_path).startswith(os.path.abspath(config.FRONTEND_DIR)):
            self._send_json(403, {"error": "Forbidden."})
            return
        if not os.path.isfile(full_path):
            self._send_json(404, {"error": "Not found."})
            return
        ctype = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
        with open(full_path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(data)

    # -- HTTP verbs ------------------------------------------------
    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()


def main():
    addr = (config.SERVER_HOST, config.SERVER_PORT)
    httpd = ThreadingHTTPServer(addr, Handler)
    print(f"AarogyaGrid backend running on http://{config.SERVER_HOST}:{config.SERVER_PORT}")
    print(f"Serving frontend from: {config.FRONTEND_DIR}")
    print(f"MySQL database: {config.DB_NAME}@{config.DB_HOST}:{config.DB_PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        httpd.shutdown()


if __name__ == "__main__":
    main()
