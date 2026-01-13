import mysql, { Pool } from "mysql2/promise";
import { CONFIG } from "../config/config";
import { Logger } from "../infrastructure/logger";

export class Database {
  private static instance: Pool;

  private constructor() {}

  public static getInstance(): Pool {
    if (!Database.instance) {
      try {
        Database.instance = mysql.createPool({
          host: CONFIG.DB.HOST,
          port: CONFIG.DB.PORT,
          user: CONFIG.DB.USER,
          password: CONFIG.DB.PASSWORD,
          database: CONFIG.DB.DATABASE,
          connectionLimit: 10,
          enableKeepAlive: true,
        });

        // Validate connection
        Database.instance
          .getConnection()
          .then((connection) => {
            connection.release();
            Logger.info("Database pool created and validated successfully.");
          })
          .catch((error) => {
            Logger.error("Database connection validation failed", error);
            Database.instance?.end();
            Database.instance = null as any;
          });
      } catch (error) {
        Logger.error("Failed to create database pool", error);

        // Handle specific error types
        if (error instanceof Error) {
          if (error.message.includes("ENOTFOUND")) {
            Logger.error(
              "Database host not found. Check your connection string."
            );
          } else if (error.message.includes("ECONNREFUSED")) {
            Logger.error(
              "Database connection refused. Check if database server is running."
            );
          } else if (error.message.includes("ER_ACCESS_DENIED")) {
            Logger.error("Database access denied. Check your credentials.");
          }
        }

        throw new Error(
          `Database initialization failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }
    return Database.instance;
  }
}
