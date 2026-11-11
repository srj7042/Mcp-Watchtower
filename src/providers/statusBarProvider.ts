import * as vscode from 'vscode';
import { IDisposable } from '../utils/disposable.js';
import { EventBus } from '../core/eventBus.js';
import { McpServerDefinition } from '../models/server.js';
import { McpHealthRecord } from '../models/health.js';
import { ObservabilityEvent } from '../observability/events.js';

export class StatusBarProvider implements IDisposable {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: IDisposable[] = [];
  private servers: Map<string, McpServerDefinition> = new Map();
  private healthRecords: Map<string, McpHealthRecord> = new Map();
  private activeModel: string = 'gemini-3.8-flash';
  private draftTokens: number = 0;
  private actualTokens: number = 0;

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

    this.disposables.push(
      this.eventBus.on('observability:event', (event: ObservabilityEvent) => {
        if (event.eventType === 'agent:draft') {
          this.draftTokens = event.draftTokens;
          if (event.model) this.activeModel = event.model;
          this.update();
        } else if (event.eventType === 'agent:token_usage') {
          this.actualTokens += event.totalTokens;
          if (event.model) this.activeModel = event.model;
          this.update();
        } else if (event.eventType === 'agent:prompt') {
          if (event.model) this.activeModel = event.model;
          this.update();
        }
      })
    );
  }

  public update(): void {
    const total = this.servers.size;
    const modelShort = this.activeModel.includes('3.8') ? 'Gemini 3.8 Flash' : this.activeModel.includes('gemini') ? 'Gemini Flash' : this.activeModel;
    const tokensShort = this.draftTokens > 0 ? `${this.draftTokens} draft` : `${this.actualTokens} tok`;

    if (total === 0) {
      this.statusBarItem.text = `$(zap) ${modelShort}: ${tokensShort} | $(pulse) MCP: None`;
      this.statusBarItem.tooltip = `MCP Watchtower: Live Agent Observability\nModel: ${this.activeModel}\nTokens: ${tokensShort}\nNo MCP servers configured.\nClick to open dashboard.`;
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

    this.statusBarItem.text = `$(zap) ${modelShort}: ${tokensShort} | $(pulse) MCP: ${healthyCount}/${total}`;

    let tooltip = `MCP Watchtower Live Observability\n`;
    tooltip += `Target Model: ${this.activeModel}\n`;
    tooltip += `Live Draft Tokens: ${this.draftTokens.toLocaleString()}\n`;
    tooltip += `Verified Actual Tokens: ${this.actualTokens.toLocaleString()}\n`;
    tooltip += `------------------------------------\n`;
    tooltip += `MCP Server Fleet: ${healthyCount}/${total} Healthy\n`;
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

