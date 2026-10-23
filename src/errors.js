/**
 * Domain errors and the single JSON error format the API returns.
 *
 * Services throw these; they know nothing about HTTP beyond a status code.
 * Every failure is rendered as:
 *     {"error": {"code": "...", "message": "...", "details": [...]}}
 */

class DomainError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details || null;
  }
}

class NotFoundError extends DomainError {
  constructor(code, message) {
    super(404, code, message);
  }
}

class ConflictError extends DomainError {
  /** The request is valid but clashes with the current state (e.g. slot already booked). */
  constructor(code, message) {
    super(409, code, message);
  }
}

class InvalidInputError extends DomainError {
  /** Input that passes schema validation but breaks a rule that needs the clock or the database. */
  constructor(field, message) {
    super(422, 'validation_error', 'Request validation failed.', [{ field, message }]);
  }
}

function errorBody(code, message, details) {
  const error = { code, message };
  if (details) error.details = details;
  return { error };
}

/** Express error-handling middleware (must have 4 parameters). */
function errorHandler(err, _req, res, _next) {
  if (res.headersSent) return;

  if (err instanceof DomainError) {
    return res.status(err.statusCode).json(errorBody(err.code, err.message, err.details));
  }

  // JSON parse errors from express.json()
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody('http_error', 'Invalid JSON.'));
  }

  console.error(err);
  res.status(500).json(errorBody('internal_error', 'Internal server error.'));
}

module.exports = { DomainError, NotFoundError, ConflictError, InvalidInputError, errorBody, errorHandler };
