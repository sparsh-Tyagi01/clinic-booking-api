const { Router } = require('express');
const slotService = require('../services/slots');
const bookingService = require('../services/bookings');
const { BookingCreate, validate, validateId } = require('../validators');
const { serializeSlot, serializeBooking } = require('../serializers');

const router = Router();

router.get('/:slotId', validateId('slotId'), (req, res) => {
  const slot = slotService.getSlot(req.app.locals.db, req.params.slotId);
  res.json(serializeSlot(slot));
});

router.post('/:slotId/cancel', validateId('slotId'), (req, res) => {
  const slot = slotService.cancelSlot(req.app.locals.db, req.params.slotId, req.now);
  res.json(serializeSlot(slot));
});

router.post('/:slotId/bookings', validateId('slotId'), validate(BookingCreate), (req, res) => {
  const booking = bookingService.bookSlot(req.app.locals.db, req.params.slotId, req.validated, req.now);
  res.status(201).json(serializeBooking(booking));
});

module.exports = router;
