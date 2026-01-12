# Integration Tests for Rate Limiting

## Overview
These tests validate that the broadcast system respects Telegram's rate limits (30 messages/second, 5 concurrent requests) when broadcasting to 20k+ subscribers.

## Test Files

### 1. `BroadcastWorker.integration.test.ts` (Happy Paths)
Tests core rate limiting functionality:
- ✅ Respects ~25 messages/second limit
- ✅ Never exceeds 30 messages in any 1-second window
- ✅ Handles 20k+ subscribers without memory issues
- ✅ Maintains max 5 concurrent requests
- ✅ Queues broadcasts and estimates wait time
- ✅ Completes broadcasts in expected time range

### 2. `BroadcastWorker.edge.test.ts` (Edge Cases & Failures)
Tests failure scenarios and edge cases:
- ✅ Zero subscribers
- ✅ Single subscriber
- ✅ All subscribers blocked bot (403 errors)
- ✅ Intermittent 429 rate limit errors
- ✅ Network timeout errors
- ✅ Multiple concurrent broadcasts (race conditions)
- ✅ Database connection failures
- ✅ Extremely slow network (high latency)

### 3. `BroadcastWorker.stress.test.ts` (Stress Testing)
Simulates real Telegram API behavior:
- ✅ Handles 25k subscribers without hitting rate limits
- ✅ Recovers from 429 (Too Many Requests) errors gracefully

### 4. `RateLimitAnalyzer.ts` (Utility)
Utility for analyzing rate limit compliance:
- Calculates average messages per second
- Detects violations in sliding windows
- Generates detailed reports

## Running Tests

### Install Dependencies
```bash
npm install --save-dev jest ts-jest @types/jest
```

### Run All Tests
```bash
npm test
```

### Run Integration Tests Only
```bash
npm test -- tests/integration
```

### Run Stress Tests
```bash
npm test -- tests/integration/BroadcastWorker.stress.test.ts
```

### Run with Coverage
```bash
npm test -- --coverage
```

## Test Configuration

Tests are configured in `jest.config.js`:
- Timeout: 40 seconds (for long-running tests)
- Environment: Node.js
- Test pattern: `**/*.test.ts`

## Key Metrics Validated

| Metric              | Expected           | Validated |
| ------------------- | ------------------ | --------- |
| Messages/second     | 20-28              | ✅         |
| Max in 1s window    | ≤30                | ✅         |
| Concurrent requests | ≤5                 | ✅         |
| Memory usage        | <100MB             | ✅         |
| 429 error handling  | Retry with backoff | ✅         |

## Mock Strategy

Tests use mocks for:
- **IMessenger**: Tracks timestamps and simulates network latency
- **ISubscriberRepository**: Returns test data
- **Database**: In-memory broadcast queue simulation
- **Telegram API Simulator**: Enforces real rate limits and returns 429 errors

## Example Output

```
Rate Limit Analysis Report
===========================
Total Subscribers: 20000
Messages Sent: 20000
Duration: 800s
Avg Messages/Second: 25.0
Max Messages in 1s Window: 28
Rate Limit Violations: 0
Expected Time Range: 667s - 1000s
Status: ✅ PASSED
```

## Troubleshooting

**Tests timing out?**
- Increase timeout in jest.config.js
- Reduce subscriber count for faster tests

**Rate limit violations?**
- Check Bottleneck configuration in BroadcastWorker
- Verify minTime and reservoir settings

**Memory issues?**
- Ensure Promise.all() is used correctly
- Check for memory leaks in worker
