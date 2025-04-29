import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import logger from "./services/logger.js";
import {pool, initializeDatabase} from "./config/db.js";
import cors from "cors"

// load enviroment variables

dotenv.config()

const app = express();

app.use(cors())

app.use(helmet());

app.use(morgan('combined', {stream: logger.stream}))

app.use(express.json())
app.use(express.urlencoded({ extended: false}));

// routes
import classesRoutes from './routes/classes_routes.js'
import studentsRoutes from "./routes/students_routes.js"
import feeRoutes from "./routes/fees_routes.js"
import feeTypeRoutes from "./routes/fee_types_routes.js"

app.use('/api/v1', classesRoutes);
app.use('/api/v1', studentsRoutes);
app.use('/api/v1', feeRoutes)
app.use('/api/v1/fee-type', feeTypeRoutes)


app.use((req, res, next) => {
    const error = new Error('Not Found');
    error.status = 404;
    next(error);
})


// Global error Handler

app.use((err, req, res, next) => {
    logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`)
    res.status(err.status || 500).json({
        error: {
            message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
        }
    })
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason.stack || reason}`);
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Closing database connections...');
    await pool.end();
    logger.info('Database connections closed. Exiting...');
    process.exit(0);
  });

  export {app}