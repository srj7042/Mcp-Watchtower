import { BaseAgentAdapter } from '../../src/adapters/agent/agentAdapter.js';
import { EventBus } from '../../src/core/eventBus.js';
import { AgentDefinition, AgentHealthCheckResult } from '../../src/models/agent.js';

export class MockAgentAdapter extends BaseAgentAdapter {
  public static readonly DEFINITION: AgentDefinition = {
    id: 'mock-test-adapter',
    name: 'Mock Test Agent',
    vendor: 'Testing Harness',
    description: 'Mock agent adapter exclusively used for automated testing of contract verifier and event pipeline.',
    version: '1.0.0',
    capabilities: {
      supportsDraftTracking: true,
      supportsPromptInterception: true,
      supportsExecutionTracking: true,
      supportsToolCallInterception: true,
      supportsSessionLifecycle: true,
      reportsExactTokenMetrics: true,
      captureMethod: 'MANUAL',
    },
  };

  constructor(eventBus: EventBus) {
    super(MockAgentAdapter.DEFINITION, eventBus);
  }

  public async initialize(): Promise<void> {
    this.isInitialized = true;
    this.emitSession('mock_session_1', 'ACTIVE', 'gpt-4o');
  }

  public async checkHealth(): Promise<AgentHealthCheckResult> {
    return {
      status: 'ACTIVE',
      message: 'Mock test adapter operational',
      timestamp: Date.now(),
    };
  }

  public simulateDraft(text: string, tokens: number): void {
    this.emitDraft('mock_session_1', text.length, tokens, 'gpt-4o');
  }

  public simulatePrompt(promptId: string, text: string, tokens: number): void {
    this.emitPrompt('mock_session_1', promptId, text.length, tokens, 'gpt-4o');
  }

  public simulateExecution(execId: string, status: 'COMPLETED' | 'FAILED'): void {
    this.emitExecution('mock_session_1', execId, status, 'gpt-4o', 120);
  }

  public simulateToolCall(toolCallId: string, toolName: string): void {
    this.emitToolCall('mock_session_1', toolCallId, toolName, 'SUCCESS', { durationMs: 45 });
  }

  public simulateTokenUsage(promptTokens: number, completionTokens: number): void {
    this.emitTokenUsage(
      'mock_session_1',
      'gpt-4o',
      'REPORTED_ACTUAL',
      'EXACT',
      promptTokens,
      completionTokens,
      promptTokens + completionTokens
    );
  }
}

