import { McpServerDefinition } from '../models/server.js';
import { McpHealthRecord } from '../models/health.js';
import { McpCapabilities, McpDiagnosticEvent } from '../models/diagnostics.js';
import { ConnectionHistory } from './connectionHistory.js';

export class ServerRegistry {
  private servers: Map<string, McpServerDefinition> = new Map();
  private healthRecords: Map<string, McpHealthRecord> = new Map();
  private capabilities: Map<string, McpCapabilities> = new Map();
  private activeChecks: Set<string> = new Set();
  public readonly history: ConnectionHistory;

  constructor(maxHistoryEvents: number = 500) {
    this.history = new ConnectionHistory(maxHistoryEvents);
  }

  public setServers(servers: McpServerDefinition[]): void {
    const currentIds = new Set(servers.map((s) => s.id));
    // Cleanup removed servers
    for (const id of this.servers.keys()) {
      if (!currentIds.has(id)) {
        this.servers.delete(id);
        this.healthRecords.delete(id);
        this.capabilities.delete(id);
        this.activeChecks.delete(id);
      }
    }

    for (const server of servers) {
      this.servers.set(server.id, server);
    }
  }

  public getServer(id: string): McpServerDefinition | undefined {
    return this.servers.get(id);
  }

  public getAllServers(): McpServerDefinition[] {
    return Array.from(this.servers.values());
  }

  public getHealth(serverId: string): McpHealthRecord | undefined {
    return this.healthRecords.get(serverId);
  }

  public getAllHealth(): Map<string, McpHealthRecord> {
    return new Map(this.healthRecords);
  }

  public setHealth(record: McpHealthRecord): void {
    this.healthRecords.set(record.serverId, record);
  }

  public getCapabilities(serverId: string): McpCapabilities | undefined {
    return this.capabilities.get(serverId);
  }

  public setCapabilities(serverId: string, capabilities: McpCapabilities): void {
    this.capabilities.set(serverId, capabilities);
  }

  public isChecking(serverId: string): boolean {
    return this.activeChecks.has(serverId);
  }

  public markCheckingStart(serverId: string): boolean {
    if (this.activeChecks.has(serverId)) {
      return false; // already in-flight
    }
    this.activeChecks.add(serverId);
    return true;
  }

  public markCheckingEnd(serverId: string): void {
    this.activeChecks.delete(serverId);
  }

  public recordEvent(event: McpDiagnosticEvent): void {
    this.history.record(event);
  }
}

