import * as vscode from 'vscode';
import { IDisposable } from '../utils/disposable.js';
import { EventBus } from '../core/eventBus.js';
import { McpServerDefinition } from '../models/server.js';
import { McpHealthRecord } from '../models/health.js';

export class StatusBarProvider implements IDisposable {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: IDisposable[] = [];
  private servers: Map<string, McpServerDefinition> = new Map();
  private healthRecords: Map<string, McpHealthRecord> = new Map();

  constructor(private readonly eventBus: EventBus) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'mcpWatchtower.openDashboard';
    this.setupListeners();
    this.update();
    this.statusBarItem.show();
  }

  private setupListeners(): void {
    this.disposables.push(
      this.eventBus.on('servers:synced', (servers) => {
        this.servers.clear();
        for (const s of servers) {
          this.servers.set(s.id, s);
        }
        this.update();
      })
    );

    this.disposables.push(
      this.eventBus.on('server:discovered', (s) => {
        this.servers.set(s.id, s);
        this.update();
      })
    );

    this.disposables.push(
      this.eventBus.on('server:removed', (id) => {
        this.servers.delete(id);
        this.healthRecords.delete(id);
        this.update();
      })
    );

    this.disposables.push(
      this.eventBus.on('health:updated', (record) => {
        this.healthRecords.set(record.serverId, record);
        this.update();
      })
    );
  }

  public update(): void {
    const total = this.servers.size;
    if (total === 0) {
      this.statusBarItem.text = '$(pulse) MCP: None';
      this.statusBarItem.tooltip = 'MCP Watchtower: No MCP servers discovered.\nClick to open dashboard.';
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    let healthyCount = 0;
    let degradedCount = 0;
    let errorCount = 0;
    let unknownCount = 0;

    for (const [id] of this.servers) {
      const h = this.healthRecords.get(id);
      if (!h || h.state === 'UNKNOWN') {
        unknownCount++;
      } else if (h.state === 'CONNECTED') {
        healthyCount++;
      } else if (h.state === 'DEGRADED') {
        degradedCount++;
      } else {
        errorCount++;
      }
    }

    this.statusBarItem.text = `$(pulse) MCP: ${healthyCount}/${total} Healthy`;

    let tooltip = `MCP Watchtower Monitor\n`;
    tooltip += `Total Configured: ${total}\n`;
    tooltip += `Healthy (Protocol Verified): ${healthyCount}\n`;
    if (degradedCount > 0) {
      tooltip += `Degraded: ${degradedCount}\n`;
    }
    if (errorCount > 0) {
      tooltip += `Issues / Errors: ${errorCount}\n`;
    }
    if (unknownCount > 0) {
      tooltip += `Pending Check: ${unknownCount}\n`;
    }
    tooltip += `\nClick to open MCP Watchtower Dashboard`;
    this.statusBarItem.tooltip = tooltip;

    if (errorCount > 0) {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (degradedCount > 0) {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.statusBarItem.dispose();
  }
}

