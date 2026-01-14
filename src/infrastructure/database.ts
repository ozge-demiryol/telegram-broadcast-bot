import mysql, { Pool } from "mysql2/promise";
import { CONFIG } from "../config/config";
import { GetLogger } from "../infrastructure/logger";

export class Database {
  private static instance: Pool;
  private static logger = GetLogger("Database");

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
            this.logger.info(
              "Database pool created and validated successfully."
            );
          })
          .catch((error) => {
            this.logger.error("Database connection validation failed", error);
            Database.instance?.end();
            Database.instance = null as any;
          });
      } catch (error) {
        this.logger.error("Failed to create database pool", error);

        // Handle specific error types
        if (error instanceof Error) {
          if (error.message.includes("ENOTFOUND")) {
            this.logger.error(
              "Database host not found. Check your connection string."
            );
          } else if (error.message.includes("ECONNREFUSED")) {
            this.logger.error(
              "Database connection refused. Check if database server is running."
            );
          } else if (error.message.includes("ER_ACCESS_DENIED")) {
            this.logger.error(
              "Database access denied. Check your credentials."
            );
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
