/** Application factory. Run with:  node src/server.js */

const express = require('express');
const { createDatabase } = require('./database');
const { errorBody, errorHandler } = require('./errors');
const config = require('./config');

const clinicRoutes = require('./routes/clinics');
const slotRoutes = require('./routes/slots');
const bookingRoutes = require('./routes/bookings');

function createApp({ databasePath, clock } = {}) {
  const db = createDatabase(databasePath || config.DATABASE_PATH);
  const clockFn = clock || (() => new Date());

  const app = express();
  app.locals.db = db;
  app.locals.clock = clockFn;

  app.use(express.json());

  // Inject current time into every request (testable via a fake clock).
  app.use((_req, _res, next) => {
    _req.now = app.locals.clock();
    next();
  });

  // Routes
  app.use('/clinics', clinicRoutes);
  app.use('/slots', slotRoutes);
  app.use('/bookings', bookingRoutes);

  // 404 for unmatched routes — same JSON envelope as every other error.
  app.use((_req, res) => {
    res.status(404).json(errorBody('http_error', 'Not Found'));
  });

  // Error handler (must be registered last, must have 4 parameters).
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
