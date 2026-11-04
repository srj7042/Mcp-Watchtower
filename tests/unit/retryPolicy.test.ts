import { describe, it, expect } from 'vitest';
import { RetryPolicy } from '../../src/monitoring/retryPolicy.js';

describe('RetryPolicy', () => {
  it('implements exponential backoff steps with jitter', () => {
    const policy = new RetryPolicy();
    const serverId = 'srv-retry-1';

    // First failure: ~5000ms (+/- 20%)
    const delay1 = policy.recordFailure(serverId);
    expect(delay1).toBeGreaterThanOrEqual(4000);
    expect(delay1).toBeLessThanOrEqual(6000);
    expect(policy.isEligible(serverId, Date.now())).toBe(false);

    // Second failure: ~15000ms (+/- 20%)
    const delay2 = policy.recordFailure(serverId);
    expect(delay2).toBeGreaterThanOrEqual(12000);
    expect(delay2).toBeLessThanOrEqual(18000);

    // Third failure: ~30000ms (+/- 20%)
    const delay3 = policy.recordFailure(serverId);
    expect(delay3).toBeGreaterThanOrEqual(24000);
    expect(delay3).toBeLessThanOrEqual(36000);
  });

  it('resets backoff cooldown on success', () => {
    const policy = new RetryPolicy();
    const serverId = 'srv-retry-2';

    policy.recordFailure(serverId);
    expect(policy.isEligible(serverId, Date.now())).toBe(false);

    policy.recordSuccess(serverId);
    expect(policy.isEligible(serverId, Date.now())).toBe(true);
    expect(policy.getFailureCount(serverId)).toBe(0);
  });
});

