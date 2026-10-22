-- This is an empty migration.

-- Valid slot time ranges
ALTER TABLE slots
ADD CONSTRAINT slots_valid_time_range
CHECK (ends_at > starts_at);

-- Valid slot states
ALTER TABLE slots
ADD CONSTRAINT slots_valid_status
CHECK (status IN ('AVAILABLE', 'CANCELLED'));

-- Prevent duplicate slot definitions for a clinic
ALTER TABLE slots
ADD CONSTRAINT slots_unique_definition
UNIQUE (clinic_id, starts_at, ends_at);

-- Valid booking states
ALTER TABLE bookings
ADD CONSTRAINT bookings_valid_status
CHECK (status IN ('CONFIRMED', 'CANCELLED'));

-- The central concurrency guarantee:
-- only one active booking may exist per slot.
CREATE UNIQUE INDEX one_active_booking_per_slot
ON bookings (slot_id)
WHERE status = 'CONFIRMED';
