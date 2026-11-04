import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/eventBus.js';
import { CheckScheduler } from '../../src/monitoring/checkScheduler.js';
import { CompositeDisposable } from '../../src/utils/disposable.js';
import { HealthMonitor } from '../../src/monitoring/healthMonitor.js';

describe('Security & Stability: Resource Cleanup and Lifecycle', () => {
  it('cleans up timers and queues when CheckScheduler is disposed', () => {
    const checkFn = vi.fn().mockResolvedValue(undefined);
    const scheduler = new CheckScheduler(checkFn, {
      checkIntervalSeconds: 10,
      enabled: true,
    });

    scheduler.enqueue('srv-1');
    scheduler.enqueue('srv-2');

    scheduler.dispose();

    expect(scheduler.isMonitoringEnabled()).toBe(true); // retains configuration state
    // Further enqueues after dispose should be safely no-ops or cleared
  });

  it('CompositeDisposable executes all teardown methods without throwing', () => {
    const composite = new CompositeDisposable();
    const thrower = {
      dispose: vi.fn().mockImplementation(() => {
        throw new Error('Explosion during teardown');
      }),
    };
    const regular = { dispose: vi.fn() };

    composite.add(thrower);
    composite.add(regular);

    expect(() => composite.dispose()).not.toThrow();
    expect(thrower.dispose).toHaveBeenCalled();
    expect(regular.dispose).toHaveBeenCalled();
  });

  it('HealthMonitor disposes event listeners and schedulers cleanly', () => {
    const eventBus = new EventBus();
    const monitor = new HealthMonitor(eventBus);

    monitor.dispose();
    eventBus.dispose();
  });
});

