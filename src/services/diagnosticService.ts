import { ServerRegistry } from '../monitoring/serverRegistry.js';
import { McpServerDefinition } from '../models/server.js';
import { McpHealthRecord } from '../models/health.js';
import { McpCapabilities, McpDiagnosticEvent } from '../models/diagnostics.js';

export interface ServerFullDiagnosticReport {
  server: McpServerDefinition;
  health?: McpHealthRecord;
  capabilities?: McpCapabilities;
  history: McpDiagnosticEvent[];
}

export interface WatchtowerGlobalSummary {
  totalConfigured: number;
  healthyCount: number;
  degradedCount: number;
  errorCount: number;
  unknownCount: number;
  lastUpdated: string;
}

export class DiagnosticService {
  constructor(private readonly registry: ServerRegistry) {}

  public getSummary(): WatchtowerGlobalSummary {
    const servers = this.registry.getAllServers();
    const healthMap = this.registry.getAllHealth();

    let healthyCount = 0;
    let degradedCount = 0;
    let errorCount = 0;
    let unknownCount = 0;

    for (const server of servers) {
      const health = healthMap.get(server.id);
      if (!health || health.state === 'UNKNOWN') {
        unknownCount++;
      } else if (health.state === 'CONNECTED') {
        healthyCount++;
      } else if (health.state === 'DEGRADED') {
        degradedCount++;
      } else {
        errorCount++;
      }
    }

    return {
      totalConfigured: servers.length,
      healthyCount,
      degradedCount,
      errorCount,
      unknownCount,
      lastUpdated: new Date().toISOString(),
    };
  }

  public getServerReport(serverId: string): ServerFullDiagnosticReport | undefined {
    const server = this.registry.getServer(serverId);
    if (!server) {
      return undefined;
    }

    return {
      server,
      health: this.registry.getHealth(serverId),
      capabilities: this.registry.getCapabilities(serverId),
      history: this.registry.history.getEventsForServer(serverId, 25),
    };
  }

  public exportSanitizedReport(): string {
    const summary = this.getSummary();
    const servers = this.registry.getAllServers();

    const report = {
      title: 'MCP Watchtower Diagnostic Report',
      generatedAt: new Date().toISOString(),
      summary,
      servers: servers.map((s) => this.getServerReport(s.id)),
    };

    return JSON.stringify(report, null, 2);
  }
}

