import { Database } from "../../infrastructure/database";

const pool = Database.getInstance();

async function runBroadcast(job: any) {
  const connection = await pool.getConnection();
  let stats = { success: 0, blocked: 0, failed: 0 };
  let processedCount = 0;
  let blockedBuffer: number[] = []; // Local array for blocked IDs

  try {
    const [countRes]: any = await connection.query(
      "SELECT COUNT(*) as total FROM subscribers WHERE isActive = 1"
    );
    const total = countRes[0].total;
    const reportInterval = Math.min(
      1000,
      Math.max(1, Math.floor(total * 0.05))
    );

    const stream = (connection as any).connection
      .query("SELECT telegramId FROM subscribers WHERE isActive = 1")
      .stream();

    const tasks: Promise<void>[] = [];

    for await (const row of stream) {
      const targetId = row.telegramId;

      const task = limit(async () => {
        try {
          await bot.telegram.copyMessage(
            targetId,
            job.from_chat_id,
            job.message_id
          );
          stats.success++;
        } catch (error: any) {
          const errCode = error.response?.error_code;
          if (errCode === 403 || errCode === 401) {
            stats.blocked++;
            blockedBuffer.push(targetId); // Store in array instead of DB call
          } else {
            stats.failed++;
          }
        } finally {
          processedCount++;

          // Flush blocked users and report progress at the interval
          if (
            processedCount % reportInterval === 0 ||
            processedCount === total
          ) {
            await flushBlockedUsers(blockedBuffer);
            blockedBuffer = []; // Clear the array
            await notifyAdmin(job.id, processedCount, total);
          }
        }
      });

      tasks.push(task);
      if (tasks.length >= 100) {
        await Promise.all(tasks);
        tasks.length = 0;
      }
    }

    await Promise.all(tasks);
    // Final check to ensure the last few blocked users are saved
    if (blockedBuffer.length > 0) await flushBlockedUsers(blockedBuffer);

    await finalizeJob(job.id, stats);
  } finally {
    connection.release();
  }
}

// Helper to update blocked users in one efficient query
async function flushBlockedUsers(ids: number[]) {
  if (ids.length === 0) return;
  try {
    // Uses the "IN" clause for a single batch update
    await pool.query(
      "UPDATE subscribers SET isActive = 0 WHERE telegramId IN (?)",
      [ids]
    );
  } catch (err) {
    console.error("[DB ERROR] Failed to flush blocked users:", err);
  }
}
