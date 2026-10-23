const request = require('supertest');
const { createTestEnv, cleanupTestEnv, createClinic, makeSlotHelper, bookHelper } = require('./setup');

describe('Slots', () => {
  let env, clinic, makeSlot, book;

  beforeEach(async () => {
    env = createTestEnv();
    clinic = await createClinic(env.app);
    makeSlot = makeSlotHelper(env.app, clinic, env.clock);
    book = bookHelper(env.app);
  });

  afterEach(() => cleanupTestEnv(env));

  test('create slot returns open slot', async () => {
    const start = new Date(env.clock.now.getTime() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const res = await request(env.app)
      .post(`/clinics/${clinic.id}/slots`)
      .send({ start_time: start.toISOString(), end_time: end.toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open');
    expect(res.body.clinic_id).toBe(clinic.id);
    expect(res.body.start_time).toBe('2030-01-02T09:00:00Z');
  });

  test('create slot rejects end before start', async () => {
    const start = new Date(env.clock.now.getTime() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() - 30 * 60 * 1000);
    const res = await request(env.app)
      .post(`/clinics/${clinic.id}/slots`)
      .send({ start_time: start.toISOString(), end_time: end.toISOString() });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details[0].message).toContain('end_time must be after start_time');
  });

  test('create slot rejects time without timezone', async () => {
    const res = await request(env.app)
      .post(`/clinics/${clinic.id}/slots`)
      .send({ start_time: '2030-01-02T09:00:00', end_time: '2030-01-02T09:30:00' });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('start_time');
  });

  test('create slot rejects start in the past', async () => {
    const start = new Date(env.clock.now.getTime() - 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const res = await request(env.app)
      .post(`/clinics/${clinic.id}/slots`)
      .send({ start_time: start.toISOString(), end_time: end.toISOString() });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].field).toBe('start_time');
  });

  test.each([1, 9 * 60])('create slot rejects bad duration (%i minutes)', async (minutes) => {
    const start = new Date(env.clock.now.getTime() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + minutes * 60 * 1000);
    const res = await request(env.app)
      .post(`/clinics/${clinic.id}/slots`)
      .send({ start_time: start.toISOString(), end_time: end.toISOString() });

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].message).toContain('duration');
  });

  test('create slot for unknown clinic is 404', async () => {
    const start = new Date(env.clock.now.getTime() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const res = await request(env.app)
      .post('/clinics/999/slots')
      .send({ start_time: start.toISOString(), end_time: end.toISOString() });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('clinic_not_found');
  });

  test('unknown field is rejected', async () => {
    const start = new Date(env.clock.now.getTime() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const res = await request(env.app)
      .post(`/clinics/${clinic.id}/slots`)
      .send({ start_time: start.toISOString(), end_time: end.toISOString(), doctor: 'Dr Rao' });

    expect(res.status).toBe(422);
  });

  test('list slots can filter by status and is ordered by time', async () => {
    const laterStart = new Date(env.clock.now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const soonerStart = new Date(env.clock.now.getTime() + 1 * 24 * 60 * 60 * 1000);
    const later = await makeSlot(laterStart);
    const sooner = await makeSlot(soonerStart);
    await book(sooner.id);

    const everything = await request(env.app).get(`/clinics/${clinic.id}/slots`);
    expect(everything.body.map((s) => s.id)).toEqual([sooner.id, later.id]);

    const openOnly = await request(env.app).get(`/clinics/${clinic.id}/slots?status=open`);
    expect(openOnly.body.map((s) => s.id)).toEqual([later.id]);
  });

  test('list slots rejects unknown status', async () => {
    const res = await request(env.app).get(`/clinics/${clinic.id}/slots?status=pending`);
    expect(res.status).toBe(422);
  });

  test('cancel slot then cancel again conflicts', async () => {
    const slot = await makeSlot();
    const first = await request(env.app).post(`/slots/${slot.id}/cancel`);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('cancelled');

    const second = await request(env.app).post(`/slots/${slot.id}/cancel`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('slot_already_cancelled');
  });

  test('cancel unknown slot is 404', async () => {
    const res = await request(env.app).post('/slots/12345/cancel');
    expect(res.status).toBe(404);
  });
});
