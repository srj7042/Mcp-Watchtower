import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventBus } from '../../src/core/eventBus.js';
import { SqliteStorage } from '../../src/storage/sqliteStorage.js';
import { WatchtowerWebSocketServer } from '../../src/server/websocketServer.js';
import { AgentManagerService } from '../../src/services/agentManagerService.js';
import { PricingEngine } from '../../src/tokenization/pricingEngine.js';
import { MockAgentAdapter } from '../mocks/mockAgentAdapter.js';

describe('Agent Observability Pipeline (End-to-End)', () => {
  let tmpDbPath: string;
  let eventBus: EventBus;
  let storage: SqliteStorage;
  let wsServer: WatchtowerWebSocketServer;
  let pricing: PricingEngine;
  let agentManager: AgentManagerService;
  let mockAdapter: MockAgentAdapter;

  beforeEach(async () => {
    tmpDbPath = path.join(os.tmpdir(), `test_pipeline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.sqlite`);
    eventBus = new EventBus();
    storage = new SqliteStorage(tmpDbPath);
    await storage.initialize();

    wsServer = new WatchtowerWebSocketServer(eventBus, { authToken: 'test_token' });
    await wsServer.start(0);

    pricing = new PricingEngine();
    agentManager = new AgentManagerService(eventBus, storage, wsServer, pricing);
    mockAdapter = new MockAgentAdapter(eventBus);
    agentManager.registerAdapter(mockAdapter);
    await mockAdapter.initialize();
  });

  afterEach(() => {
    mockAdapter.dispose();
    agentManager.dispose();
    wsServer.dispose();
    storage.dispose();
    eventBus.dispose();
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath);
      } catch {
        // Ignored
      }
    }
  });

  it('accurately captures typing draft, prompt submission, execution and tool calls', async () => {
    // 1. Simulate in-flight user typing draft
    mockAdapter.simulateDraft('const answer = 42;', 8);

    // 2. Simulate prompt submission
    mockAdapter.simulatePrompt('p_100', 'What is the answer to life?', 12);

    // 3. Simulate execution lifecycle
    mockAdapter.simulateExecution('exec_100', 'COMPLETED');

    // 4. Simulate tool call
    mockAdapter.simulateToolCall('tc_100', 'deep_thought_compute');

    // 5. Simulate exact provider token report (12 prompt tokens, 50 completion tokens)
    mockAdapter.simulateTokenUsage(12, 50);

    // Query storage state
    const summary = storage.getTokenUsageSummary();
    expect(summary.totalDraftTokens).toBe(8);
    expect(summary.totalRequestTokens).toBe(12);
    expect(summary.totalActualTokens).toBe(62); // 12 + 50
    expect(summary.totalCostUsd).toBeGreaterThan(0);

    // Verify recent events in chronological order
    const events = storage.getRecentEvents(10);
    expect(events.length).toBeGreaterThanOrEqual(5);

    const eventTypes = events.map((e) => e.eventType);
    expect(eventTypes).toContain('agent:draft');
    expect(eventTypes).toContain('agent:prompt');
    expect(eventTypes).toContain('agent:execution');
    expect(eventTypes).toContain('agent:tool_call');
    expect(eventTypes).toContain('agent:token_usage');

    // Verify session record
    const sessions = storage.getAllSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].sessionId).toBe('mock_session_1');
    expect(sessions[0].executionCount).toBe(1);
    expect(sessions[0].toolCallCount).toBe(1);
    expect(sessions[0].totalActualTokens).toBe(62);
  });

  it('preserves unknown usage as unknown without fabricating fake tokens', () => {
    // Adapter reports UNKNOWN accuracy
    eventBus.emit('observability:event', {
      id: 'token_unknown_1',
      eventType: 'agent:token_usage',
      agentId: 'mock-test-adapter',
      agentName: 'Mock Test Agent',
      sessionId: 'session_unknown',
      model: 'unknown-vendor-model',
      source: 'REPORTED_ACTUAL',
      accuracy: 'UNKNOWN',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      timestamp: Date.now(),
    });

    const recentEvents = storage.getRecentEvents(5);
    const tokenEvent = recentEvents.find((e) => e.id === 'token_unknown_1') as any;
    expect(tokenEvent).toBeDefined();
    expect(tokenEvent.accuracy).toBe('UNKNOWN');
    expect(tokenEvent.totalTokens).toBe(0);
  });
});

