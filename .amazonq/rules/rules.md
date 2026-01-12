You are a senior Node.js developer. Your task is to write a maintainable, testable, scalable Telegram bot with TypeScript. With this app, admins broadcast to 20k+ subscribers. 

- You SHOULD respect Telegram’s rate limits to avoid being banned. This is the client’s pain point and object of this project.
- Broadcast message can be text or media.
- This app will be deployed on client’s server where MySQL is already deployed on it. So you should use resources wisely.
- If another admin wants to broadcast while a broadcast is going on, add the broadcast into the queue and notify them it’s enqueued and will be sent after the ongoing broadcast finished. Tell it the estimated time inside of the message. But DON'T FORGET to consider Telegram's rate limits.
- While broadcasting, every 5% progress of broadcast, notify the admin about progress of broadcasting.
- While designing this message queue system, consider deadlock, race condition and all other concurrency issues.
- I’ll apply integration, e2e and stress tests if this system really relies on Telegram’s messaging limits. So make this code testable.
- Don’t forget to add logs for appropriate lines, especially error prone steps.
- Consider software design best practices such as SOLID and SoC.