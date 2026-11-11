/**
 * Universal Event Schema for AI Agent Observability.
 * Covers draft changes, prompt submissions, executions, tool calls, token usage, errors and session lifecycle.
 */

export type AgentEventType =
  | 'agent:session'
  | 'agent:draft'
  | 'agent:prompt'
  | 'agent:execution'
  | 'agent:tool_call'
  | 'agent:token_usage'
  | 'agent:error';

export type TokenMeasurementSource =
  | 'DRAFT_ESTIMATE'
  | 'REQUEST_ESTIMATE'
  | 'REPORTED_ACTUAL';

export type TokenAccuracy =
  | 'EXACT'
  | 'ESTIMATED'
  | 'UNKNOWN';

export type SessionLifecycleStatus =
  | 'ACTIVE'
  | 'IDLE'
  | 'TERMINATED';

export type ExecutionStatus =
  | 'STARTED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ToolCallStatus =
  | 'INVOKED'
  | 'SUCCESS'
  | 'FAILED';

export interface BaseObservabilityEvent {
  id: string;
  eventType: AgentEventType;
  agentId: string;
  agentName: string;
  sessionId: string;
  timestamp: number;
}

export interface AgentSessionEvent extends BaseObservabilityEvent {
  eventType: 'agent:session';
  status: SessionLifecycleStatus;
  startedAt: number;
  endedAt?: number;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentDraftEvent extends BaseObservabilityEvent {
  eventType: 'agent:draft';
  draftTextLength: number;
  draftTextPreview?: string; // Opt-in only
  draftTokens: number;
  model: string;
  cursorPosition?: number;
}

export interface AgentPromptEvent extends BaseObservabilityEvent {
  eventType: 'agent:prompt';
  promptId: string;
  promptTextLength: number;
  promptTextPreview?: string; // Opt-in only, otherwise redacted
  estimatedPromptTokens: number;
  model: string;
}

export interface AgentExecutionEvent extends BaseObservabilityEvent {
  eventType: 'agent:execution';
  executionId: string;
  status: ExecutionStatus;
  model: string;
  durationMs?: number;
  error?: string;
}

export interface AgentToolCallEvent extends BaseObservabilityEvent {
  eventType: 'agent:tool_call';
  executionId?: string;
  toolCallId: string;
  toolName: string;
  serverName?: string;
  argumentsSanitized?: Record<string, unknown>;
  status: ToolCallStatus;
  durationMs?: number;
  error?: string;
}

export interface AgentTokenUsageEvent extends BaseObservabilityEvent {
  eventType: 'agent:token_usage';
  executionId?: string;
  model: string;
  source: TokenMeasurementSource;
  accuracy: TokenAccuracy;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  estimatedCostUsd?: number;
}

export interface AgentErrorEvent extends BaseObservabilityEvent {
  eventType: 'agent:error';
  executionId?: string;
  code: string;
  message: string;
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  stack?: string;
}

export type ObservabilityEvent =
  | AgentSessionEvent
  | AgentDraftEvent
  | AgentPromptEvent
  | AgentExecutionEvent
  | AgentToolCallEvent
  | AgentTokenUsageEvent
  | AgentErrorEvent;

