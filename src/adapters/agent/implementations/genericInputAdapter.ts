import * as vscode from 'vscode';
import { BaseAgentAdapter } from '../agentAdapter.js';
import { EventBus } from '../../../core/eventBus.js';
import { ILogger, defaultLogger } from '../../../utils/logger.js';
import { AgentDefinition, AgentHealthCheckResult } from '../../../models/agent.js';
import { LocalTokenizer } from '../../../tokenization/tokenizer.js';
import { IDisposable } from '../../../utils/disposable.js';

export class GenericInputAdapter extends BaseAgentAdapter {
  private documentSubscription?: IDisposable;
  private debounceTimer: NodeJS.Timeout | null = null;
  private currentSessionId: string = `draft_${Date.now()}`;
  private targetModel: string = 'gpt-4o';

  public static readonly DEFINITION: AgentDefinition = {
    id: 'generic-input-adapter',
    name: 'Generic Editor Input',
    vendor: 'Universal / Local IDE',
    description: 'Tracks real-time typing in active editor buffers to estimate draft token consumption.',
    version: '1.0.0',
    capabilities: {
      supportsDraftTracking: true,
      supportsPromptInterception: false,
      supportsExecutionTracking: false,
      supportsToolCallInterception: false,
      supportsSessionLifecycle: true,
      reportsExactTokenMetrics: false,
      captureMethod: 'VSCODE_API',
    },
  };

  constructor(eventBus: EventBus, logger: ILogger = defaultLogger) {
    super(GenericInputAdapter.DEFINITION, eventBus, logger);
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.emitSession(this.currentSessionId, 'ACTIVE', this.targetModel, {
      source: 'Active Editor Typing Stream',
    });

    try {
      if (vscode.workspace && typeof vscode.workspace.onDidChangeTextDocument === 'function') {
        const disposable = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
          this.handleTextChange(e);
        });
        this.documentSubscription = {
          dispose: () => disposable.dispose(),
        };
      }
    } catch (err) {
      this.logger.warn('Could not register VS Code onDidChangeTextDocument listener:', err);
    }

    this.isInitialized = true;
    this.logger.info('GenericInputAdapter initialized.');
  }

  public setTargetModel(model: string): void {
    this.targetModel = model;
  }

  private handleTextChange(e: vscode.TextDocumentChangeEvent): void {
    if (this.isDisposed || !e.contentChanges || e.contentChanges.length === 0) return;

    // Filter out common binary / lock / git internal documents
    const docUri = e.document.uri.toString();
    if (docUri.includes('.git/') || docUri.includes('node_modules/') || docUri.endsWith('.lock')) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      try {
        const text = e.document.getText();
        const tokens = LocalTokenizer.estimateDraftTokens(text, this.targetModel);

        this.emitDraft(
          this.currentSessionId,
          text.length,
          tokens,
          this.targetModel,
          undefined // Never send full text preview unless opt-in
        );

        this.emitTokenUsage(
          this.currentSessionId,
          this.targetModel,
          'DRAFT_ESTIMATE',
          'ESTIMATED',
          tokens,
          0,
          tokens
        );
      } catch (err) {
        this.logger.warn('Failed to calculate draft tokens on text change:', err);
      }
    }, 150);
  }

  public async checkHealth(): Promise<AgentHealthCheckResult> {
    const isApiAvailable = !!vscode.workspace && typeof vscode.workspace.onDidChangeTextDocument === 'function';
    return {
      status: isApiAvailable ? 'ACTIVE' : 'DEGRADED',
      message: isApiAvailable
        ? 'Generic editor input adapter is actively listening to document draft changes.'
        : 'VS Code workspace document API not available in current environment.',
      timestamp: Date.now(),
      details: {
        activeSessionId: this.currentSessionId,
        targetModel: this.targetModel,
      },
    };
  }

  public override dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.documentSubscription) {
      this.documentSubscription.dispose();
      this.documentSubscription = undefined;
    }
    this.emitSession(this.currentSessionId, 'TERMINATED');
    super.dispose();
  }
}

