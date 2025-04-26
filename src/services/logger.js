import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const customFormat = winston.format.printf(({ level, message, timestamp, stack, ...metadata }) => {
  const log = {
    timestamp,
    level,
    message,
    ...metadata,
  };
  if (stack) log.stack = stack;
  return JSON.stringify(log);
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
    }),
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  );
}

// Morgan stream for HTTP logging
logger.stream = {
  write: (message) => logger.info(message.trim()),
};

export default logger;