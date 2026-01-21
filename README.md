# Telegram Broadcast Bot

A robust, TypeScript-powered Telegram bot designed for subscription management and administrative broadcasts. This project utilizes MySQL for data persistence and message queue system that prevents the bot from being banned.

## How It Works

This bot is built for broadcasting to subscribers without hitting the Telegram's rate limits and it prevents the bot being banned with its message queue management system. Telegram's limit is 30 messages per second, but it's set as 5-6 messages/second to stay at the safe zone. **It can be changed later from configuration. See: Message Queue Management System**

### For Users

- **Easy Onboarding:** When a user starts the bot, they receive a warm welcome and a `/help` menu explaining what the bot can do.
- **Simple Subscription:** Users can join your bot by sending `/subscribe` command.
- **Opt-out Anytime:** Users can stop receiving messages by sending `/unsubscribe`.

### For Administrators

- **Broadcast Messaging:** Admins can send an announcement to all subscribers simply by sending a message directly to the bot.
- **Admin Dashboard:** Access the private `/dashboard` to view bot statistics and management tools.
- **Admin Management:** Admins have the authority to grant or revoke administrative privileges for other users via `/grant` or `/revoke` command.
- **Speed Control:** Admins can adjust the message sending speed (messages per second) to optimize delivery and avoid rate limits. Speed limit can be adjusted with `/speed <number>` command (e.g. `/speed 5`). This value can be 30 at most. And the current message sending speed can be seen with `/speed` command.
- **System Stats:** Admins can view current system statistics, including active/inactive subscribers and current message sending speed.

### Command List

- `/start`
- `/help`
- `/subscribe`
- `/unsubscribe`
- `/dashboard`
- `/grant`
- `/revoke`
- `/speed`
- `/speed <number>`

## Message Queue Management System

To ensure reliable delivery and stay within Telegram's strict limits, the bot uses a smart message queue management system. This prevents the bot from being flagged as "spammy" and ensures your broadcasts reach as many active users as possible.

### How it Works
1.  **Queue First:** When you send a message to broadcast, it doesn't send instantly to everyone. Instead, it's safely added to a queue. When an admin tries to start a new broadcast while a broadcast is already going on, the new broadcast is added to the queue and it will be processed after the current broadcast is completed. All broadcasts are recorded into the `broadcasts` table.
2.  **Smart Pacing:** 
    - The bot sends a small "chunk" of messages (its default size is 25, but it can be always changed from `.env` file as `CHUNK_SIZE`), then takes a quick 2-second breath.
    - Within each batch, the bot processes messages one at a time, at a steady pace that Telegram likes. For large subscriber lists (e.g., 20,000+ users), the bot doesn't try to fetch everyone at once. Instead, it fetches subscribers in small, manageable "pages" from the `subscribers` table. The pagination size can be changed from `.env` file as `PAGE_SIZE`.
    - This steady rhythm keeps the bot under the radar and avoids being banned.
3.  **Self-Cleaning List:** If a user has blocked the bot, the system detects it and automatically marks them as inactive. This keeps your subscriber list clean and efficient.
4.  **Intelligent Recovery:** 
    - If Telegram says "slow down" (429 error), the bot waits for the exact time requested before resuming.
    - If the internet connection drops or times out, it waits a few seconds and retries automatically.
5.  **Admin Updates:** For large broadcasts, the bot sends you progress updates (every 500 messages) so you know exactly how many users have been reached.

## 🛠 Developer Installation (Local Setup)

Follow these steps to get your development environment running locally.

### 1. Fetch the Repository

Clone the project from Git to your local machine:

```bash
git clone <your-repository-url>
cd <project-directory>
```

### 2. Install Dependencies

Bash

```bash
npm install
```

### 3. Environment Configuration

Copy the template variables to create your local environment file:

```bash
cp .env.example .env
```

### 4. Telegram Token: Paste the token provided by @BotFather

### 5. Expose Local Server (ngrok)

If you will run the bot on webhook mode, you need to use ngrok to expose your local machine to the internet. Download ngrok on your computer and run this command to expose your computer to the internet:

```bash
ngrok http 3000
```

Public URL: Use your ngrok URL into the environment variable for Webhook mode.

### 6. Dockerize Dependencies

Start the MySQL services:

```bash
docker compose up -d
```

#### Execution Modes

Polling Mode: Set NODE_ENV=dev or test. (Best for local testing).

Webhook Mode: Set NODE_ENV=production. (Required for PUBLIC_URL usage).

### 🚀 Running the Bot

Compile TypeScript to JavaScript:

```bash
npm run build
```

Run for Debugging:

```bash
npm start
```
