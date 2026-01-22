import { ISettingsRepository } from "./ISettingsRepository";
import { Pool } from "mysql2/promise";
import { GetLogger } from "../../infrastructure/logger";
import { BROADCAST_SPEED } from "../../config/constants";

export class SettingsRepository implements ISettingsRepository {

    private logger = GetLogger("SettingsRepository");

    private defaultMessage = "Welcome to the bot!";
    private defaultSpeed = BROADCAST_SPEED.DEFAULT;

    private welcomeMessageCache: string | null = null;
    private broadcastLimitCache: number | null = null;

    constructor(private db: Pool) { }

    async getWelcomeMessage(): Promise<string> {
        if (this.welcomeMessageCache) {
            return this.welcomeMessageCache;
        }

        // 2. If cache is empty, go to db (Only runs when bot is up first time)
        try {
            const [rows]: any = await this.db.execute(
                "SELECT setting_value FROM bot_settings WHERE setting_key = 'welcome_message'"
            );

            const message = rows[0]?.setting_value || this.defaultMessage;
            this.welcomeMessageCache = message;
            return message;
        } catch (error) {
            this.logger.error("Error:", error);
            return this.defaultMessage;
        }
    }
    async setWelcomeMessage(message: string): Promise<void> {
        await this.db.execute(
            `INSERT INTO bot_settings (setting_key, setting_value) 
       VALUES ('welcome_message', ?) 
       ON DUPLICATE KEY UPDATE setting_value = ?`,
            [message, message]
        );

        this.welcomeMessageCache = message;
    }
    async getBroadcastLimit(): Promise<number> {
        if (this.broadcastLimitCache !== null) {
            return this.broadcastLimitCache;
        }
        try {
            const [rows]: any = await this.db.execute(
                "SELECT setting_value FROM bot_settings WHERE setting_key = 'broadcast_speed'"
            );
            const limit = rows[0]?.setting_value ? parseInt(rows[0].setting_value, 10) : this.defaultSpeed;
            this.broadcastLimitCache = limit;
            return limit;
        } catch (error) {
            this.logger.error("Error getting broadcast limit:", error);
            return this.defaultSpeed; // Default fallback
        }
    }
    async setBroadcastLimit(limit: number): Promise<void> {
        await this.db.execute(
            `INSERT INTO bot_settings (setting_key, setting_value) 
       VALUES ('broadcast_speed', ?) 
       ON DUPLICATE KEY UPDATE setting_value = ?`,
            [limit.toString(), limit.toString()]
        );
        this.broadcastLimitCache = limit;
    }

}