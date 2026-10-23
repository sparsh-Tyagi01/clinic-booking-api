const { Router } = require('express');
const clinicService = require('../services/clinics');
const slotService = require('../services/slots');
const bookingService = require('../services/bookings');
const { ClinicCreate, SlotCreate, SLOT_STATUSES, BOOKING_STATUSES, validate, validateId, parseQueryInt } = require('../validators');
const { serializeClinic, serializeSlot, serializeBooking } = require('../serializers');

const router = Router();

router.post('/', validate(ClinicCreate), (req, res) => {
  const clinic = clinicService.createClinic(req.app.locals.db, req.validated, req.now);
  res.status(201).json(serializeClinic(clinic));
});

router.get('/', (req, res) => {
  const limit = parseQueryInt(req.query.limit, 50, 1, 100);
  const offset = parseQueryInt(req.query.offset, 0, 0);
  const clinics = clinicService.listClinics(req.app.locals.db, limit, offset);
  res.json(clinics.map(serializeClinic));
});

router.get('/:clinicId', validateId('clinicId'), (req, res) => {
  const clinic = clinicService.getClinic(req.app.locals.db, req.params.clinicId);
  res.json(serializeClinic(clinic));
});

router.post('/:clinicId/slots', validateId('clinicId'), validate(SlotCreate), (req, res) => {
  const slot = slotService.createSlot(req.app.locals.db, req.params.clinicId, req.validated, req.now);
  res.status(201).json(serializeSlot(slot));
});

router.get('/:clinicId/slots', validateId('clinicId'), (req, res) => {
  const { status, starts_after, starts_before } = req.query;

  if (status && !SLOT_STATUSES.includes(status)) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Request validation failed.',
        details: [{ field: 'status', message: "Input should be 'open', 'booked' or 'cancelled'" }] },
    });
  }

  const limit = parseQueryInt(req.query.limit, 50, 1, 100);
  const offset = parseQueryInt(req.query.offset, 0, 0);

  const slots = slotService.listSlots(req.app.locals.db, req.params.clinicId, {
    status, startsAfter: starts_after, startsBefore: starts_before, limit, offset,
  });
  res.json(slots.map(serializeSlot));
});

router.get('/:clinicId/bookings', validateId('clinicId'), (req, res) => {
  const { status } = req.query;

  if (status && !BOOKING_STATUSES.includes(status)) {
    return res.status(422).json({
      error: { code: 'validation_error', message: 'Request validation failed.',
        details: [{ field: 'status', message: "Input should be 'confirmed' or 'cancelled'" }] },
    });
  }

  const limit = parseQueryInt(req.query.limit, 50, 1, 100);
  const offset = parseQueryInt(req.query.offset, 0, 0);

  clinicService.getClinic(req.app.locals.db, req.params.clinicId); // 404 if not found
  const bookings = bookingService.listBookings(req.app.locals.db, {
    clinicId: req.params.clinicId, status, limit, offset,
  });
  res.json(bookings.map(serializeBooking));
});

module.exports = router;
