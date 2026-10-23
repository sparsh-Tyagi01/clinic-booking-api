const { NotFoundError } = require('../errors');

function createClinic(db, data, now) {
  const nowISO = now.toISOString();
  const result = db.prepare(
    'INSERT INTO clinics (name, created_at) VALUES (?, ?)',
  ).run(data.name, nowISO);
  return db.prepare('SELECT * FROM clinics WHERE id = ?').get(Number(result.lastInsertRowid));
}

function getClinic(db, clinicId) {
  const clinic = db.prepare('SELECT * FROM clinics WHERE id = ?').get(clinicId);
  if (!clinic) {
    throw new NotFoundError('clinic_not_found', `Clinic ${clinicId} does not exist.`);
  }
  return clinic;
}

function listClinics(db, limit, offset) {
  return db.prepare('SELECT * FROM clinics ORDER BY id LIMIT ? OFFSET ?').all(limit, offset);
}

module.exports = { createClinic, getClinic, listClinics };
