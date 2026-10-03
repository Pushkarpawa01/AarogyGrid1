-- ============================================================
-- AarogyaGrid — MySQL schema
-- Run this once against your MySQL server before starting server.py:
--   mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS aarogyagrid
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE aarogyagrid;

CREATE TABLE IF NOT EXISTS admins (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) DEFAULT '',
  mobile        VARCHAR(32)  DEFAULT '',
  email         VARCHAR(255) DEFAULT '',
  image         LONGTEXT     NULL,
  created_at    DATE         NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS hospitals (
  id                   VARCHAR(64)  NOT NULL PRIMARY KEY,
  password_hash        VARCHAR(255) NOT NULL,
  name                 VARCHAR(255) DEFAULT '',
  phone                VARCHAR(32)  DEFAULT '',
  telephone            VARCHAR(32)  DEFAULT '',
  address              VARCHAR(255) DEFAULT '',
  subscription_expiry  DATE         NULL,
  image                LONGTEXT     NULL,
  added_at             DATE         NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS patients (
  id                  VARCHAR(64)  NOT NULL PRIMARY KEY,
  password_hash       VARCHAR(255) NOT NULL,
  name                VARCHAR(255) DEFAULT '',
  age                 VARCHAR(16)  DEFAULT '',
  phone               VARCHAR(32)  DEFAULT '',
  appointment_date    DATE         NULL,
  prescription        TEXT         NULL,
  prescription_image  LONGTEXT     NULL,
  hospital_id         VARCHAR(64)  NOT NULL,
  image               LONGTEXT     NULL,
  added_at            DATE         NOT NULL,
  CONSTRAINT fk_patients_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  INDEX idx_patients_hospital (hospital_id)
) ENGINE=InnoDB;

-- Doctors now have their own login (issued by the hospital, same pattern
-- as patients), so they can sign in and submit consultations themselves.
CREATE TABLE IF NOT EXISTS doctors (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(255) DEFAULT '',
  specialization  VARCHAR(255) DEFAULT '',
  phone           VARCHAR(32)  DEFAULT '',
  days            VARCHAR(255) DEFAULT '',
  hospital_id     VARCHAR(64)  NOT NULL,
  image           LONGTEXT     NULL,
  added_at        DATE         NOT NULL,
  CONSTRAINT fk_doctors_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  INDEX idx_doctors_hospital (hospital_id)
) ENGINE=InnoDB;

-- A consultation is a doctor filling in a patient's prescription/notes.
-- It starts 'pending' (visible on the hospital dashboard, grouped by
-- doctor, so the hospital can see which doctor is handling which
-- patient) and becomes 'applied' once the hospital pushes the
-- prescription through to the patient's own dashboard.
CREATE TABLE IF NOT EXISTS consultations (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  doctor_id     VARCHAR(64)  NOT NULL,
  patient_id    VARCHAR(64)  NOT NULL,
  hospital_id   VARCHAR(64)  NOT NULL,
  prescription  TEXT         NULL,
  notes         TEXT         NULL,
  visit_date    DATE         NULL,
  status        VARCHAR(16)  NOT NULL DEFAULT 'pending',
  created_at    DATE         NOT NULL,
  applied_at    DATE         NULL,
  CONSTRAINT fk_consult_doctor FOREIGN KEY (doctor_id)
    REFERENCES doctors(id) ON DELETE CASCADE,
  CONSTRAINT fk_consult_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_consult_hospital FOREIGN KEY (hospital_id)
    REFERENCES hospitals(id) ON DELETE CASCADE,
  INDEX idx_consult_doctor (doctor_id),
  INDEX idx_consult_patient (patient_id),
  INDEX idx_consult_hospital (hospital_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------------
-- Migrating an EXISTING database that was created before this file
-- added the doctor login / prescription-photo / consultations
-- features? Run these statements by hand instead of the CREATE TABLE
-- ones above (they'll error harmlessly if already applied):
--
--   ALTER TABLE patients ADD COLUMN prescription_image LONGTEXT NULL AFTER prescription;
--   ALTER TABLE doctors  ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '' AFTER id;
--   ALTER TABLE doctors  ADD COLUMN image LONGTEXT NULL AFTER hospital_id;
--   -- then create the consultations table using the CREATE TABLE above.
-- ------------------------------------------------------------------
