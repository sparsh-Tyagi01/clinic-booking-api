const request = require('supertest');
const { createTestEnv, cleanupTestEnv, createClinic, makeSlotHelper, bookHelper } = require('./setup');

describe('Bookings', () => {
  let env, clinic, makeSlot, book;

  beforeEach(async () => {
    env = createTestEnv();
    clinic = await createClinic(env.app);
    makeSlot = makeSlotHelper(env.app, clinic, env.clock);
    book = bookHelper(env.app);
  });

  afterEach(() => cleanupTestEnv(env));

  test('booking an open slot succeeds and marks it booked', async () => {
    const slot = await makeSlot();
    const res = await book(slot.id);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('confirmed');
    expect(res.body.slot_id).toBe(slot.id);

    const slotRes = await request(env.app).get(`/slots/${slot.id}`);
    expect(slotRes.body.status).toBe('booked');
  });

  test('a booked slot cannot be booked again', async () => {
    const slot = await makeSlot();
    const first = await book(slot.id, 'First', 'first@example.com');
    expect(first.status).toBe(201);

    const second = await book(slot.id, 'Second', 'second@example.com');
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('slot_already_booked');

    const bookings = await request(env.app).get(`/clinics/${clinic.id}/bookings`);
    expect(bookings.body.map((b) => b.patient_email)).toEqual(['first@example.com']);
  });

  test('a cancelled slot cannot be booked', async () => {
    const slot = await makeSlot();
    await request(env.app).post(`/slots/${slot.id}/cancel`);

    const res = await book(slot.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('slot_cancelled');
  });

  test('a slot that has started cannot be booked', async () => {
    const slot = await makeSlot();
    // Time passes; the slot has now started
    env.clock.now = new Date(env.clock.now.getTime() + (24 * 60 + 1) * 60 * 1000);

    const res = await book(slot.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('slot_in_past');
  });

  test('booking an unknown slot is 404', async () => {
    const res = await book(4242);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('slot_not_found');
  });

  test('booking validates name and email', async () => {
    const slot = await makeSlot();
    const res = await request(env.app)
      .post(`/slots/${slot.id}/bookings`)
      .send({ patient_name: '  ', patient_email: 'not-an-email' });

    expect(res.status).toBe(422);
    const fields = new Set(res.body.error.details.map((d) => d.field));
    expect(fields).toEqual(new Set(['patient_name', 'patient_email']));

    // Nothing was claimed
    const slotRes = await request(env.app).get(`/slots/${slot.id}`);
    expect(slotRes.body.status).toBe('open');
  });

  test('cancelling a booking frees the slot for someone else', async () => {
    const slot = await makeSlot();
    const booking = (await book(slot.id, 'First', 'first@example.com')).body;

    const cancelled = await request(env.app).post(`/bookings/${booking.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('cancelled');
    expect(cancelled.body.cancelled_at).not.toBeNull();

    const slotRes = await request(env.app).get(`/slots/${slot.id}`);
    expect(slotRes.body.status).toBe('open');

    const rebookRes = await book(slot.id, 'Second', 'second@example.com');
    expect(rebookRes.status).toBe(201);
  });

  test('a booking cannot be cancelled twice', async () => {
    const slot = await makeSlot();
    const booking = (await book(slot.id)).body;

    await request(env.app).post(`/bookings/${booking.id}/cancel`);
    const again = await request(env.app).post(`/bookings/${booking.id}/cancel`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('booking_already_cancelled');
  });

  test('a stale cancel does not reopen a slot rebooked by someone else', async () => {
    const slot = await makeSlot();
    const first = (await book(slot.id, 'First', 'first@example.com')).body;
    await request(env.app).post(`/bookings/${first.id}/cancel`);
    await book(slot.id, 'Second', 'second@example.com');
    await request(env.app).post(`/bookings/${first.id}/cancel`); // replayed request

    const slotRes = await request(env.app).get(`/slots/${slot.id}`);
    expect(slotRes.body.status).toBe('booked');
  });

  test('a booking cannot be cancelled after its slot started', async () => {
    const slot = await makeSlot();
    const booking = (await book(slot.id)).body;

    env.clock.now = new Date(env.clock.now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const res = await request(env.app).post(`/bookings/${booking.id}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('slot_in_past');
  });

  test('cancelling a slot also cancels its booking', async () => {
    const slot = await makeSlot();
    const booking = (await book(slot.id)).body;

    const cancelRes = await request(env.app).post(`/slots/${slot.id}/cancel`);
    expect(cancelRes.status).toBe(200);

    const bookingGet = await request(env.app).get(`/bookings/${booking.id}`);
    expect(bookingGet.body.status).toBe('cancelled');

    const slotGet = await request(env.app).get(`/slots/${slot.id}`);
    expect(slotGet.body.status).toBe('cancelled');
  });

  test('patient can list their own bookings case-insensitively', async () => {
    const slot1 = await makeSlot();
    const mine = (await book(slot1.id, 'Asha', 'Asha@Example.com')).body;

    const slot2 = await makeSlot(null, 45);
    await book(slot2.id, 'Other', 'other@example.com');

    const res = await request(env.app).get('/bookings?patient_email=asha@example.com');
    expect(res.body.map((b) => b.id)).toEqual([mine.id]);
  });

  test('unknown route uses the same error shape', async () => {
    const res = await request(env.app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
