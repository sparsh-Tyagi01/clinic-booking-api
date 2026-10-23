/**
 * The most important tests: the booking rules must hold when requests overlap.
 *
 * Node.js with better-sqlite3 is single-threaded and synchronous, so the event
 * loop serialises all database work. The atomic UPDATE pattern is still the
 * guarantee — these tests validate the API contract (one 201, rest 409) and the
 * database-level defence-in-depth (partial unique index).
 */

const request = require('supertest');
const { createTestEnv, cleanupTestEnv, createClinic, makeSlotHelper, bookHelper } = require('./setup');

const WORKERS = 20;

describe('Concurrency', () => {
  let env, clinic, makeSlot, book;

  beforeEach(async () => {
    env = createTestEnv();
    clinic = await createClinic(env.app);
    makeSlot = makeSlotHelper(env.app, clinic, env.clock);
    book = bookHelper(env.app);
  });

  afterEach(() => cleanupTestEnv(env));

  test('simultaneous HTTP requests return one 201 and the rest 409', async () => {
    const slot = await makeSlot();

    const promises = Array.from({ length: WORKERS }, (_, n) =>
      request(env.app)
        .post(`/slots/${slot.id}/bookings`)
        .send({ patient_name: `P${n}`, patient_email: `p${n}@example.com` })
        .then((res) => res.status),
    );

    const statuses = (await Promise.all(promises)).sort();
    expect(statuses).toEqual([201, ...Array(WORKERS - 1).fill(409)]);

    // Verify exactly one confirmed booking in the database
    const db = env.app.locals.db;
    const confirmed = db.prepare(
      `SELECT COUNT(*) AS count FROM bookings WHERE slot_id = ? AND status = 'confirmed'`,
    ).get(slot.id);
    expect(confirmed.count).toBe(1);
  });

  test('booking then cancellation leaves slot and bookings consistent', async () => {
    const slot = await makeSlot();

    // Book, then cancel — both via HTTP so the full stack is exercised
    const bookRes = await book(slot.id);
    expect(bookRes.status).toBe(201);

    await request(env.app).post(`/slots/${slot.id}/cancel`);

    // Invariant: a cancelled slot must never keep a confirmed booking
    const db = env.app.locals.db;
    const slotRow = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot.id);
    const confirmed = db.prepare(
      `SELECT COUNT(*) AS count FROM bookings WHERE slot_id = ? AND status = 'confirmed'`,
    ).get(slot.id);

    expect(slotRow.status).toBe('cancelled');
    expect(confirmed.count).toBe(0);
  });

  test('cancel-and-rebook keep slot and booking in step', async () => {
    const slot = await makeSlot();
    const first = (await book(slot.id, 'First', 'first@example.com')).body;

    // Cancel the first booking, then rebook
    await request(env.app).post(`/bookings/${first.id}/cancel`);
    const second = await book(slot.id, 'Second', 'second@example.com');
    expect(second.status).toBe(201);

    const db = env.app.locals.db;
    const slotRow = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot.id);
    const confirmed = db.prepare(
      `SELECT COUNT(*) AS count FROM bookings WHERE slot_id = ? AND status = 'confirmed'`,
    ).get(slot.id);

    // Exactly one confirmed booking, and the slot is booked
    expect(slotRow.status).toBe('booked');
    expect(confirmed.count).toBe(1);
  });

  test('database itself refuses a second confirmed booking', async () => {
    /** Defence in depth: even code that skips the service layer cannot double-book. */
    const slot = await makeSlot();
    const db = env.app.locals.db;
    const nowISO = env.clock.now.toISOString();

    db.prepare(
      `INSERT INTO bookings (slot_id, patient_name, patient_email, status, created_at)
       VALUES (?, ?, ?, 'confirmed', ?)`,
    ).run(slot.id, 'X', 'x0@example.com', nowISO);

    expect(() => {
      db.prepare(
        `INSERT INTO bookings (slot_id, patient_name, patient_email, status, created_at)
         VALUES (?, ?, ?, 'confirmed', ?)`,
      ).run(slot.id, 'X', 'x1@example.com', nowISO);
    }).toThrow(); // SQLITE_CONSTRAINT_UNIQUE via the partial index
  });

  test('database allows a new booking once the old one is cancelled', async () => {
    const slot = await makeSlot();
    const db = env.app.locals.db;
    const nowISO = env.clock.now.toISOString();

    db.prepare(
      `INSERT INTO bookings (slot_id, patient_name, patient_email, status, created_at)
       VALUES (?, ?, ?, 'cancelled', ?)`,
    ).run(slot.id, 'X', 'x@example.com', nowISO);

    // Should NOT throw — only the confirmed row counts toward the unique index
    db.prepare(
      `INSERT INTO bookings (slot_id, patient_name, patient_email, status, created_at)
       VALUES (?, ?, ?, 'confirmed', ?)`,
    ).run(slot.id, 'Y', 'y@example.com', nowISO);
  });
});
