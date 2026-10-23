/**
 * Booking rules, including the part that makes double-booking impossible.
 *
 * The key idea: never "check, then write". Claiming the slot is ONE conditional UPDATE:
 *     UPDATE slots SET status = 'booked'
 *      WHERE id = :id AND status = 'open' AND start_time > :now
 *
 * The database applies it atomically, so of any number of simultaneous requests
 * exactly one sees changes === 1. Everyone else sees 0 and is told why.
 */

const { ConflictError, NotFoundError } = require('../errors');

function bookSlot(db, slotId, data, now) {
  const nowISO = now.toISOString();

  const doBooking = db.transaction(() => {
    const claimed = db.prepare(
      `UPDATE slots SET status = 'booked'
       WHERE id = ? AND status = 'open' AND start_time > ?`,
    ).run(slotId, nowISO);

    if (claimed.changes !== 1) return { claimed: false };

    const result = db.prepare(
      `INSERT INTO bookings (slot_id, patient_name, patient_email, status, created_at)
       VALUES (?, ?, ?, 'confirmed', ?)`,
    ).run(slotId, data.patient_name, data.patient_email.toLowerCase(), nowISO);

    return { claimed: true, bookingId: Number(result.lastInsertRowid) };
  });

  let result;
  try {
    result = doBooking();
  } catch (err) {
    // Unreachable while the claim above is correct. The partial unique index is the
    // safety net: if a future code path ever bypasses the claim, the database still refuses.
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      throw new ConflictError('slot_already_booked', 'This slot has just been booked by someone else.');
    }
    throw err;
  }

  if (!result.claimed) {
    throw _whyNotBookable(db, slotId);
  }

  return getBooking(db, result.bookingId);
}

function _whyNotBookable(db, slotId) {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slotId);
  if (!slot) return new NotFoundError('slot_not_found', `Slot ${slotId} does not exist.`);
  if (slot.status === 'booked') return new ConflictError('slot_already_booked', 'This slot has already been booked.');
  if (slot.status === 'cancelled') return new ConflictError('slot_cancelled', 'This slot was cancelled by the clinic.');
  return new ConflictError('slot_in_past', 'This slot has already started and can no longer be booked.');
}

function getBooking(db, bookingId) {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) {
    throw new NotFoundError('booking_not_found', `Booking ${bookingId} does not exist.`);
  }
  return booking;
}

/** Cancel a booking and re-open its slot, atomically. */
function cancelBooking(db, bookingId, now) {
  const nowISO = now.toISOString();
  const booking = getBooking(db, bookingId);

  // Lock the slot first (same order as bookSlot and cancelSlot) to avoid deadlocks.
  const doCancellation = db.transaction(() => {
    const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(booking.slot_id);

    if (slot.start_time <= nowISO) {
      return { error: 'slot_in_past' };
    }

    const cancelled = db.prepare(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = ?
       WHERE id = ? AND status = 'confirmed'`,
    ).run(nowISO, bookingId);

    if (cancelled.changes !== 1) {
      return { error: 'booking_already_cancelled' };
    }

    // Re-open the slot (only if it was booked — a cancelled slot stays cancelled)
    db.prepare(
      `UPDATE slots SET status = 'open' WHERE id = ? AND status = 'booked'`,
    ).run(slot.id);

    return { success: true };
  });

  const result = doCancellation();

  if (result.error === 'slot_in_past') {
    throw new ConflictError('slot_in_past', 'A booking cannot be cancelled after its slot has started.');
  }
  if (result.error === 'booking_already_cancelled') {
    throw new ConflictError('booking_already_cancelled', 'This booking is already cancelled.');
  }

  return getBooking(db, bookingId);
}

function listBookings(db, { patientEmail, clinicId, status, limit, offset }) {
  let sql = 'SELECT bookings.* FROM bookings';
  const params = [];
  const conditions = [];

  if (clinicId != null) {
    sql += ' JOIN slots ON slots.id = bookings.slot_id';
    conditions.push('slots.clinic_id = ?');
    params.push(clinicId);
  }
  if (patientEmail != null) {
    conditions.push('bookings.patient_email = ?');
    params.push(patientEmail.toLowerCase());
  }
  if (status) {
    conditions.push('bookings.status = ?');
    params.push(status);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY bookings.id LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(sql).all(...params);
}

module.exports = { bookSlot, getBooking, cancelBooking, listBookings };
