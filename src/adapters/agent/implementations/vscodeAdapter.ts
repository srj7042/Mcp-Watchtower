import * as vscode from 'vscode';
import { BaseAgentAdapter } from '../agentAdapter.js';
import { EventBus } from '../../../core/eventBus.js';
import { ILogger, defaultLogger } from '../../../utils/logger.js';
import { AgentDefinition, AgentHealthCheckResult } from '../../../models/agent.js';

export class VsCodeAgentAdapter extends BaseAgentAdapter {
  private currentSessionId: string = `vscode_lm_${Date.now()}`;

  public static readonly DEFINITION: AgentDefinition = {
    id: 'vscode-agent-adapter',
    name: 'VS Code Language Model API',
    vendor: 'Microsoft',
    description: 'Integrates with VS Code standard Language Model API (vscode.lm) and extension host chat runtime.',
    version: '1.0.0',
    capabilities: {
      supportsDraftTracking: true,
      supportsPromptInterception: false,
      supportsExecutionTracking: true,
      supportsToolCallInterception: false,
      supportsSessionLifecycle: true,
      reportsExactTokenMetrics: false,
      captureMethod: 'VSCODE_API',
    },
  };

  constructor(eventBus: EventBus, logger: ILogger = defaultLogger) {
    super(VsCodeAgentAdapter.DEFINITION, eventBus, logger);
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.emitSession(this.currentSessionId, 'ACTIVE', 'gpt-4o', {
      runtime: 'VS Code Language Model API',
      vscodeVersion: vscode.version,
    });

    this.isInitialized = true;
    this.logger.info('VsCodeAgentAdapter initialized.');
  }

  public async checkHealth(): Promise<AgentHealthCheckResult> {
    // Check if vscode.lm is exposed on this VS Code version
    const hasLmApi = typeof (vscode as unknown as { lm?: unknown }).lm !== 'undefined';

    return {
      status: hasLmApi ? 'ACTIVE' : 'DEGRADED',
      message: hasLmApi
        ? 'VS Code Language Model API (vscode.lm) is available.'
        : 'Running on standard VS Code API (vscode.lm not exposed in this environment).',
      timestamp: Date.now(),
      details: {
        hasLmApi,
        vscodeVersion: vscode.version,
      },
    };
  }

  public override dispose(): void {
    this.emitSession(this.currentSessionId, 'TERMINATED');
    super.dispose();
  }
}
