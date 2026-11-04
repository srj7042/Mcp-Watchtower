import { HealthState } from './health.js';

export type DiagnosticEventType =
  | 'DISCOVERY'
  | 'HEALTH_CHANGE'
  | 'CHECK_START'
  | 'CHECK_COMPLETE'
  | 'ERROR'
  | 'CONFIG_UPDATE'
  | 'CONSENT_REQUEST';

export interface McpDiagnosticEvent {
  id: string;
  serverId: string;
  eventType: DiagnosticEventType;
  previousState?: HealthState;
  newState?: HealthState;
  sanitizedMessage: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface McpCapabilities {
  protocolVersion?: string;
  serverInfo?: {
    name: string;
    version?: string;
  };
  toolsCount?: number;
  resourcesCount?: number;
  promptsCount?: number;
  tools?: Array<{ name: string; description?: string }>;
  resources?: Array<{ uri: string; name: string; description?: string }>;
  prompts?: Array<{ name: string; description?: string }>;
  rawCapabilities?: Record<string, unknown>;
}

