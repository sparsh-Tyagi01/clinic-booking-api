/**
 * Test helpers — mirrors Python's conftest.py fixtures.
 *
 * Each test gets its own temporary database and fake clock,
 * so tests need no running server and no setup.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');
const { createApp } = require('../src/app');

const START_OF_TIME = new Date('2030-01-01T09:00:00Z');

class FakeClock {
  /** Tests decide what "now" is, so time-based rules need no sleeping. */
  constructor() {
    this.now = new Date(START_OF_TIME);
  }
  tick() {
    return new Date(this.now);
  }
}

function createTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const clock = new FakeClock();
  // A real file (not :memory:) so the partial unique index works correctly.
  const app = createApp({ databasePath: dbPath, clock: () => clock.tick() });
  return { app, clock, tmpDir, dbPath };
}

function cleanupTestEnv(env) {
  if (env.app && env.app.locals.db) {
    try { env.app.locals.db.close(); } catch (_) { /* ignore */ }
  }
  try { fs.rmSync(env.tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}

async function createClinic(app, name = 'Green Valley Clinic') {
  const res = await request(app).post('/clinics').send({ name });
  return res.body;
}

function makeSlotHelper(app, clinic, clock) {
  return async function makeSlot(start, minutes = 30) {
    start = start || new Date(clock.now.getTime() + 24 * 60 * 60 * 1000); // +1 day
    const end = new Date(start.getTime() + minutes * 60 * 1000);
    const res = await request(app)
      .post(`/clinics/${clinic.id}/slots`)
      .send({ start_time: start.toISOString(), end_time: end.toISOString() });
    expect(res.status).toBe(201);
    return res.body;
  };
}

function bookHelper(app) {
  return function book(slotId, name = 'Asha Rao', email = 'asha@example.com') {
    return request(app)
      .post(`/slots/${slotId}/bookings`)
      .send({ patient_name: name, patient_email: email });
  };
}

module.exports = {
  START_OF_TIME, FakeClock,
  createTestEnv, cleanupTestEnv,
  createClinic, makeSlotHelper, bookHelper,
};
