/** Settings and business constants in one place. */

const DATABASE_PATH = process.env.DATABASE_PATH || './clinic.db';
const MIN_SLOT_MINUTES = 5;
const MAX_SLOT_MINUTES = 8 * 60;
const MAX_ID = 2 ** 31 - 1; // fits a PostgreSQL integer; stops overflow errors on huge ids

module.exports = { DATABASE_PATH, MIN_SLOT_MINUTES, MAX_SLOT_MINUTES, MAX_ID };
