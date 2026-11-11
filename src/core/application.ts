import * as vscode from 'vscode';
import { EventBus } from './eventBus.js';
import { LifecycleManager } from './lifecycle.js';
import { ILogger, defaultLogger } from '../utils/logger.js';
import { StatusBarProvider } from '../providers/statusBarProvider.js';
import { McpServerDefinition } from '../models/server.js';
import { McpHealthRecord } from '../models/health.js';
import { IDisposable } from '../utils/disposable.js';

export interface IApplicationServices {
  discoveryService?: {
    discoverAll(): Promise<McpServerDefinition[]>;
    getDiscoveredServers(): McpServerDefinition[];
    validateAllConfigurations(): Promise<Array<{ path: string; valid: boolean; errors?: string[] }>>;
  };
  healthMonitor?: {
    checkAll(): Promise<void>;
    checkServer(serverId: string): Promise<McpHealthRecord | undefined>;
    runConsentDiagnostic(serverId: string): Promise<McpHealthRecord | undefined>;
    getHealth(serverId: string): McpHealthRecord | undefined;
    getAllHealth(): Map<string, McpHealthRecord>;
    isMonitoringEnabled(): boolean;
    toggleMonitoring(): boolean;
  };
  dashboardProvider?: {
    show(): void;
  };
  wsServer?: {
    getPort(): number;
    getAuthToken(): string;
    setMcpSummary?(total: number, healthy: number): void;
  };
}

export class Application implements IDisposable {
  public readonly eventBus: EventBus;
  public readonly lifecycle: LifecycleManager;
  private statusBarProvider?: StatusBarProvider;
  private services: IApplicationServices = {};

  constructor(
    private readonly context: vscode.ExtensionContext,
    public readonly logger: ILogger = defaultLogger
  ) {
    this.eventBus = new EventBus();
    this.lifecycle = new LifecycleManager(logger);
    this.lifecycle.register(this.eventBus);
  }

  public setServices(services: IApplicationServices): void {
    this.services = { ...this.services, ...services };
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing MCP Watchtower Application...');

    // Status bar provider
    this.statusBarProvider = new StatusBarProvider(this.eventBus);
    this.lifecycle.register(this.statusBarProvider);

    this.logger.info('MCP Watchtower Application initialized successfully.');
  }

  public async openDashboard(): Promise<void> {
    if (this.services.dashboardProvider) {
      this.services.dashboardProvider.show();
    } else {
      vscode.window.showInformationMessage('MCP Watchtower Dashboard is initializing...');
    }
  }

  public async openFloatingWindow(): Promise<void> {
    const port = this.services.wsServer?.getPort() || 19840;
    const token = this.services.wsServer?.getAuthToken() || '';
    const url = `http://127.0.0.1:${port}/floating?token=${token}`;
    try {
      await vscode.env.openExternal(vscode.Uri.parse(url));
      vscode.window.showInformationMessage(
        'MCP Watchtower: Floating Desktop HUD opened. Click "📌 Float On Top" to pin it always-on-top above all apps!'
      );
    } catch (err) {
      this.logger.error('Failed to open floating desktop window:', err);
      vscode.window.showErrorMessage(`Could not launch floating window: ${err}`);
    }
  }

  public async refreshAll(): Promise<void> {
    this.logger.info('Refreshing all MCP servers...');
    if (this.services.discoveryService) {
      await this.services.discoveryService.discoverAll();
    }
    if (this.services.healthMonitor) {
      await this.services.healthMonitor.checkAll();
    }
    this.statusBarProvider?.update();
  }

  public async connectServer(serverId?: string): Promise<void> {
    const servers = this.getServers();
    if (servers.length === 0) {
      vscode.window.showInformationMessage('No configured MCP servers found to connect.');
      return;
    }

    let target = servers.find((s) => s.id === serverId);
    if (!target) {
      const pick = await vscode.window.showQuickPick(
        servers.map((s) => ({
          label: s.name,
          description: s.transport,
          detail: `Source: ${s.source} (${s.configurationPath})`,
          server: s,
        })),
        { placeHolder: 'Select an MCP server to connect / verify' }
      );
      if (!pick) {
        return;
      }
      target = pick.server;
    }

    this.logger.info(`Connecting to MCP server: ${target.name} (${target.transport})`);

    if (target.transport === 'streamableHttp') {
      if (this.services.healthMonitor) {
        const record = await this.services.healthMonitor.checkServer(target.id);
        if (record && record.state === 'CONNECTED') {
          vscode.window.showInformationMessage(
            `MCP Watchtower: Connected to "${target.name}" (${record.latencyMs}ms). MCP handshake verified.`
          );
        } else {
          vscode.window.showWarningMessage(
            `MCP Watchtower: Could not connect to "${target.name}": ${record?.reason || 'Unknown error'}`
          );
        }
      }
    } else if (target.transport === 'stdio') {
      await this.runConsentBasedDiagnostic(target.id);
    } else {
      vscode.window.showWarningMessage(`Cannot connect to "${target.name}": Transport "${target.transport}" is unsupported.`);
    }

    this.statusBarProvider?.update();
  }

  public async refreshServer(serverId: string): Promise<void> {
    this.logger.info(`Refreshing server: ${serverId}`);
    if (this.services.healthMonitor) {
      await this.services.healthMonitor.checkServer(serverId);
    }
    this.statusBarProvider?.update();
  }

  public async inspectServer(serverId?: string): Promise<void> {
    const servers = this.getServers();
    if (servers.length === 0) {
      vscode.window.showInformationMessage('No configured MCP servers found to inspect.');
      return;
    }

    let target = servers.find((s) => s.id === serverId);
    if (!target) {
      const pick = await vscode.window.showQuickPick(
        servers.map((s) => ({
          label: s.name,
          description: s.transport,
          detail: `Source: ${s.source} (${s.configurationPath})`,
          server: s,
        })),
        { placeHolder: 'Select a server to inspect' }
      );
      if (!pick) {
        return;
      }
      target = pick.server;
    }

    const health = this.services.healthMonitor?.getHealth(target.id);
    const details = [
      `Server: ${target.name}`,
      `Transport: ${target.transport}`,
      `Source: ${target.source}`,
      `Config Valid: ${target.configurationValid ? 'YES' : 'NO'}`,
      `State: ${health?.state ?? 'UNKNOWN'}`,
      `Reason: ${health?.reason ?? 'Not yet checked'}`,
      `Evidence Source: ${health?.evidenceSource ?? 'N/A'}`,
      `Latency: ${health?.latencyMs ?? 0}ms`,
      `IDE Runtime Status: ${health?.ideRuntimeStatus ?? 'NOT_EXPOSED'}`,
    ].join('\n');

    vscode.window.showInformationMessage(details, { modal: true });
  }

  public async validateConfiguration(): Promise<void> {
    if (this.services.discoveryService) {
      const results = await this.services.discoveryService.validateAllConfigurations();
      const hasErrors = results.some((r) => !r.valid);
      if (hasErrors) {
        const errorDetails = results
          .filter((r) => !r.valid)
          .map((r) => `${r.path}: ${(r.errors || []).join(', ')}`)
          .join('\n');
        vscode.window.showErrorMessage(`Configuration issues found:\n${errorDetails}`);
      } else {
        vscode.window.showInformationMessage('All discovered MCP configuration files are valid.');
      }
    }
  }

  public showDiagnostics(): void {
    this.logger.show();
  }

  public async copySanitizedReport(): Promise<void> {
    const servers = this.getServers();
    const allHealth = this.services.healthMonitor?.getAllHealth() ?? new Map();

    const report = {
      timestamp: new Date().toISOString(),
      extensionVersion: '1.0.0',
      totalServers: servers.length,
      servers: servers.map((s) => {
        const h = allHealth.get(s.id);
        return {
          id: s.id,
          name: s.name,
          transport: s.transport,
          source: s.source,
          configValid: s.configurationValid,
          state: h?.state ?? 'UNKNOWN',
          reason: h?.reason ?? 'Not checked',
          evidenceSource: h?.evidenceSource ?? 'N/A',
          latencyMs: h?.latencyMs ?? 0,
          ideRuntimeStatus: h?.ideRuntimeStatus ?? 'NOT_EXPOSED',
          checkedAt: h?.checkedAt,
        };
      }),
    };

    const json = JSON.stringify(report, null, 2);
    await vscode.env.clipboard.writeText(json);
    vscode.window.showInformationMessage('Sanitized MCP Watchtower diagnostic report copied to clipboard.');
  }

  public async toggleMonitoring(): Promise<void> {
    if (this.services.healthMonitor) {
      const active = this.services.healthMonitor.toggleMonitoring();
      this.eventBus.emit('monitoring:toggled', active);
      vscode.window.showInformationMessage(`MCP Watchtower monitoring is now ${active ? 'ACTIVE' : 'PAUSED'}.`);
    }
  }

  public async runConsentBasedDiagnostic(serverId?: string): Promise<void> {
    const servers = this.getServers().filter((s) => s.transport === 'stdio');
    if (servers.length === 0) {
      vscode.window.showInformationMessage('No stdio MCP servers available for diagnostic execution.');
      return;
    }

    let target = servers.find((s) => s.id === serverId);
    if (!target) {
      const pick = await vscode.window.showQuickPick(
        servers.map((s) => ({
          label: s.name,
          description: s.configurationPath,
          server: s,
        })),
        { placeHolder: 'Select a stdio server to run diagnostic check' }
      );
      if (!pick) {
        return;
      }
      target = pick.server;
    }

    const consent = await vscode.window.showWarningMessage(
      `MCP Watchtower will launch an isolated, short-lived diagnostic child process for "${target.name}". This will complete the MCP handshake and terminate immediately.\n\nDo you want to proceed?`,
      { modal: true },
      'Run Diagnostic',
      'Cancel'
    );

    if (consent === 'Run Diagnostic' && this.services.healthMonitor) {
      await this.services.healthMonitor.runConsentDiagnostic(target.id);
    }
  }

  public getContext(): vscode.ExtensionContext {
    return this.context;
  }

  public getServers(): McpServerDefinition[] {
    return this.services.discoveryService?.getDiscoveredServers() ?? [];
  }

  public dispose(): void {
    this.lifecycle.dispose();
  }
}
