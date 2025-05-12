import pkg from "pg";
import logger from "../services/logger.js";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const { Pool } = pkg;

// Configuration with validations
const DB_CONFIG = {
  MAX_RETRIES: parseInt(process.env.DB_MAX_RETRIES || 5, 10),
  RETRY_DELAY: parseInt(process.env.DB_RETRY_DELAY || 2000, 10),
  POOL_SIZE: parseInt(process.env.DB_POOL_SIZE || 10, 10),
  CONNECTION_TIMEOUT: parseInt(process.env.DB_CONNECTION_TIMEOUT || 10000, 10),
};

// Validate DB_CONFIG
for (const [key, value] of Object.entries(DB_CONFIG)) {
  if (isNaN(value) || value < 0) {
    logger.error(`Invalid ${key} configuration: ${value}`);
    throw new Error(`Invalid ${key} configuration: ${value}`);
  }
}

// Determine environment
const isProduction = process.env.NODE_ENV === "production";

// Required environment variables based on environment
const requiredEnvVars = isProduction
  ? ["DATABASE_URL"] // NeonDB uses a single connection URL
  : ["DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"];

// Validate environment variables
requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    logger.error(`Environment variable ${envVar} is not defined`);
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
  // logger.debug(`Environment variable ${envVar}: ${process.env[envVar]}`);
});

let pool;
let connectionAttempts = 0;
const maxRetries = DB_CONFIG.MAX_RETRIES;

// Create connection pool
const createPool = () => {
  const poolConfig = isProduction
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false, // Required for NeonDB in production
        },
        min: 1,
        max: DB_CONFIG.POOL_SIZE,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: DB_CONFIG.CONNECTION_TIMEOUT,
        allowExitOnIdle: true,
        keepAlive: true,
        keepalivesIdle: 30,
      }
    : {
        host: "localhost",
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        min: 1,
        max: DB_CONFIG.POOL_SIZE,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: DB_CONFIG.CONNECTION_TIMEOUT,
        allowExitOnIdle: true,
        keepAlive: true,
        keepalivesIdle: 30,
      };

  return new Pool(poolConfig);
};

// Initialize pool
pool = createPool();

// Handle connection errors
pool.on("error", (error, client) => {
  logger.error(`Unexpected error on idle client: ${error.stack}`);
  process.exit(1);
});

// Test connection with retry logic
async function initializeDatabase() {
  while (connectionAttempts < maxRetries) {
    try {
      const client = await pool.connect();
      logger.info(
        `Successfully connected to ${isProduction ? "NeonDB" : "local PostgreSQL"}`
      );
      client.release();
      connectionAttempts = 0; // Reset attempts on success
      return;
    } catch (error) {
      connectionAttempts++;
      logger.error(
        `Failed to connect to ${isProduction ? "NeonDB" : "local PostgreSQL"} (attempt ${connectionAttempts}/${maxRetries}): ${error.stack}`
      );
      if (connectionAttempts >= maxRetries) {
        logger.error("Max retry attempts reached. Exiting...");
        process.exit(1);
      }
      logger.info(`Retrying in ${DB_CONFIG.RETRY_DELAY}ms...`);
      await new Promise((resolve) =>
        setTimeout(resolve, DB_CONFIG.RETRY_DELAY)
      );
    }
  }
}

export { pool, initializeDatabase };
