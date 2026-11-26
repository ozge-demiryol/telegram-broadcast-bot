import winston from "winston";
import { CONFIG } from "../config/config";
import path from "path";
import "winston-daily-rotate-file";

const { combine, timestamp, printf, errors, json, colorize, simple, label } =
  winston.format;

// The bot token shows up in the webhook URL and in node-fetch error messages
// (https://api.telegram.org/bot<TOKEN>/...), so it must never reach the logs.
const redact = (text: string) => text.split(CONFIG.TELEGRAM.TOKEN).join("***");

//[Date] [Log level] [Class name] - Message {meta}
const customFormat = printf(({ level, message, label, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length ? JSON.stringify(meta) : "";
  return redact(
    `[${timestamp}] [${level.toUpperCase()}] [${label}] - ${message} ${metaString}`
  );
});

const sanitize = (msg: string) => redact(msg.replace(/[\r\n]/g, "_"));

export const GetLogger = (className: string) => {
  const dailyDir = path.join("logs", "%DATE%");

  const logger = winston.createLogger({
    level: CONFIG.LOG_LEVEL || "info",
    format: combine(
      label({ label: className }),
      timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      errors({ stack: true }),
      json()
    ),
    transports: [
      // 1. TÜM LOGLAR - Günlük Klasörde
      new (winston.transports as any).DailyRotateFile({
        dirname: dailyDir,
        filename: "application-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "20m",
        maxFiles: "14d",
        format: combine(
          timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          customFormat
        ),
      }),

      // Only error logs
      new (winston.transports as any).DailyRotateFile({
        level: "error",
        dirname: dailyDir,
        filename: "errors-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        zippedArchive: true,
        maxSize: "20m",
        maxFiles: "30d",
        format: combine(
          timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          customFormat
        ),
      }),

      new winston.transports.Console({
        format: combine(
          colorize(),
          label({ label: className }),
          timestamp({ format: "HH:mm:ss" }),
          printf(({ level, message, label, timestamp }) => {
            return `${timestamp} ${level} [${label}]: ${message}`;
          })
        ),
      }),
    ],
  });

  return {
    info: (message: string, meta?: any) => logger.info(sanitize(message), meta),
    error: (message: string, error?: any) => {
      let errorMeta = error;
      if (error instanceof Error) {
        errorMeta = {
          ...error,
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
          sqlMessage: (error as any).sqlMessage,
        };
      }
      return logger.error(sanitize(message), { error: errorMeta });
    },
    warn: (message: string, meta?: any) => logger.warn(sanitize(message), meta),
    debug: (message: string, meta?: any) =>
      logger.debug(sanitize(message), meta),
  };
};
