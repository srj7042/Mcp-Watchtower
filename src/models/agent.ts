/**
 * Agent Domain Models & Capability Declarations
 */

export type AgentAdapterStatus =
  | 'ACTIVE'
  | 'DEGRADED'
  | 'DISCONNECTED'
  | 'UNSUPPORTED';

export interface AgentCapabilities {
  /** Can intercept or estimate typing in draft/input box */
  readonly supportsDraftTracking: boolean;
  /** Can detect when prompts are sent to model */
  readonly supportsPromptInterception: boolean;
  /** Can track execution lifecycles and durations */
  readonly supportsExecutionTracking: boolean;
  /** Can track individual tool calls made by the agent */
  readonly supportsToolCallInterception: boolean;
  /** Can track session open/close lifecycles */
  readonly supportsSessionLifecycle: boolean;
  /** Reports exact provider token metrics (if false, tokens are estimated) */
  readonly reportsExactTokenMetrics: boolean;
  /** Integration method */
  readonly captureMethod: 'VSCODE_API' | 'FILE_TRANSCRIPT_WATCH' | 'HOOK_SOCKET' | 'COMPANION_PROCESS' | 'MANUAL';
}

export interface AgentDefinition {
  readonly id: string;
  readonly name: string;
  readonly vendor: string;
  readonly description: string;
  readonly version: string;
  readonly capabilities: AgentCapabilities;
}

export interface AgentSessionRecord {
  sessionId: string;
  agentId: string;
  agentName: string;
  status: 'ACTIVE' | 'IDLE' | 'TERMINATED';
  startedAt: number;
  endedAt?: number;
  model: string;
  totalDraftTokens: number;
  totalRequestTokens: number;
  totalActualPromptTokens: number;
  totalActualCompletionTokens: number;
  totalActualTokens: number;
  totalEstimatedCostUsd: number;
  executionCount: number;
  toolCallCount: number;
  errorCount: number;
}

export interface AgentHealthCheckResult {
  readonly status: AgentAdapterStatus;
  readonly message: string;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;
}

