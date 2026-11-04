import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { Application } from '../core/application.js';
import { EventBus } from '../core/eventBus.js';
import { HealthMonitor } from '../monitoring/healthMonitor.js';
import { ServerDiscoveryService } from '../services/serverDiscoveryService.js';
import {
  DashboardViewModel,
  HostToWebviewMessage,
  WebviewToHostMessage,
} from '../ui/messages/types.js';
import { IDisposable } from '../utils/disposable.js';
import { ILogger, defaultLogger } from '../utils/logger.js';

export class DashboardProvider implements IDisposable {
  public static readonly viewType = 'mcpWatchtower.dashboard';
  private panel?: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private eventDisposables: IDisposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly app: Application,
    private readonly eventBus: EventBus,
    private readonly discovery: ServerDiscoveryService,
    private readonly healthMonitor: HealthMonitor,
    private readonly logger: ILogger = defaultLogger
  ) {
    this.setupListeners();
  }

  private setupListeners(): void {
    this.eventDisposables.push(
      this.eventBus.on('health:updated', () => this.postStateUpdate()),
      this.eventBus.on('servers:synced', () => this.postStateUpdate()),
      this.eventBus.on('monitoring:toggled', () => this.postStateUpdate())
    );
  }

  public show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      this.postStateUpdate();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      DashboardProvider.viewType,
      'MCP Watchtower',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'ui')),
        ],
      }
    );

    this.panel.iconPath = {
      light: vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'ui', 'icon.svg')),
      dark: vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'ui', 'icon.svg')),
    };

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToHostMessage) => this.handleMessage(message),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      undefined,
      this.disposables
    );
  }

  private async handleMessage(message: WebviewToHostMessage): Promise<void> {
    this.logger.debug(`Received message from webview: ${message.command}`);
    switch (message.command) {
      case 'ready':
        this.postStateUpdate();
        break;
      case 'refreshAll':
        await this.app.refreshAll();
        break;
      case 'refreshServer':
        await this.app.refreshServer(message.serverId);
        break;
      case 'connectServer':
        await this.app.connectServer(message.serverId);
        break;
      case 'runStdioDiagnostic':
        await this.app.runConsentBasedDiagnostic(message.serverId);
        break;
      case 'copyReport':
        await this.app.copySanitizedReport();
        break;
      case 'toggleMonitoring':
        await this.app.toggleMonitoring();
        break;
      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'mcpWatchtower');
        break;
    }
  }

  public postStateUpdate(): void {
    if (!this.panel) return;

    const viewModel = this.buildViewModel();
    const msg: HostToWebviewMessage = {
      type: 'STATE_UPDATE',
      payload: viewModel,
    };
    this.panel.webview.postMessage(msg);
  }

  public buildViewModel(): DashboardViewModel {
    const servers = this.discovery.getDiscoveredServers();
    const healthMap = this.healthMonitor.getAllHealth();
    const registry = this.healthMonitor.registry;

    let healthy = 0;
    let degraded = 0;
    let disconnected = 0;
    let unknown = 0;

    const serverViewModels = servers.map((s) => {
      const health = healthMap.get(s.id);
      const capabilities = registry.getCapabilities(s.id);
      const history = registry.history.getEventsForServer(s.id, 10);

      if (!health || health.state === 'UNKNOWN') {
        unknown++;
      } else if (health.state === 'CONNECTED') {
        healthy++;
      } else if (health.state === 'DEGRADED') {
        degraded++;
      } else {
        disconnected++;
      }

      return {
        definition: s,
        health,
        capabilities,
        history,
      };
    });

    return {
      servers: serverViewModels,
      summary: {
        total: servers.length,
        healthy,
        degraded,
        disconnected,
        unknown,
      },
      monitoringEnabled: this.healthMonitor.isMonitoringEnabled(),
      lastRefreshed: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const uiDir = path.join(this.context.extensionPath, 'dist', 'ui');
    const htmlPath = path.join(uiDir, 'index.html');

    let template = '';
    try {
      template = fs.readFileSync(htmlPath, 'utf8');
    } catch {
      // Fallback if dist/ui not yet populated
      template = `<!DOCTYPE html><html><body><h3>Dashboard Assets Loading...</h3></body></html>`;
      return template;
    }

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(uiDir, 'dashboard.js'))
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(uiDir, 'dashboard.css'))
    );

    const nonce = crypto.randomBytes(16).toString('base64');

    return template
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{nonce}}/g, nonce)
      .replace(/{{styleUri}}/g, styleUri.toString())
      .replace(/{{scriptUri}}/g, scriptUri.toString());
  }

  public dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    for (const d of this.eventDisposables) {
      d.dispose();
    }
    this.disposables = [];
    this.eventDisposables = [];
  }
}

