# Clinic Booking API

Clinics publish time slots; patients book them. A slot can never be double-booked,
even when two requests arrive at the same moment.

Built with Node.js, Express, better-sqlite3. SQLite by default.

## Setup

Requires Node.js 18 or newer.

    npm install

## Run

    npm run dev

The API is at http://127.0.0.1:8000.

The SQLite database is created automatically as ./clinic.db.

## Run the tests

    npm test

31 tests run in about two seconds. They use a temporary SQLite file and a fake clock,
so they need no running server and no setup.

## Endpoints

| Method | Path                           | Purpose                                   |
|--------|--------------------------------|-------------------------------------------|
| POST   | /clinics                       | Create a clinic                           |
| GET    | /clinics                       | List clinics                              |
| GET    | /clinics/{id}                  | Get a clinic                              |
| POST   | /clinics/{id}/slots            | Publish a slot                            |
| GET    | /clinics/{id}/slots            | List slots (status, starts_after, starts_before, limit, offset) |
| GET    | /clinics/{id}/bookings         | List a clinic's bookings                  |
| GET    | /slots/{id}                    | Get a slot                                |
| POST   | /slots/{id}/cancel             | Cancel a slot (also cancels its booking)  |
| POST   | /slots/{id}/bookings           | Book a slot                               |
| GET    | /bookings?patient_email=...    | List a patient's bookings                 |
| GET    | /bookings/{id}                 | Get a booking                             |
| POST   | /bookings/{id}/cancel          | Cancel a booking (re-opens the slot)      |

## Booking rules

- A slot has at most one active booking, even under simultaneous requests (409 slot_already_booked).
- A cancelled slot cannot be booked (409 slot_cancelled).
- A slot that has started cannot be booked (409 slot_in_past).
- Cancelling a booking re-opens the slot. Cancelling a slot cancels its booking.
- Slots must start in the future, end after they start, last 5 minutes to 8 hours,
  and use times with a timezone (for example 2030-03-01T09:00:00Z).

## Example requests

    curl -X POST localhost:8000/clinics -H 'Content-Type: application/json' \
      -d '{"name":"Green Valley Clinic"}'

    curl -X POST localhost:8000/clinics/1/slots -H 'Content-Type: application/json' \
      -d '{"start_time":"2030-03-01T09:00:00Z","end_time":"2030-03-01T09:30:00Z"}'

    curl 'localhost:8000/clinics/1/slots?status=open'

    curl -X POST localhost:8000/slots/1/bookings -H 'Content-Type: application/json' \
      -d '{"patient_name":"Asha Rao","patient_email":"asha@example.com"}'

    curl -X POST localhost:8000/bookings/1/cancel

## Errors

Every error looks like:

    {"error": {"code": "slot_already_booked", "message": "This slot has already been booked."}}

404 not found, 409 conflict with current state, 422 invalid input (with a `details`
list naming each bad field).

## How double-booking is prevented

Booking claims the slot with one atomic statement:

    UPDATE slots SET status='booked' WHERE id=:id AND status='open' AND start_time > :now

Only one of any number of simultaneous requests changes a row. A partial unique index on
confirmed bookings is a second guard at the database level. See tests/concurrency.test.js.

## Project layout

    src/routes/     HTTP only
    src/services/   business rules
    src/database.js tables and constraints
    src/validators.js  request/response validation (Zod)
    tests/          booking rules and concurrency tests
