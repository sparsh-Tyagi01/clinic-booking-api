/**
 * Format database rows for API responses.
 *
 * Dates are stored with milliseconds ("…T09:00:00.000Z") for correct string
 * comparison in SQL. On output we strip the ".000" to match the API contract
 * ("…T09:00:00Z").
 */

function toAPIDate(isoStr) {
  if (!isoStr) return null;
  return isoStr.replace(/\.\d{3}Z$/, 'Z');
}

function serializeClinic(row) {
  return {
    id: row.id,
    name: row.name,
    created_at: toAPIDate(row.created_at),
  };
}

function serializeSlot(row) {
  return {
    id: row.id,
    clinic_id: row.clinic_id,
    start_time: toAPIDate(row.start_time),
    end_time: toAPIDate(row.end_time),
    status: row.status,
    created_at: toAPIDate(row.created_at),
  };
}

function serializeBooking(row) {
  return {
    id: row.id,
    slot_id: row.slot_id,
    patient_name: row.patient_name,
    patient_email: row.patient_email,
    status: row.status,
    created_at: toAPIDate(row.created_at),
    cancelled_at: toAPIDate(row.cancelled_at),
  };
}

module.exports = { toAPIDate, serializeClinic, serializeSlot, serializeBooking };
