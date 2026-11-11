import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SqliteStorage } from '../../src/storage/sqliteStorage.js';
import { AgentTokenUsageEvent, AgentToolCallEvent } from '../../src/observability/events.js';

describe('SqliteStorage', () => {
  let tmpDbPath: string;
  let storage: SqliteStorage;

  beforeEach(async () => {
    tmpDbPath = path.join(os.tmpdir(), `test_watchtower_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.sqlite`);
    storage = new SqliteStorage(tmpDbPath);
    await storage.initialize();
  });

  afterEach(() => {
    storage.dispose();
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath);
      } catch {
        // Ignored
      }
    }
  });

  it('runs initial migrations and records sessions and events', () => {
    storage.recordSession({
      id: 'sess_ev_1',
      eventType: 'agent:session',
      agentId: 'antigravity-agent',
      agentName: 'Google Antigravity',
      sessionId: 'session_123',
      status: 'ACTIVE',
      startedAt: Date.now(),
      model: 'gemini-2.0-flash',
      timestamp: Date.now(),
    });

    const sessions = storage.getAllSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].sessionId).toBe('session_123');
    expect(sessions[0].agentId).toBe('antigravity-agent');
    expect(sessions[0].model).toBe('gemini-2.0-flash');
  });

  it('records token usage and updates session totals accurately', () => {
    storage.recordSession({
      id: 'sess_ev_2',
      eventType: 'agent:session',
      agentId: 'claude-code-agent',
      agentName: 'Claude Code',
      sessionId: 'session_456',
      status: 'ACTIVE',
      startedAt: Date.now(),
      model: 'claude-3-7-sonnet',
      timestamp: Date.now(),
    });

    const tokenEvent: AgentTokenUsageEvent = {
      id: 'token_ev_1',
      eventType: 'agent:token_usage',
      agentId: 'claude-code-agent',
      agentName: 'Claude Code',
      sessionId: 'session_456',
      model: 'claude-3-7-sonnet',
      source: 'REPORTED_ACTUAL',
      accuracy: 'EXACT',
      promptTokens: 1200,
      completionTokens: 350,
      totalTokens: 1550,
      cachedTokens: 800,
      estimatedCostUsd: 0.006,
      timestamp: Date.now(),
    };

    storage.recordTokenUsage(tokenEvent);

    const summary = storage.getTokenUsageSummary();
    expect(summary.totalActualTokens).toBe(1550);
    expect(summary.totalCostUsd).toBeCloseTo(0.006, 4);
    expect(summary.byModel['claude-3-7-sonnet'].actualTokens).toBe(1550);
  });

  it('records tool calls linked to session', () => {
    const toolEvent: AgentToolCallEvent = {
      id: 'tool_ev_1',
      eventType: 'agent:tool_call',
      agentId: 'generic-agent',
      agentName: 'Generic Agent',
      sessionId: 'session_789',
      toolCallId: 'call_abc_123',
      toolName: 'read_file',
      serverName: 'filesystem',
      status: 'SUCCESS',
      durationMs: 42,
      timestamp: Date.now(),
    };

    storage.recordEvent(toolEvent);

    const events = storage.getRecentEvents(10);
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('agent:tool_call');
  });

  it('persists data to disk and reloads cleanly', async () => {
    storage.recordSession({
      id: 'sess_persist',
      eventType: 'agent:session',
      agentId: 'test-agent',
      agentName: 'Test Agent',
      sessionId: 'session_persist',
      status: 'ACTIVE',
      startedAt: Date.now(),
      timestamp: Date.now(),
    });

    storage.flushToDisk();
    expect(fs.existsSync(tmpDbPath)).toBe(true);

    // Dispose old storage and open new instance on same file
    storage.dispose();

    const storage2 = new SqliteStorage(tmpDbPath);
    await storage2.initialize();
    const sessions = storage2.getAllSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].sessionId).toBe('session_persist');
    storage2.dispose();
  });
});
