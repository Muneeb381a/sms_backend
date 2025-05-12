import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

// Ensure /tmp/logs directory exists
const logDir = "/tmp/logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const customFormat = winston.format.printf(
  ({ level, message, timestamp, stack, ...metadata }) => {
    const log = {
      timestamp,
      level,
      message,
      ...metadata,
    };
    if (stack) log.stack = stack;
    return JSON.stringify(log);
  }
);

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    // Console transport for CloudWatch (always enabled in Lambda)
    new winston.transports.Console({
      format: winston.format.combine(
        process.env.NODE_ENV !== "production"
          ? winston.format.colorize()
          : winston.format.uncolorize(),
        customFormat
      ),
    }),
    // Error log file in /tmp/logs
    new DailyRotateFile({
      filename: path.join(logDir, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
      level: "error",
    }),
    // Combined log file in /tmp/logs
    new DailyRotateFile({
      filename: path.join(logDir, "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
    }),
  ],
});

// Morgan stream for HTTP logging
logger.stream = {
  write: (message) => logger.info(message.trim()),
};

export default logger;
