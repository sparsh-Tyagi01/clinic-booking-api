/**
 * Request validation. Replaces Pydantic schemas with Zod schemas.
 * Field-level validation lives here.
 */

const { z } = require('zod');
const { MIN_SLOT_MINUTES, MAX_SLOT_MINUTES, MAX_ID } = require('./config');

// ── Shared types ────────────────────────────────────────────────────────────────

/** Timezone-aware ISO 8601 datetime string (rejects bare "2030-01-01T10:00:00"). */
const AwareDatetime = z.string().refine(
  (val) => {
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(val)) return false;
    return !isNaN(new Date(val).getTime());
  },
  { message: 'Input should have timezone info' },
);

const SLOT_STATUSES = ['open', 'booked', 'cancelled'];
const BOOKING_STATUSES = ['confirmed', 'cancelled'];

// ── Request body schemas ────────────────────────────────────────────────────────
// .strict() rejects unknown fields so typos like "start_tme" fail loudly.

const ClinicCreate = z.object({
  name: z.string().trim().min(1, 'String should have at least 1 character').max(200),
}).strict();

const SlotCreate = z.object({
  start_time: AwareDatetime,
  end_time: AwareDatetime,
}).strict().superRefine((data, ctx) => {
  const start = new Date(data.start_time);
  const end = new Date(data.end_time);
  if (end <= start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'end_time must be after start_time',
      path: ['end_time'],
    });
    return;
  }
  const minutes = (end - start) / 60000;
  if (minutes < MIN_SLOT_MINUTES || minutes > MAX_SLOT_MINUTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `slot duration must be between ${MIN_SLOT_MINUTES} and ${MAX_SLOT_MINUTES} minutes`,
      path: ['end_time'],
    });
  }
});

const BookingCreate = z.object({
  patient_name: z.string().trim().min(1, 'String should have at least 1 character').max(200),
  patient_email: z.string().email('value is not a valid email address'),
}).strict();

// ── Express middleware ──────────────────────────────────────────────────────────

/** Validate req.body against a Zod schema. Parsed data is placed on req.validated. */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      }));
      return res.status(422).json({
        error: { code: 'validation_error', message: 'Request validation failed.', details },
      });
    }
    req.validated = result.data;
    next();
  };
}

/** Validate that a path parameter is a valid integer id (1 … MAX_ID). */
function validateId(paramName) {
  return (req, res, next) => {
    const raw = req.params[paramName];
    const id = parseInt(raw, 10);
    if (isNaN(id) || id < 1 || id > MAX_ID || String(id) !== raw) {
      return res.status(422).json({
        error: {
          code: 'validation_error',
          message: 'Request validation failed.',
          details: [{ field: paramName, message: `must be an integer between 1 and ${MAX_ID}` }],
        },
      });
    }
    req.params[paramName] = id;
    next();
  };
}

/** Parse an optional integer query parameter with bounds. */
function parseQueryInt(val, defaultVal, min, max) {
  if (val == null || val === '') return defaultVal;
  const n = parseInt(val, 10);
  if (isNaN(n)) return defaultVal;
  if (n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

module.exports = {
  ClinicCreate, SlotCreate, BookingCreate,
  SLOT_STATUSES, BOOKING_STATUSES,
  validate, validateId, parseQueryInt,
};
