export interface ISettingsRepository {
    getWelcomeMessage(): Promise<string>;
    setWelcomeMessage(message: string): Promise<void>;
    getBroadcastLimit(): Promise<number>;
    setBroadcastLimit(limit: number): Promise<void>;
}