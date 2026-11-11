import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { BaseAgentAdapter } from '../agentAdapter.js';
import { EventBus } from '../../../core/eventBus.js';
import { ILogger, defaultLogger } from '../../../utils/logger.js';
import { AgentDefinition, AgentHealthCheckResult } from '../../../models/agent.js';

export class CursorAdapter extends BaseAgentAdapter {
  private currentSessionId: string = `cursor_${Date.now()}`;
  private readonly cursorDir: string;

  public static readonly DEFINITION: AgentDefinition = {
    id: 'cursor-adapter',
    name: 'Cursor Composer Agent',
    vendor: 'Anysphere',
    description: 'Monitors Cursor IDE composer sessions, multi-file edits, and tool executions.',
    version: '1.0.0',
    capabilities: {
      supportsDraftTracking: false,
      supportsPromptInterception: true,
      supportsExecutionTracking: true,
      supportsToolCallInterception: true,
      supportsSessionLifecycle: true,
      reportsExactTokenMetrics: false,
      captureMethod: 'FILE_TRANSCRIPT_WATCH',
    },
  };

  constructor(
    eventBus: EventBus,
    logger: ILogger = defaultLogger,
    customCursorDir?: string
  ) {
    super(CursorAdapter.DEFINITION, eventBus, logger);
    this.cursorDir = customCursorDir || path.join(os.homedir(), '.cursor');
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.emitSession(this.currentSessionId, 'ACTIVE', 'claude-3-5-sonnet', {
      runtime: 'Cursor IDE',
      cursorDir: this.cursorDir,
    });

    this.isInitialized = true;
    this.logger.info(`CursorAdapter initialized. Cursor directory: ${this.cursorDir}`);
  }

  public async checkHealth(): Promise<AgentHealthCheckResult> {
    const isCursorApp = !!(vscode.env && vscode.env.appName && vscode.env.appName.toLowerCase().includes('cursor'));
    const dirExists = fs.existsSync(this.cursorDir);

    let status: 'ACTIVE' | 'DEGRADED' | 'DISCONNECTED' = 'DISCONNECTED';
    let message = 'Cursor IDE environment not detected.';

    if (isCursorApp) {
      status = 'ACTIVE';
      message = 'Running inside Cursor IDE host with active composer support.';
    } else if (dirExists) {
      status = 'DEGRADED';
      message = 'Found Cursor directory on disk (~/.cursor), but running in another editor.';
    }

    return {
      status,
      message,
      timestamp: Date.now(),
      details: {
        isCursorApp,
        cursorDir: this.cursorDir,
        dirExists,
      },
    };
  }

  public override dispose(): void {
    this.emitSession(this.currentSessionId, 'TERMINATED');
    super.dispose();
  }
}

