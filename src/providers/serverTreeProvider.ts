import * as vscode from 'vscode';
import { EventBus } from '../core/eventBus.js';
import { ServerDiscoveryService } from '../services/serverDiscoveryService.js';
import { HealthMonitor } from '../monitoring/healthMonitor.js';
import { McpServerDefinition } from '../models/server.js';
import { McpHealthRecord, HealthState } from '../models/health.js';
import { IDisposable } from '../utils/disposable.js';

export class ServerTreeItem extends vscode.TreeItem {
  constructor(
    public readonly server: McpServerDefinition,
    public readonly health?: McpHealthRecord
  ) {
    super(server.name, vscode.TreeItemCollapsibleState.None);

    const state: HealthState = health?.state || 'UNKNOWN';
    this.description = `${server.transport} • ${state}${health?.latencyMs !== undefined && health.latencyMs > 0 ? ` (${health.latencyMs}ms)` : ''}`;
    this.tooltip = `Server: ${server.name}\nTransport: ${server.transport}\nSource: ${server.source}\nStatus: ${state}\nReason: ${health?.reason || 'Pending verification'}\nRuntime State: ${health?.ideRuntimeStatus || 'NOT_EXPOSED'}`;

    this.iconPath = this.getIconForState(state);

    this.command = {
      command: 'mcpWatchtower.inspectServer',
      title: 'Inspect Server',
      arguments: [server.id],
    };
  }

  private getIconForState(state: HealthState): vscode.ThemeIcon {
    switch (state) {
      case 'CONNECTED':
        return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
      case 'DEGRADED':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconQueued'));
      case 'DISCONNECTED':
      case 'CONFIG_ERROR':
      case 'TIMEOUT':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
      case 'AUTH_REQUIRED':
        return new vscode.ThemeIcon('key', new vscode.ThemeColor('testing.iconQueued'));
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }
}

export class ServerTreeProvider implements vscode.TreeDataProvider<ServerTreeItem>, IDisposable {
  private _onDidChangeTreeData: vscode.EventEmitter<ServerTreeItem | undefined | void> =
    new vscode.EventEmitter<ServerTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<ServerTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private disposables: IDisposable[] = [];

  constructor(
    private readonly discovery: ServerDiscoveryService,
    private readonly healthMonitor: HealthMonitor,
    private readonly eventBus: EventBus
  ) {
    this.disposables.push(
      this.eventBus.on('health:updated', () => this.refresh()),
      this.eventBus.on('servers:synced', () => this.refresh())
    );
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ServerTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(): Thenable<ServerTreeItem[]> {
    const servers = this.discovery.getDiscoveredServers();
    const items = servers.map((s) => {
      const health = this.healthMonitor.getHealth(s.id);
      return new ServerTreeItem(s, health);
    });
    return Promise.resolve(items);
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this._onDidChangeTreeData.dispose();
  }
}

