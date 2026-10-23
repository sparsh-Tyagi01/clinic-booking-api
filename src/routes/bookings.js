const { Router } = require('express');
const bookingService = require('../services/bookings');
const { BOOKING_STATUSES, validateId, parseQueryInt } = require('../validators');
const { serializeBooking } = require('../serializers');

const router = Router();

router.get('/', (req, res) => {
  const { patient_email, status } = req.query;

  if (!patient_email) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Request validation failed.',
        details: [{ field: 'patient_email', message: 'patient_email query parameter is required' }] },
    });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient_email)) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Request validation failed.',
        details: [{ field: 'patient_email', message: 'value is not a valid email address' }] },
    });
  }

  if (status && !BOOKING_STATUSES.includes(status)) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Request validation failed.',
        details: [{ field: 'status', message: "Input should be 'confirmed' or 'cancelled'" }] },
    });
  }

  const limit = parseQueryInt(req.query.limit, 50, 1, 100);
  const offset = parseQueryInt(req.query.offset, 0, 0);

  const bookings = bookingService.listBookings(req.app.locals.db, {
    patientEmail: patient_email, status, limit, offset,
  });
  res.json(bookings.map(serializeBooking));
});

router.get('/:bookingId', validateId('bookingId'), (req, res) => {
  const booking = bookingService.getBooking(req.app.locals.db, req.params.bookingId);
  res.json(serializeBooking(booking));
});

router.post('/:bookingId/cancel', validateId('bookingId'), (req, res) => {
  const booking = bookingService.cancelBooking(req.app.locals.db, req.params.bookingId, req.now);
  res.json(serializeBooking(booking));
});

module.exports = router;
