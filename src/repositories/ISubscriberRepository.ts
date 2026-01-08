import { Subscriber } from "./Subscriber";

export interface ISubscriberRepository {
  findByTelegramId(telegramId: number): Promise<Subscriber | null>;
  findByUsername(username: string): Promise<Subscriber | null>;
  findAllActive(): Promise<Subscriber[]>;
  setActiveStatus(telegramId: number, isActive: boolean): Promise<void>;
  setAdminStatus(telegramId: number, isAdmin: boolean): Promise<void>;
  isAdmin(telegramId: number): Promise<boolean>;
  subscribe(
    telegramId: number,
    username: string,
    isAdmin: boolean
  ): Promise<void>;
  unsubscribe(telegramId: number): Promise<void>;
}
