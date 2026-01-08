# Telegram Broadcast Bot

A robust, TypeScript-powered Telegram bot designed for subscription management and administrative broadcasts. This project utilizes MySQL for data persistence and Redis for queue system that prevents the bot being banned.

## How It Works

This bot is built for broadcasting to subscribers without hitting the Telegram's rate limits and it prevents the bot being banned with its message queue system. Telegram's limit is 30 messages per minute, but it's set as 25 messages to stay at the safe zone. **It can be changed later from configuration. See: Message Queue System**

### For Users
* **Easy Onboarding:** When a user starts the bot, they receive a warm welcome and a `/help` menu explaining what the bot can do.
* **Simple Subscription:** Users can join your bot by sending `/subscribe` command.
* **Opt-out Anytime:** Users can stop receiving messages by sending `/unsubscribe`.

### For Administrators
* **Broadcast Messaging:** Admins can send an announcement to all subscribers by using the `/broadcast` command or simply by sending a message directly to the bot.
* **Admin Dashboard:** Access the private `/dashboard` to view bot statistics and management tools.
* **Admin Management:** Admins have the authority to grant or revoke administrative privileges for other users via `/grant` or `/revoke` command.


## Message Queue System

To prevent the bot from being banned due to exceeding Telegram's rate limits, a message queue system is implemented using Redis by throttling the broadcasting. This system ensures that messages are sent out at a controlled rate, adhering to Telegram's guidelines. Telegram's limit is 30 messages per second and 5 concurrent API request. But to stay at the safe zone, we set it 25 for now. It can be changed anytime from `.env`. You can find the variable holds this value as `RATE_LIMIT` and `CONCURRENT_REQUESTS`

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

### 4. Telegram Token: Paste the token provided by @BotFather.

### 5. Expose Local Server (ngrok)

Download ngrok on your computer and run this command to expose your computer to the internet:

```bash
ngrok http 3000
```
Public URL: Use your ngrok URL into the environment variable for Webhook mode.

### 6. Dockerize Dependencies
Start the MySQL and Redis (required for the queue) services:

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

> Warning: Ensure Redis is running via Docker before attempting a /broadcast, as the queue system relies on it to manage message delivery.