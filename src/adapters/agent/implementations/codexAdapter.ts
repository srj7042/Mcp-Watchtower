import * as vscode from 'vscode';
import { BaseAgentAdapter } from '../agentAdapter.js';
import { EventBus } from '../../../core/eventBus.js';
import { ILogger, defaultLogger } from '../../../utils/logger.js';
import { AgentDefinition, AgentHealthCheckResult } from '../../../models/agent.js';

export class CodexAdapter extends BaseAgentAdapter {
  private currentSessionId: string = `codex_${Date.now()}`;

  public static readonly DEFINITION: AgentDefinition = {
    id: 'codex-adapter',
    name: 'OpenAI Codex / GitHub Copilot',
    vendor: 'OpenAI / GitHub',
    description: 'Tracks completion lifecycles, companion capture sessions, and estimated token usage for OpenAI Codex and GitHub Copilot.',
    version: '1.0.0',
    capabilities: {
      supportsDraftTracking: false,
      supportsPromptInterception: false,
      supportsExecutionTracking: true,
      supportsToolCallInterception: false,
      supportsSessionLifecycle: true,
      reportsExactTokenMetrics: false,
      captureMethod: 'COMPANION_PROCESS',
    },
  };

  constructor(eventBus: EventBus, logger: ILogger = defaultLogger) {
    super(CodexAdapter.DEFINITION, eventBus, logger);
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.emitSession(this.currentSessionId, 'ACTIVE', 'gpt-4o', {
      runtime: 'GitHub Copilot / Codex Companion',
    });

    this.isInitialized = true;
    this.logger.info('CodexAdapter initialized.');
  }

  public async checkHealth(): Promise<AgentHealthCheckResult> {
    let copilotInstalled = false;
    try {
      if (vscode.extensions && Array.isArray(vscode.extensions.all)) {
        copilotInstalled = vscode.extensions.all.some(
          (ext) => ext.id.toLowerCase().includes('copilot') || ext.id.toLowerCase().includes('codex')
        );
      }
    } catch {
      // In tests or headless
    }

    return {
      status: copilotInstalled ? 'ACTIVE' : 'DEGRADED',
      message: copilotInstalled
        ? 'GitHub Copilot / Codex extension detected in IDE.'
        : 'GitHub Copilot extension not detected in active extension host.',
      timestamp: Date.now(),
      details: {
        copilotInstalled,
        sessionId: this.currentSessionId,
      },
    };
  }

  public override dispose(): void {
    this.emitSession(this.currentSessionId, 'TERMINATED');
    super.dispose();
  }
}

