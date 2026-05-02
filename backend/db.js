// Ito yung library na ginagamit namin para makakonekta sa PostgreSQL database
const { Pool } = require("pg");
const path = require("path");

// Kinukuha namin yung mga secret values (password, database name, etc.) galing sa .env file
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Dito namin ginagawa yung koneksyon sa database.
// Kung may DATABASE_URL (gaya sa Railway), yun ang gamitin kasama SSL para secure.
// Kung wala, gagamit tayo ng hiwalay na credentials mula sa .env (para sa localhost).
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // kailangan ito para hindi mag-error sa Railway
    })
  : new Pool({
      user:     process.env.DB_USER,
      host:     process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port:     process.env.DB_PORT,
    });

// I-export natin ang pool para magamit ng server.js sa pag-query ng database
module.exports = pool;
