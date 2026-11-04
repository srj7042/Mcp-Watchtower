import { McpServerDefinition } from '../../models/server.js';
import { McpHealthRecord } from '../../models/health.js';
import { McpCapabilities, McpDiagnosticEvent } from '../../models/diagnostics.js';

export type WebviewToHostMessage =
  | { command: 'refreshAll' }
  | { command: 'refreshServer'; serverId: string }
  | { command: 'connectServer'; serverId: string }
  | { command: 'runStdioDiagnostic'; serverId: string }
  | { command: 'copyReport'; serverId?: string }
  | { command: 'toggleMonitoring' }
  | { command: 'openSettings' }
  | { command: 'ready' };

export interface ServerViewModel {
  definition: McpServerDefinition;
  health?: McpHealthRecord;
  capabilities?: McpCapabilities;
  history?: McpDiagnosticEvent[];
}

export interface DashboardViewModel {
  servers: ServerViewModel[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    disconnected: number;
    unknown: number;
  };
  monitoringEnabled: boolean;
  lastRefreshed: string;
  version: string;
}

export type HostToWebviewMessage =
  | { type: 'STATE_UPDATE'; payload: DashboardViewModel }
  | { type: 'SERVER_CHECK_START'; serverId: string }
  | { type: 'NOTIFICATION'; message: string; level: 'info' | 'warn' | 'error' };

