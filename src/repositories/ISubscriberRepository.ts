import { Readable } from "stream";
import { Subscriber } from "./Subscriber";

export interface ISubscriberRepository {
  findByTelegramId(telegramId: number): Promise<Subscriber | null>;
  findByUsername(username: string): Promise<Subscriber | null>;
  getSubscribersStream(lastId: number, limit: number): Readable;
  setActiveStatus(telegramId: number, isActive: boolean): Promise<void>;
  setAdminStatus(telegramId: number, isAdmin: boolean): Promise<void>;
  isAdmin(telegramId: number): Promise<boolean>;
  subscribe(
    telegramId: number,
    username: string,
    isAdmin: boolean
  ): Promise<void>;
  unsubscribe(telegramId: number): Promise<void>;
  countTotalSubcribers(): Promise<number>;
  getSubscriberStats(): Promise<{ active: number; inactive: number; total: number }>;
}
