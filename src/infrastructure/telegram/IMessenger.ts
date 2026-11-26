export interface IMessenger {
  copyMessage(toChatId: number, fromChatId: number, messageId: number): Promise<void>;
  sendMessage(toChatId: number, text: string, extra?: any): Promise<void>;
}