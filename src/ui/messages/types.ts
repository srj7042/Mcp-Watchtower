import { McpServerDefinition } from '../../models/server.js';
import { McpHealthRecord } from '../../models/health.js';
import { McpCapabilities, McpDiagnosticEvent } from '../../models/diagnostics.js';
import { ObservabilityEvent } from '../../observability/events.js';
import { AgentSessionRecord, AgentCapabilities } from '../../models/agent.js';
import { TokenUsageSummary } from '../../storage/sqliteStorage.js';

export type WebviewToHostMessage =
  | { command: 'refreshAll' }
  | { command: 'refreshServer'; serverId: string }
  | { command: 'connectServer'; serverId: string }
  | { command: 'runStdioDiagnostic'; serverId: string }
  | { command: 'copyReport'; serverId?: string }
  | { command: 'toggleMonitoring' }
  | { command: 'openSettings' }
  | { command: 'changeTab'; tab: string }
  | { command: 'setTargetModel'; model: string }
  | { command: 'clearHistory' }
  | { command: 'openFloatingWindow' }
  | { command: 'ready' };

export interface ServerViewModel {
  definition: McpServerDefinition;
  health?: McpHealthRecord;
  capabilities?: McpCapabilities;
  history?: McpDiagnosticEvent[];
}

export interface AdapterViewModel {
  id: string;
  name: string;
  vendor: string;
  status: string;
  capabilities: AgentCapabilities;
  healthMessage?: string;
}

export interface AgentObservabilityViewModel {
  adapters: AdapterViewModel[];
  liveTokens: {
    draftTokens: number;
    requestTokens: number;
    actualTokens: number;
    targetModel: string;
  };
  tokenSummary: TokenUsageSummary;
  sessions: AgentSessionRecord[];
  recentEvents: ObservabilityEvent[];
  privacy: {
    optInPromptCapture: boolean;
    localProcessingOnly: boolean;
  };
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
  activeTab?: string;
  observability?: AgentObservabilityViewModel;
}

export type HostToWebviewMessage =
  | { type: 'STATE_UPDATE'; payload: DashboardViewModel }
  | { type: 'SERVER_CHECK_START'; serverId: string }
  | { type: 'NOTIFICATION'; message: string; level: 'info' | 'warn' | 'error' };


