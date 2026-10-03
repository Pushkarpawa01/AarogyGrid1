# AarogyaGrid — Product Requirements Document (PRD)

## 1. What this is

AarogyaGrid is a small multi-tenant healthcare record system with a
strict **chain-of-trust** login model:

```
Admin  →  issues logins to  →  Hospitals
Hospital → issues logins to →  Doctors and Patients
Doctor  → fills prescriptions for → Patients (reviewed by their Hospital)
```

Nobody signs themselves up except the very first Admin. Every other
account (hospital, doctor, patient) is created *for* them by the
level above, who hands them an ID and password.

## 2. Roles & what each one can do

### Admin
- Sign up (first-time only, self-serve) / sign in.
- Add a hospital (sets the hospital's login ID + password + subscription expiry).
- See every hospital, its subscription status (active / expiring soon / expired),
  and whether it's actively being used (has patients).
- Remove a hospital.
- Edit own profile (name, mobile, email, password, photo).

### Hospital
- Sign in with the ID/password the Admin gave them.
- Add / remove patients (sets the patient's login ID + password, name,
  age, phone, appointment date, an initial prescription, and an
  optional prescription photo).
- Add / remove doctors (sets the doctor's login ID + password,
  specialization, phone, available days).
- See a **Doctor Assignments** view: every consultation a doctor has
  submitted, grouped by doctor, showing which patients that doctor has
  handled — with a one-click **Apply to patient** action that pushes
  the doctor's prescription onto the patient's own record.
- Edit own profile (name, telephone, password, photo).

### Doctor
- Sign in with the ID/password the Hospital gave them.
- See the hospital's patient list and submit a **consultation**
  (prescription text, notes, visit date) for any of them.
- See their own submission history and whether each one has reached
  the patient yet (pending vs. applied).
- Edit own profile (name, specialization, phone, password, photo).

### Patient
- Sign in with the ID/password the Hospital gave them.
- See their own name, age, phone, hospital, appointment date,
  prescription text, and prescription photo (if any).
- Gets a banner if their appointment is within 3 days.
- Edit own password / photo.

## 3. Core data flow: how a prescription reaches a patient

1. A **Doctor** picks a patient (from their hospital's patient list)
   and submits a consultation — prescription + notes + visit date.
   This is stored with `status = pending`.
2. The **Hospital** sees it immediately on their **Doctor Assignments**
   tab, grouped under that doctor's name, alongside every other
   patient that doctor has seen.
3. The Hospital reviews it and clicks **Apply to patient**. This
   copies the prescription text onto the patient's own record and
   flips the consultation to `status = applied`.
4. The **Patient**, next time they open their dashboard, sees the
   updated prescription.

This keeps the Hospital as the checkpoint between a doctor's note and
what a patient actually sees — nothing reaches a patient without the
hospital applying it.

## 4. Non-functional requirements

- **No web framework.** Backend is plain Python 3 standard library
  (`http.server`) — no Django, Flask, or FastAPI.
- **MySQL** for storage, via the pure-Python `PyMySQL` driver (no
  compiled dependencies).
- Passwords are never stored in plain text (PBKDF2-HMAC-SHA256, salted).
- Frontend is plain HTML/CSS/JS — no build step, no framework.
- Works fully offline / self-hosted: one Python process serves both
  the static frontend and the JSON API.

## 5. Out of scope (for now)

- Real authentication tokens / sessions (the app currently trusts the
  client to say who it's signed in as, once it has produced a valid
  ID+password pair once). See `rules.md` for the security implications
  and what a production hardening pass would add.
- Multi-doctor consultations per visit, lab results, billing, or any
  other clinical workflow beyond "prescription text + notes".
- Real-time updates (the hospital/patient dashboards refresh on
  navigation and after actions, not via websockets/polling).
