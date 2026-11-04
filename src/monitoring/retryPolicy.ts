export class RetryPolicy {
  private static readonly BASE_BACKOFF_STEPS_MS = [
    5_000,   // 5s
    15_000,  // 15s
    30_000,  // 30s
    60_000,  // 60s
  ];

  private failureCounts: Map<string, number> = new Map();
  private nextEligibleTimes: Map<string, number> = new Map();

  public recordSuccess(serverId: string): void {
    this.failureCounts.delete(serverId);
    this.nextEligibleTimes.delete(serverId);
  }

  public recordFailure(serverId: string): number {
    const current = (this.failureCounts.get(serverId) || 0) + 1;
    this.failureCounts.set(serverId, current);

    const stepIndex = Math.min(current - 1, RetryPolicy.BASE_BACKOFF_STEPS_MS.length - 1);
    const baseDelay = RetryPolicy.BASE_BACKOFF_STEPS_MS[stepIndex];

    // Jitter: +/- 20%
    const jitterMultiplier = 0.8 + Math.random() * 0.4;
    const delay = Math.round(baseDelay * jitterMultiplier);

    const eligibleAt = Date.now() + delay;
    this.nextEligibleTimes.set(serverId, eligibleAt);
    return delay;
  }

  public isEligible(serverId: string, now: number = Date.now()): boolean {
    const eligibleAt = this.nextEligibleTimes.get(serverId);
    if (!eligibleAt) {
      return true;
    }
    return now >= eligibleAt;
  }

  public getFailureCount(serverId: string): number {
    return this.failureCounts.get(serverId) || 0;
  }

  public reset(serverId?: string): void {
    if (serverId) {
      this.failureCounts.delete(serverId);
      this.nextEligibleTimes.delete(serverId);
    } else {
      this.failureCounts.clear();
      this.nextEligibleTimes.clear();
    }
  }
}

