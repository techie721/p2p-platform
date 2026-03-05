const knex = require('knex');

const db = knex({
  client: 'postgresql',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  },
  pool: {
    min: 2,
    max: 10,
  },
  acquireConnectionTimeout: 30000,
});

module.exports = db;