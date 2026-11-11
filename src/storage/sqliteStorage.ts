import * as fs from 'fs';
import * as path from 'path';
// Use the self-contained inline WebAssembly build of sql.js
// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs = require('sql.js/dist/sql-wasm-inline.js');
import { ILogger, defaultLogger } from '../utils/logger.js';
import { IDisposable } from '../utils/disposable.js';
import {
  ObservabilityEvent,
  AgentTokenUsageEvent,
  AgentToolCallEvent,
  AgentExecutionEvent,
  AgentSessionEvent,
} from '../observability/events.js';
import { AgentSessionRecord } from '../models/agent.js';

export interface TokenUsageSummary {
  totalDraftTokens: number;
  totalRequestTokens: number;
  totalActualTokens: number;
  totalCostUsd: number;
  byModel: Record<string, { actualTokens: number; costUsd: number }>;
}

export class SqliteStorage implements IDisposable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null;
  private isInitialized = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private isDirty = false;

  constructor(
    private readonly dbFilePath?: string,
    private readonly logger: ILogger = defaultLogger
  ) {}

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const SQL = await initSqlJs();

      if (this.dbFilePath && fs.existsSync(this.dbFilePath)) {
        try {
          const fileBuffer = fs.readFileSync(this.dbFilePath);
          this.db = new SQL.Database(fileBuffer);
          this.logger.info(`Loaded existing SQLite database from ${this.dbFilePath}`);
        } catch (readErr) {
          this.logger.warn(`Could not read existing SQLite file, creating new database:`, readErr);
          this.db = new SQL.Database();
        }
      } else {
        this.db = new SQL.Database();
      }

      this.runMigrations();
      this.isInitialized = true;
      this.logger.info('SQLite observability storage initialized successfully.');
    } catch (err) {
      this.logger.error('Failed to initialize SQLite storage:', err);
      throw err;
    }
  }

  private runMigrations(): void {
    if (!this.db) return;

    // 1. Migrations tracking table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const result = this.db.exec('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set<number>();
    if (result.length > 0 && result[0].values) {
      for (const row of result[0].values) {
        appliedVersions.add(row[0] as number);
      }
    }

    // Migration 1: Initial Observability Schema
    if (!appliedVersions.has(1)) {
      this.logger.info('Applying SQLite migration 1: Initial Schema...');
      this.db.run(`
        CREATE TABLE IF NOT EXISTS agent_sessions (
          session_id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          agent_name TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          model TEXT,
          total_draft_tokens INTEGER DEFAULT 0,
          total_request_tokens INTEGER DEFAULT 0,
          total_actual_prompt_tokens INTEGER DEFAULT 0,
          total_actual_completion_tokens INTEGER DEFAULT 0,
          total_actual_tokens INTEGER DEFAULT 0,
          total_estimated_cost_usd REAL DEFAULT 0.0,
          execution_count INTEGER DEFAULT 0,
          tool_call_count INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS observability_events (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS token_usage (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          model TEXT NOT NULL,
          source TEXT NOT NULL,
          accuracy TEXT NOT NULL,
          prompt_tokens INTEGER NOT NULL,
          completion_tokens INTEGER NOT NULL,
          total_tokens INTEGER NOT NULL,
          cached_tokens INTEGER DEFAULT 0,
          estimated_cost_usd REAL DEFAULT 0.0,
          timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS execution_records (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          status TEXT NOT NULL,
          model TEXT,
          duration_ms INTEGER,
          error TEXT,
          timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tool_calls (
          id TEXT PRIMARY KEY,
          execution_id TEXT,
          session_id TEXT NOT NULL,
          agent_id TEXT NOT NULL,
          tool_name TEXT NOT NULL,
          server_name TEXT,
          status TEXT NOT NULL,
          duration_ms INTEGER,
          arguments_sanitized TEXT,
          error TEXT,
          timestamp INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_events_session ON observability_events(session_id);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON observability_events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);
        CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
        CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);

        INSERT INTO schema_migrations (version, applied_at) VALUES (1, ${Date.now()});
      `);
      this.markDirty();
    }
  }

  public recordEvent(event: ObservabilityEvent): void {
    if (!this.db) return;

    try {
      const payloadJson = JSON.stringify(event);
      this.db.run(
        `INSERT OR REPLACE INTO observability_events (id, event_type, agent_id, session_id, timestamp, payload)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [event.id, event.eventType, event.agentId, event.sessionId, event.timestamp, payloadJson]
      );

      // Route event to specific child tables
      switch (event.eventType) {
        case 'agent:session':
          this.recordSession(event);
          break;
        case 'agent:token_usage':
          this.recordTokenUsage(event);
          break;
        case 'agent:tool_call':
          this.recordToolCall(event);
          break;
        case 'agent:execution':
          this.recordExecution(event);
          break;
        case 'agent:draft':
          this.updateSessionTokens(event.sessionId, event.draftTokens, 0, 0, 0, 0, 0);
          break;
        case 'agent:prompt':
          this.updateSessionTokens(event.sessionId, 0, event.estimatedPromptTokens, 0, 0, 0, 0);
          break;
        case 'agent:error':
          this.incrementSessionErrors(event.sessionId);
          break;
      }

      this.markDirty();
    } catch (err) {
      this.logger.error('Failed to record observability event in SQLite:', err);
    }
  }

  public recordSession(event: AgentSessionEvent): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT INTO agent_sessions (
          session_id, agent_id, agent_name, status, started_at, ended_at, model, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          status = excluded.status,
          ended_at = COALESCE(excluded.ended_at, agent_sessions.ended_at),
          model = COALESCE(excluded.model, agent_sessions.model),
          metadata = COALESCE(excluded.metadata, agent_sessions.metadata)`,
        [
          event.sessionId,
          event.agentId,
          event.agentName,
          event.status,
          event.startedAt,
          event.endedAt ?? null,
          event.model ?? null,
          event.metadata ? JSON.stringify(event.metadata) : null,
        ]
      );
      this.markDirty();
    } catch (err) {
      this.logger.error('Failed to record session in SQLite:', err);
    }
  }

  public recordTokenUsage(event: AgentTokenUsageEvent): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT OR REPLACE INTO token_usage (
          id, session_id, agent_id, model, source, accuracy,
          prompt_tokens, completion_tokens, total_tokens, cached_tokens, estimated_cost_usd, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.sessionId,
          event.agentId,
          event.model,
          event.source,
          event.accuracy,
          event.promptTokens,
          event.completionTokens,
          event.totalTokens,
          event.cachedTokens ?? 0,
          event.estimatedCostUsd ?? 0.0,
          event.timestamp,
        ]
      );

      // If this is reported actual usage, aggregate it into session totals
      if (event.source === 'REPORTED_ACTUAL') {
        this.updateSessionTokens(
          event.sessionId,
          0,
          0,
          event.promptTokens,
          event.completionTokens,
          event.totalTokens,
          event.estimatedCostUsd ?? 0.0
        );
      }
      this.markDirty();
    } catch (err) {
      this.logger.error('Failed to record token usage in SQLite:', err);
    }
  }

  public recordToolCall(event: AgentToolCallEvent): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT OR REPLACE INTO tool_calls (
          id, execution_id, session_id, agent_id, tool_name, server_name,
          status, duration_ms, arguments_sanitized, error, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.toolCallId,
          event.executionId ?? null,
          event.sessionId,
          event.agentId,
          event.toolName,
          event.serverName ?? null,
          event.status,
          event.durationMs ?? null,
          event.argumentsSanitized ? JSON.stringify(event.argumentsSanitized) : null,
          event.error ?? null,
          event.timestamp,
        ]
      );

      // Update session tool call count from distinct tool call records
      this.db.run(
        `UPDATE agent_sessions SET tool_call_count = (SELECT COUNT(DISTINCT id) FROM tool_calls WHERE session_id = ?) WHERE session_id = ?`,
        [event.sessionId, event.sessionId]
      );
      this.markDirty();
    } catch (err) {
      this.logger.error('Failed to record tool call in SQLite:', err);
    }
  }

  public recordExecution(event: AgentExecutionEvent): void {
    if (!this.db) return;
    try {
      this.db.run(
        `INSERT OR REPLACE INTO execution_records (
          id, session_id, agent_id, status, model, duration_ms, error, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.executionId,
          event.sessionId,
          event.agentId,
          event.status,
          event.model,
          event.durationMs ?? null,
          event.error ?? null,
          event.timestamp,
        ]
      );

      this.db.run(
        `UPDATE agent_sessions SET execution_count = (SELECT COUNT(DISTINCT id) FROM execution_records WHERE session_id = ?) WHERE session_id = ?`,
        [event.sessionId, event.sessionId]
      );
      this.markDirty();
    } catch (err) {
      this.logger.error('Failed to record execution in SQLite:', err);
    }
  }

  private updateSessionTokens(
    sessionId: string,
    draftDelta: number,
    requestDelta: number,
    actualPromptDelta: number,
    actualCompDelta: number,
    actualTotalDelta: number,
    costDelta: number
  ): void {
    if (!this.db) return;
    try {
      this.db.run(
        `UPDATE agent_sessions SET
          total_draft_tokens = total_draft_tokens + ?,
          total_request_tokens = total_request_tokens + ?,
          total_actual_prompt_tokens = total_actual_prompt_tokens + ?,
          total_actual_completion_tokens = total_actual_completion_tokens + ?,
          total_actual_tokens = total_actual_tokens + ?,
          total_estimated_cost_usd = total_estimated_cost_usd + ?
        WHERE session_id = ?`,
        [draftDelta, requestDelta, actualPromptDelta, actualCompDelta, actualTotalDelta, costDelta, sessionId]
      );
    } catch {
      // Session might not be inserted yet
    }
  }

  private incrementSessionErrors(sessionId: string): void {
    if (!this.db) return;
    try {
      this.db.run(
        `UPDATE agent_sessions SET error_count = error_count + 1 WHERE session_id = ?`,
        [sessionId]
      );
    } catch {
      // Ignored
    }
  }

  public getRecentEvents(limit: number = 50): ObservabilityEvent[] {
    if (!this.db) return [];
    try {
      const res = this.db.exec(
        `SELECT payload FROM observability_events ORDER BY timestamp DESC LIMIT ${Math.max(1, limit)}`
      );
      if (res.length === 0 || !res[0].values) return [];
      return res[0].values.map((v: unknown[]) => JSON.parse(v[0] as string));
    } catch (err) {
      this.logger.error('Failed to query recent events from SQLite:', err);
      return [];
    }
  }

  public getAllSessions(limit: number = 50): AgentSessionRecord[] {
    if (!this.db) return [];
    try {
      const res = this.db.exec(
        `SELECT session_id, agent_id, agent_name, status, started_at, ended_at, model,
                total_draft_tokens, total_request_tokens, total_actual_prompt_tokens,
                total_actual_completion_tokens, total_actual_tokens, total_estimated_cost_usd,
                execution_count, tool_call_count, error_count
         FROM agent_sessions
         ORDER BY started_at DESC
         LIMIT ${Math.max(1, limit)}`
      );
      if (res.length === 0 || !res[0].values) return [];

      return res[0].values.map((row: unknown[]) => ({
        sessionId: row[0] as string,
        agentId: row[1] as string,
        agentName: row[2] as string,
        status: (row[3] as 'ACTIVE' | 'IDLE' | 'TERMINATED') || 'IDLE',
        startedAt: row[4] as number,
        endedAt: row[5] ? (row[5] as number) : undefined,
        model: (row[6] as string) || 'unknown',
        totalDraftTokens: row[7] as number,
        totalRequestTokens: row[8] as number,
        totalActualPromptTokens: row[9] as number,
        totalActualCompletionTokens: row[10] as number,
        totalActualTokens: row[11] as number,
        totalEstimatedCostUsd: row[12] as number,
        executionCount: row[13] as number,
        toolCallCount: row[14] as number,
        errorCount: row[15] as number,
      }));
    } catch (err) {
      this.logger.error('Failed to query sessions from SQLite:', err);
      return [];
    }
  }

  public getTokenUsageSummary(): TokenUsageSummary {
    const summary: TokenUsageSummary = {
      totalDraftTokens: 0,
      totalRequestTokens: 0,
      totalActualTokens: 0,
      totalCostUsd: 0,
      byModel: {},
    };

    if (!this.db) return summary;

    try {
      // Query totals from sessions
      const totalsRes = this.db.exec(`
        SELECT SUM(total_draft_tokens), SUM(total_request_tokens),
               SUM(total_actual_tokens), SUM(total_estimated_cost_usd)
        FROM agent_sessions
      `);

      if (totalsRes.length > 0 && totalsRes[0].values && totalsRes[0].values[0]) {
        const row = totalsRes[0].values[0];
        summary.totalDraftTokens = (row[0] as number) || 0;
        summary.totalRequestTokens = (row[1] as number) || 0;
        summary.totalActualTokens = (row[2] as number) || 0;
        summary.totalCostUsd = (row[3] as number) || 0.0;
      }

      // Query by model from token_usage table
      const modelRes = this.db.exec(`
        SELECT model, SUM(total_tokens), SUM(estimated_cost_usd)
        FROM token_usage
        WHERE source = 'REPORTED_ACTUAL'
        GROUP BY model
      `);

      if (modelRes.length > 0 && modelRes[0].values) {
        for (const row of modelRes[0].values) {
          const model = row[0] as string;
          summary.byModel[model] = {
            actualTokens: (row[1] as number) || 0,
            costUsd: (row[2] as number) || 0.0,
          };
        }
      }
    } catch (err) {
      this.logger.error('Failed to get token usage summary from SQLite:', err);
    }

    return summary;
  }

  private markDirty(): void {
    this.isDirty = true;
    if (!this.flushTimer && this.dbFilePath) {
      this.flushTimer = setTimeout(() => {
        this.flushToDisk();
      }, 500);
    }
  }

  public flushToDisk(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (!this.isDirty || !this.db || !this.dbFilePath) return;

    try {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = this.db.export();
      fs.writeFileSync(this.dbFilePath, Buffer.from(data));
      this.isDirty = false;
    } catch (err) {
      this.logger.error(`Failed to flush SQLite database to ${this.dbFilePath}:`, err);
    }
  }

  public dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushToDisk();
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignored
      }
      this.db = null;
    }
    this.isInitialized = false;
  }
}
