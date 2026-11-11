import { IDisposable } from '../../utils/disposable.js';
import { ILogger, defaultLogger } from '../../utils/logger.js';
import { EventBus } from '../../core/eventBus.js';
import {
  AgentDefinition,
  AgentHealthCheckResult,
} from '../../models/agent.js';
import {
  ObservabilityEvent,
  AgentDraftEvent,
  AgentPromptEvent,
  AgentExecutionEvent,
  AgentToolCallEvent,
  AgentTokenUsageEvent,
  AgentErrorEvent,
  AgentSessionEvent,
} from '../../observability/events.js';

export interface IAgentAdapter extends IDisposable {
  readonly definition: AgentDefinition;
  initialize(): Promise<void>;
  checkHealth(): Promise<AgentHealthCheckResult>;
  onEvent(callback: (event: ObservabilityEvent) => void): IDisposable;
}

export abstract class BaseAgentAdapter implements IAgentAdapter {
  protected isInitialized = false;
  protected isDisposed = false;
  private readonly listeners = new Set<(event: ObservabilityEvent) => void>();

  constructor(
    public readonly definition: AgentDefinition,
    protected readonly eventBus: EventBus,
    protected readonly logger: ILogger = defaultLogger
  ) {}

  public abstract initialize(): Promise<void>;
  public abstract checkHealth(): Promise<AgentHealthCheckResult>;

  public onEvent(callback: (event: ObservabilityEvent) => void): IDisposable {
    this.listeners.add(callback);
    return {
      dispose: () => {
        this.listeners.delete(callback);
      },
    };
  }

  protected emitEvent(event: ObservabilityEvent): void {
    if (this.isDisposed) return;

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.logger.error(`Error in adapter event listener for ${this.definition.name}:`, err);
      }
    }

    // Also dispatch to central event bus
    this.eventBus.emit('observability:event', event);
  }

  protected emitSession(
    sessionId: string,
    status: 'ACTIVE' | 'IDLE' | 'TERMINATED',
    model?: string,
    metadata?: Record<string, unknown>
  ): void {
    const event: AgentSessionEvent = {
      id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType: 'agent:session',
      agentId: this.definition.id,
      agentName: this.definition.name,
      sessionId,
      status,
      startedAt: Date.now(),
      model,
      metadata,
      timestamp: Date.now(),
    };
    this.emitEvent(event);
  }

  protected emitDraft(
    sessionId: string,
    draftTextLength: number,
    draftTokens: number,
    model: string,
    draftTextPreview?: string,
    cursorPosition?: number
  ): void {
    const event: AgentDraftEvent = {
      id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType: 'agent:draft',
      agentId: this.definition.id,
      agentName: this.definition.name,
      sessionId,
      draftTextLength,
      draftTokens,
      model,
      draftTextPreview,
      cursorPosition,
      timestamp: Date.now(),
    };
    this.emitEvent(event);
  }

  protected emitPrompt(
    sessionId: string,
    promptId: string,
    promptTextLength: number,
    estimatedPromptTokens: number,
    model: string,
    promptTextPreview?: string
  ): void {
    const event: AgentPromptEvent = {
      id: `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType: 'agent:prompt',
      agentId: this.definition.id,
      agentName: this.definition.name,
      sessionId,
      promptId,
      promptTextLength,
      estimatedPromptTokens,
      model,
      promptTextPreview,
      timestamp: Date.now(),
    };
    this.emitEvent(event);
  }

  protected emitExecution(
    sessionId: string,
    executionId: string,
    status: 'STARTED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
    model: string,
    durationMs?: number,
    error?: string
  ): void {
    const event: AgentExecutionEvent = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType: 'agent:execution',
      agentId: this.definition.id,
      agentName: this.definition.name,
      sessionId,
      executionId,
      status,
      model,
      durationMs,
      error,
      timestamp: Date.now(),
    };
    this.emitEvent(event);
  }

  protected emitToolCall(
    sessionId: string,
    toolCallId: string,
    toolName: string,
    status: 'INVOKED' | 'SUCCESS' | 'FAILED',
    options?: {
      executionId?: string;
      serverName?: string;
      argumentsSanitized?: Record<string, unknown>;
      durationMs?: number;
      error?: string;
    }
  ): void {
    const event: AgentToolCallEvent = {
      id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType: 'agent:tool_call',
      agentId: this.definition.id,
      agentName: this.definition.name,
      sessionId,
      toolCallId,
      toolName,
      status,
      executionId: options?.executionId,
      serverName: options?.serverName,
      argumentsSanitized: options?.argumentsSanitized,
      durationMs: options?.durationMs,
      error: options?.error,
      timestamp: Date.now(),
    };
    this.emitEvent(event);
  }

  protected emitTokenUsage(
    sessionId: string,
    model: string,
    source: 'DRAFT_ESTIMATE' | 'REQUEST_ESTIMATE' | 'REPORTED_ACTUAL',
    accuracy: 'EXACT' | 'ESTIMATED' | 'UNKNOWN',
    promptTokens: number,
    completionTokens: number,
    totalTokens: number,
    options?: {
      executionId?: string;
      cachedTokens?: number;
      estimatedCostUsd?: number;
    }
  ): void {
    const event: AgentTokenUsageEvent = {
      id: `token_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType: 'agent:token_usage',
      agentId: this.definition.id,
      agentName: this.definition.name,
      sessionId,
      executionId: options?.executionId,
      model,
      source,
      accuracy,
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens: options?.cachedTokens,
      estimatedCostUsd: options?.estimatedCostUsd,
      timestamp: Date.now(),
    };
    this.emitEvent(event);
  }

  protected emitError(
    sessionId: string,
    code: string,
    message: string,
    severity: 'WARNING' | 'ERROR' | 'CRITICAL' = 'ERROR',
    stack?: string
  ): void {
    const event: AgentErrorEvent = {
      id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType: 'agent:error',
      agentId: this.definition.id,
      agentName: this.definition.name,
      sessionId,
      code,
      message,
      severity,
      stack,
      timestamp: Date.now(),
    };
    this.emitEvent(event);
  }

  public dispose(): void {
    this.isDisposed = true;
    this.listeners.clear();
  }
}

