export type HealthState =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'DEGRADED'
  | 'DISCONNECTED'
  | 'AUTH_REQUIRED'
  | 'CONFIG_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN'
  | 'UNSUPPORTED';

export type EvidenceSource =
  | 'SDK_INITIALIZE'
  | 'PATH_VERIFICATION'
  | 'HTTP_STATUS'
  | 'IDE_RUNTIME_PROBE'
  | 'CONFIG_PARSE'
  | 'STDIO_DIAGNOSTIC';

export type ConfidenceLevel = 'CONFIRMED' | 'TENTATIVE' | 'UNVERIFIED';

export type ErrorCategory =
  | 'NONE'
  | 'DNS'
  | 'TLS'
  | 'TIMEOUT'
  | 'AUTH'
  | 'NOT_FOUND'
  | 'PROCESS_SPAWN'
  | 'PROTOCOL_ERROR'
  | 'CONFIG_SYNTAX'
  | 'NETWORK_REFUSED'
  | 'SECURITY_VIOLATION'
  | 'UNKNOWN';

export type IdeRuntimeStatus =
  | 'CONNECTED_TO_IDE'
  | 'NOT_EXPOSED'
  | 'UNKNOWN'
  | 'UNSUPPORTED';

export interface McpHealthRecord {
  serverId: string;
  configured: boolean;
  networkReachable: boolean | null;
  protocolHealthy: boolean | null;
  ideRuntimeStatus: IdeRuntimeStatus;
  state: HealthState;
  reason: string;
  evidenceSource: EvidenceSource;
  confidence: ConfidenceLevel;
  latencyMs: number;
  checkedAt: string;
  lastSuccessfulCheck?: string;
  errorCategory: ErrorCategory;
}

