import winston from 'winston';
import { config } from './config.js';

const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp }) => {
    return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
  })
);

export const logger = winston.createLogger({
  level: 'info',
  format: customFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    }),
    new winston.transports.File({
      filename: config.appLogFile,
      level: 'info'
    })
  ]
});

// Dedicated chat logger to append messages to chat.log with timestamp
export const chatLogger = winston.createLogger({
  level: 'info',
  format: customFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ message, timestamp }) => `[CHAT ${timestamp}]: ${message}`)
      )
    }),
    new winston.transports.File({
      filename: config.chatLogFile
    })
  ]
});

export function logChatMessage(username, message) {
  chatLogger.info(`<${username}>: ${message}`);
}
