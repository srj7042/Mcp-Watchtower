import * as vscode from 'vscode';
import { EventBus } from '../core/eventBus.js';
import { McpDiagnosticEvent } from '../models/diagnostics.js';
import { ServerRegistry } from '../monitoring/serverRegistry.js';
import { IDisposable } from '../utils/disposable.js';
import { ILogger, defaultLogger } from '../utils/logger.js';

export class NotificationService implements IDisposable {
  private disposables: IDisposable[] = [];

  constructor(
    private readonly eventBus: EventBus,
    private readonly registry: ServerRegistry,
    private readonly logger: ILogger = defaultLogger
  ) {
    this.setupListeners();
  }

  private setupListeners(): void {
    this.disposables.push(
      this.eventBus.on('diagnostic:event', (event: McpDiagnosticEvent) => {
        this.handleEvent(event);
      })
    );
  }

  private handleEvent(event: McpDiagnosticEvent): void {
    if (event.eventType !== 'HEALTH_CHANGE') {
      return;
    }

    const server = this.registry.getServer(event.serverId);
    const serverName = server?.name || event.serverId;

    // Disconnected / Failed notification
    if (
      (event.newState === 'DISCONNECTED' || event.newState === 'CONFIG_ERROR') &&
      event.previousState === 'CONNECTED'
    ) {
      vscode.window.showWarningMessage(
        `MCP Watchtower: Server "${serverName}" disconnected or encountered errors. (${event.sanitizedMessage})`,
        'Open Dashboard'
      ).then((selection) => {
        if (selection === 'Open Dashboard') {
          vscode.commands.executeCommand('mcpWatchtower.openDashboard');
        }
      });
      this.logger.warn(`Server ${serverName} transitioned from CONNECTED to ${event.newState}`);
    }

    // Recovered notification
    if (
      event.newState === 'CONNECTED' &&
      (event.previousState === 'DISCONNECTED' || event.previousState === 'CONFIG_ERROR' || event.previousState === 'TIMEOUT')
    ) {
      vscode.window.showInformationMessage(
        `MCP Watchtower: Server "${serverName}" has recovered and is now healthy.`
      );
      this.logger.info(`Server ${serverName} recovered to CONNECTED`);
    }
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

