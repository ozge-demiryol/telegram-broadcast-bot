export class RateLimitAnalyzer {
  static analyzeTimestamps(timestamps: number[]): {
    avgMessagesPerSecond: number;
    maxMessagesInWindow: number;
    violations: number;
    totalDuration: number;
  } {
    if (timestamps.length === 0) {
      return { avgMessagesPerSecond: 0, maxMessagesInWindow: 0, violations: 0, totalDuration: 0 };
    }

    const totalDuration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
    const avgMessagesPerSecond = timestamps.length / totalDuration;

    let maxMessagesInWindow = 0;
    let violations = 0;

    for (let i = 0; i < timestamps.length; i++) {
      const windowStart = timestamps[i];
      const windowEnd = windowStart + 1000;
      const messagesInWindow = timestamps.filter(
        (ts) => ts >= windowStart && ts < windowEnd
      ).length;

      maxMessagesInWindow = Math.max(maxMessagesInWindow, messagesInWindow);
      if (messagesInWindow > 30) violations++;
    }

    return {
      avgMessagesPerSecond: parseFloat(avgMessagesPerSecond.toFixed(2)),
      maxMessagesInWindow,
      violations,
      totalDuration: parseFloat(totalDuration.toFixed(2)),
    };
  }

  static generateReport(timestamps: number[], subscriberCount: number): string {
    const analysis = this.analyzeTimestamps(timestamps);
    const expectedMinTime = subscriberCount / 30;
    const expectedMaxTime = subscriberCount / 20;

    return `
Rate Limit Analysis Report
===========================
Total Subscribers: ${subscriberCount}
Messages Sent: ${timestamps.length}
Duration: ${analysis.totalDuration}s
Avg Messages/Second: ${analysis.avgMessagesPerSecond}
Max Messages in 1s Window: ${analysis.maxMessagesInWindow}
Rate Limit Violations: ${analysis.violations}
Expected Time Range: ${expectedMinTime.toFixed(0)}s - ${expectedMaxTime.toFixed(0)}s
Status: ${analysis.violations === 0 ? "✅ PASSED" : "❌ FAILED"}
    `.trim();
  }
}
