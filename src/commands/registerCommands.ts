import * as vscode from 'vscode';
import { IDisposable } from '../utils/disposable.js';
import { ILogger, defaultLogger } from '../utils/logger.js';
import type { Application } from '../core/application.js';

export function registerCommands(app: Application, logger: ILogger = defaultLogger): IDisposable {
  const disposables: vscode.Disposable[] = [];

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.openDashboard', async () => {
      logger.info('Executing command: mcpWatchtower.openDashboard');
      await app.openDashboard();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.openFloatingWindow', async () => {
      logger.info('Executing command: mcpWatchtower.openFloatingWindow');
      await app.openFloatingWindow();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.refreshAll', async () => {
      logger.info('Executing command: mcpWatchtower.refreshAll');
      await app.refreshAll();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.refreshServer', async (serverId?: string) => {
      logger.info(`Executing command: mcpWatchtower.refreshServer (${serverId || 'prompt'})`);
      if (serverId) {
        await app.refreshServer(serverId);
      } else {
        const servers = app.getServers();
        if (servers.length === 0) {
          vscode.window.showInformationMessage('MCP Watchtower: No servers discovered to refresh.');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          servers.map((s) => ({ label: s.name, description: s.transport, detail: s.id, server: s })),
          { placeHolder: 'Select an MCP server to refresh' }
        );
        if (pick) {
          await app.refreshServer(pick.server.id);
        }
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.connectServer', async (arg?: string | { server?: { id: string } }) => {
      const serverId = typeof arg === 'string' ? arg : arg?.server?.id;
      logger.info(`Executing command: mcpWatchtower.connectServer (${serverId || 'prompt'})`);
      await app.connectServer(serverId);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.inspectServer', async (serverId?: string) => {
      logger.info(`Executing command: mcpWatchtower.inspectServer (${serverId || 'prompt'})`);
      await app.inspectServer(serverId);
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.validateConfiguration', async () => {
      logger.info('Executing command: mcpWatchtower.validateConfiguration');
      await app.validateConfiguration();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.showDiagnostics', () => {
      logger.info('Executing command: mcpWatchtower.showDiagnostics');
      app.showDiagnostics();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.copySanitizedReport', async () => {
      logger.info('Executing command: mcpWatchtower.copySanitizedReport');
      await app.copySanitizedReport();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.toggleMonitoring', async () => {
      logger.info('Executing command: mcpWatchtower.toggleMonitoring');
      await app.toggleMonitoring();
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.openSettings', () => {
      logger.info('Executing command: mcpWatchtower.openSettings');
      vscode.commands.executeCommand('workbench.action.openSettings', 'mcpWatchtower');
    })
  );

  disposables.push(
    vscode.commands.registerCommand('mcpWatchtower.runConsentBasedDiagnostic', async (serverId?: string) => {
      logger.info(`Executing command: mcpWatchtower.runConsentBasedDiagnostic (${serverId || 'prompt'})`);
      await app.runConsentBasedDiagnostic(serverId);
    })
  );

  return {
    dispose: () => {
      for (const d of disposables) {
        d.dispose();
      }
    },
  };
}

