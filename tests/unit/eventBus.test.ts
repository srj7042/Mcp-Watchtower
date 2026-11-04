import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/eventBus.js';
import { McpServerDefinition } from '../../src/models/server.js';

describe('EventBus', () => {
  it('subscribes and emits events to listeners', () => {
    const bus = new EventBus();
    const listener = vi.fn();

    const subscription = bus.on('server:discovered', listener);

    const testServer: McpServerDefinition = {
      id: 'test-1',
      name: 'test-server',
      transport: 'stdio',
      source: 'GLOBAL',
      configurationPath: '/test/path.json',
      configurationValid: true,
      enabled: true,
      sanitizedMetadata: {},
      discoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    bus.emit('server:discovered', testServer);
    expect(listener).toHaveBeenCalledWith(testServer);

    subscription.dispose();
    bus.emit('server:discovered', testServer);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('handles multiple listeners and cleans up on dispose', () => {
    const bus = new EventBus();
    const l1 = vi.fn();
    const l2 = vi.fn();

    bus.on('monitoring:toggled', l1);
    bus.on('monitoring:toggled', l2);

    bus.emit('monitoring:toggled', true);
    expect(l1).toHaveBeenCalledWith(true);
    expect(l2).toHaveBeenCalledWith(true);

    bus.dispose();
    bus.emit('monitoring:toggled', false);
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);
  });
});

