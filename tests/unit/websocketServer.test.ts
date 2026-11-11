import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { EventBus } from '../../src/core/eventBus.js';
import { WatchtowerWebSocketServer } from '../../src/server/websocketServer.js';
import { ObservabilityEvent } from '../../src/observability/events.js';

describe('WatchtowerWebSocketServer', () => {
  let server: WatchtowerWebSocketServer | null = null;
  const eventBus = new EventBus();

  afterEach(() => {
    if (server) {
      server.dispose();
      server = null;
    }
  });

  it('starts on loopback 127.0.0.1 and enforces authentication', async () => {
    server = new WatchtowerWebSocketServer(eventBus, { authToken: 'secret123' });
    const port = await server.start(0);
    expect(port).toBeGreaterThan(0);

    // 1. Connection without token should be rejected (401)
    await expect(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/events`);
        ws.on('open', () => {
          ws.close();
          resolve(true);
        });
        ws.on('error', (err) => reject(err));
      })
    ).rejects.toThrow();

    // 2. Connection with token should succeed
    const received = await new Promise<boolean>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/events?token=secret123`);
      ws.on('open', () => {
        ws.close();
        resolve(true);
      });
      ws.on('error', (err) => reject(err));
    });

    expect(received).toBe(true);
  });

  it('receives observability events from companion client and emits to event bus', async () => {
    server = new WatchtowerWebSocketServer(eventBus, { authToken: 'token_abc' });
    const port = await server.start(0);

    const eventReceivedPromise = new Promise<ObservabilityEvent>((resolve) => {
      eventBus.on('observability:event', (e) => {
        resolve(e);
      });
    });

    const ws = new WebSocket(`ws://127.0.0.1:${port}/events?token=token_abc`);
    await new Promise((resolve) => ws.on('open', resolve));

    const testEvent: ObservabilityEvent = {
      id: 'ws_ev_1',
      eventType: 'agent:prompt',
      agentId: 'claude-code',
      agentName: 'Claude Code',
      sessionId: 'sess_ws_1',
      promptId: 'prompt_1',
      promptTextLength: 45,
      estimatedPromptTokens: 11,
      model: 'claude-3-5-sonnet',
      timestamp: Date.now(),
    };

    ws.send(JSON.stringify(testEvent));
    const receivedEvent = await eventReceivedPromise;

    expect(receivedEvent.id).toBe('ws_ev_1');
    expect(receivedEvent.eventType).toBe('agent:prompt');
    expect(receivedEvent.agentId).toBe('claude-code');

    ws.close();
  });
});

