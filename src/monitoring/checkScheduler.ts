import { IDisposable } from '../utils/disposable.js';
import { ILogger, defaultLogger } from '../utils/logger.js';
import { RetryPolicy } from './retryPolicy.js';

export interface SchedulerOptions {
  checkIntervalSeconds?: number;
  maxConcurrentChecks?: number;
  enabled?: boolean;
}

export type ServerCheckTask = (serverId: string) => Promise<void>;

export class CheckScheduler implements IDisposable {
  private timer?: NodeJS.Timeout;
  private intervalMs: number;
  private maxConcurrent: number;
  private isEnabled: boolean;
  private runningChecks = 0;
  private queue: string[] = [];
  private queuedSet: Set<string> = new Set();
  public readonly retryPolicy = new RetryPolicy();

  constructor(
    private readonly checkTask: ServerCheckTask,
    options: SchedulerOptions = {},
    private readonly logger: ILogger = defaultLogger
  ) {
    this.intervalMs = (options.checkIntervalSeconds ?? 60) * 1000;
    this.maxConcurrent = options.maxConcurrentChecks ?? 2;
    this.isEnabled = options.enabled ?? true;

    if (this.isEnabled) {
      this.startTimer();
    }
  }

  public setEnabled(enabled: boolean): void {
    if (this.isEnabled === enabled) {
      return;
    }
    this.isEnabled = enabled;
    if (enabled) {
      this.startTimer();
    } else {
      this.stopTimer();
    }
  }

  public isMonitoringEnabled(): boolean {
    return this.isEnabled;
  }

  public setIntervalSeconds(seconds: number): void {
    this.intervalMs = Math.max(10, seconds) * 1000;
    if (this.isEnabled) {
      this.startTimer();
    }
  }

  public enqueue(serverId: string, priority: boolean = false): void {
    if (this.queuedSet.has(serverId)) {
      return;
    }

    // Check backoff eligibility unless priority (manual refresh)
    if (!priority && !this.retryPolicy.isEligible(serverId)) {
      this.logger.debug(`Server ${serverId} is in backoff cooldown; skipping periodic check.`);
      return;
    }

    this.queuedSet.add(serverId);
    if (priority) {
      this.queue.unshift(serverId);
    } else {
      this.queue.push(serverId);
    }

    this.processQueue();
  }

  public enqueueAll(serverIds: string[], priority: boolean = false): void {
    for (const id of serverIds) {
      this.enqueue(id, priority);
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => {
      // Triggered periodic tick
      this.onTick();
    }, this.intervalMs);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private onTick(): void {
    if (!this.isEnabled) {
      return;
    }
    // The consumer (HealthMonitor) enqueues servers on tick or via hook
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0 || this.runningChecks >= this.maxConcurrent) {
      return;
    }

    while (this.queue.length > 0 && this.runningChecks < this.maxConcurrent) {
      const nextId = this.queue.shift();
      if (!nextId) break;

      this.queuedSet.delete(nextId);
      this.runningChecks++;

      (async () => {
        try {
          await this.checkTask(nextId);
        } catch (err) {
          this.logger.error(`Error in checkTask for ${nextId}`, err);
        } finally {
          this.runningChecks--;
          this.processQueue();
        }
      })();
    }
  }

  public dispose(): void {
    this.stopTimer();
    this.queue = [];
    this.queuedSet.clear();
    this.retryPolicy.reset();
  }
}

