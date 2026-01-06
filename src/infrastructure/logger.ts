import winston from "winston";
import { CONFIG } from "../config/config";

const logger = winston.createLogger({
  level: CONFIG.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    // amazonq-ignore-next-line
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

//Prevent CWE-117 log injection attacks
export const Logger = {
  info: (message: string, meta?: any) =>
    logger.info(message.replace(/[\r\n]/g, "_"), meta),
  error: (message: string, error?: any) =>
    logger.error(message.replace(/[\r\n]/g, "_"), { error }),
  warn: (message: string, meta?: any) =>
    logger.warn(message.replace(/[\r\n]/g, "_"), meta),
};
