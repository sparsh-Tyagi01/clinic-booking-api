/** Slot rules. Cancelling a slot is a state change, never a delete. */

const { ConflictError, InvalidInputError, NotFoundError } = require('../errors');
const { getClinic } = require('./clinics');

function createSlot(db, clinicId, data, now) {
  getClinic(db, clinicId); // 404 if the clinic does not exist

  const startTime = new Date(data.start_time).toISOString();
  const endTime = new Date(data.end_time).toISOString();
  const nowISO = now.toISOString();

  if (startTime <= nowISO) {
    throw new InvalidInputError('start_time', 'start_time must be in the future');
  }

  const result = db.prepare(
    `INSERT INTO slots (clinic_id, start_time, end_time, status, created_at)
     VALUES (?, ?, ?, 'open', ?)`,
  ).run(clinicId, startTime, endTime, nowISO);

  return db.prepare('SELECT * FROM slots WHERE id = ?').get(Number(result.lastInsertRowid));
}

function getSlot(db, slotId) {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  if (!slot) {
    throw new NotFoundError('slot_not_found', `Slot ${slotId} does not exist.`);
  }
  return slot;
}

function listSlots(db, clinicId, { status, startsAfter, startsBefore, limit, offset }) {
  getClinic(db, clinicId); // 404 if the clinic does not exist

  let sql = 'SELECT * FROM slots WHERE clinic_id = ?';
  const params = [clinicId];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (startsAfter) {
    sql += ' AND start_time >= ?';
    params.push(new Date(startsAfter).toISOString());
  }
  if (startsBefore) {
    sql += ' AND start_time < ?';
    params.push(new Date(startsBefore).toISOString());
  }

  sql += ' ORDER BY start_time, id LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(sql).all(...params);
}

/**
 * Cancel a slot and, in the same transaction, any confirmed booking on it.
 *
 * The slot is claimed first (slot lock, then booking lock). Every flow that
 * touches both rows uses this order, which prevents deadlocks on PostgreSQL.
 */
function cancelSlot(db, slotId, now) {
  const nowISO = now.toISOString();

  const doCancellation = db.transaction(() => {
    const claimed = db.prepare(
      `UPDATE slots SET status = 'cancelled'
       WHERE id = ? AND status IN ('open', 'booked') AND start_time > ?`,
    ).run(slotId, nowISO);

    if (claimed.changes !== 1) return { claimed: false };

    db.prepare(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = ?
       WHERE slot_id = ? AND status = 'confirmed'`,
    ).run(nowISO, slotId);

    return { claimed: true };
  });

  const result = doCancellation();

  if (!result.claimed) {
    const slot = getSlot(db, slotId); // throws 404 if not found
    if (slot.status === 'cancelled') {
      throw new ConflictError('slot_already_cancelled', 'This slot is already cancelled.');
    }
    throw new ConflictError('slot_in_past', 'A slot that has already started cannot be cancelled.');
  }

  return getSlot(db, slotId);
}

module.exports = { createSlot, getSlot, listSlots, cancelSlot };
