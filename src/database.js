/**
 * Database creation. SQLite via better-sqlite3.
 *
 * All dates are stored as UTC ISO 8601 strings (e.g. "2030-01-02T09:00:00.000Z").
 * String comparison of ISO dates in UTC preserves chronological order.
 */

const Database = require('better-sqlite3');

function createDatabase(dbPath) {
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');    // readers do not block the writer
  db.pragma('foreign_keys = ON');     // SQLite ignores foreign keys by default
  db.pragma('busy_timeout = 30000');  // wait for a competing writer instead of failing

  db.exec(`
    CREATE TABLE IF NOT EXISTS clinics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clinic_id INTEGER NOT NULL REFERENCES clinics(id),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      CHECK (end_time > start_time),
      CHECK (status IN ('open', 'booked', 'cancelled'))
    );

    CREATE INDEX IF NOT EXISTS ix_slots_clinic_start ON slots(clinic_id, start_time);

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER NOT NULL REFERENCES slots(id),
      patient_name TEXT NOT NULL,
      patient_email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TEXT NOT NULL,
      cancelled_at TEXT,
      CHECK (status IN ('confirmed', 'cancelled'))
    );

    CREATE INDEX IF NOT EXISTS ix_bookings_slot_id ON bookings(slot_id);
    CREATE INDEX IF NOT EXISTS ix_bookings_email ON bookings(patient_email);

    -- Second line of defence: at most ONE confirmed booking per slot, enforced by the database.
    CREATE UNIQUE INDEX IF NOT EXISTS uq_one_confirmed_booking_per_slot
      ON bookings(slot_id) WHERE status = 'confirmed';
  `);

  return db;
}

module.exports = { createDatabase };
