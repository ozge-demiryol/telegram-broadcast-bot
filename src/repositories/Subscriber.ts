export interface Subscriber {
  id: number;
  telegramId: number;
  username?: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: Date;
}
