import {
  HealthState,
  McpHealthRecord,
  EvidenceSource,
  ConfidenceLevel,
  ErrorCategory,
  IdeRuntimeStatus,
} from '../models/health.js';
import { McpServerDefinition } from '../models/server.js';

export interface StateEvaluationInput {
  server: McpServerDefinition;
  networkReachable?: boolean | null;
  protocolHealthy?: boolean | null;
  ideRuntimeStatus?: IdeRuntimeStatus;
  latencyMs?: number;
  evidenceSource: EvidenceSource;
  confidence?: ConfidenceLevel;
  errorCategory?: ErrorCategory;
  customReason?: string;
  previousRecord?: McpHealthRecord;
}

export class HealthStateMachine {
  public static evaluate(input: StateEvaluationInput): McpHealthRecord {
    const {
      server,
      networkReachable = null,
      protocolHealthy = null,
      ideRuntimeStatus = 'NOT_EXPOSED',
      latencyMs = 0,
      evidenceSource,
      confidence = 'CONFIRMED',
      errorCategory = 'NONE',
      customReason,
      previousRecord,
    } = input;

    const now = new Date().toISOString();

    // 1. Config error check
    if (!server.configurationValid) {
      return {
        serverId: server.id,
        configured: false,
        networkReachable: false,
        protocolHealthy: false,
        ideRuntimeStatus,
        state: 'CONFIG_ERROR',
        reason: customReason || server.validationError || 'Invalid server configuration',
        evidenceSource: 'CONFIG_PARSE',
        confidence: 'CONFIRMED',
        latencyMs: 0,
        checkedAt: now,
        errorCategory: 'CONFIG_SYNTAX',
      };
    }

    // 2. Disabled server
    if (!server.enabled) {
      return {
        serverId: server.id,
        configured: true,
        networkReachable: null,
        protocolHealthy: null,
        ideRuntimeStatus,
        state: 'UNKNOWN',
        reason: 'Server is explicitly disabled in configuration',
        evidenceSource: 'CONFIG_PARSE',
        confidence: 'CONFIRMED',
        latencyMs: 0,
        checkedAt: now,
        errorCategory: 'NONE',
      };
    }

    // 3. Unsupported transport
    if (server.transport === 'unsupported') {
      return {
        serverId: server.id,
        configured: true,
        networkReachable: null,
        protocolHealthy: null,
        ideRuntimeStatus,
        state: 'UNSUPPORTED',
        reason: 'Transport mechanism is not supported by MCP Watchtower',
        evidenceSource,
        confidence: 'CONFIRMED',
        latencyMs: 0,
        checkedAt: now,
        errorCategory: 'NONE',
      };
    }

    // 4. Categorized errors
    if (errorCategory === 'AUTH') {
      return {
        serverId: server.id,
        configured: true,
        networkReachable: true,
        protocolHealthy: false,
        ideRuntimeStatus,
        state: 'AUTH_REQUIRED',
        reason: customReason || 'Authentication challenge received (HTTP 401/403 or handshake authorization failure)',
        evidenceSource,
        confidence,
        latencyMs,
        checkedAt: now,
        errorCategory,
      };
    }

    if (errorCategory === 'TIMEOUT') {
      return {
        serverId: server.id,
        configured: true,
        networkReachable: networkReachable,
        protocolHealthy: false,
        ideRuntimeStatus,
        state: 'TIMEOUT',
        reason: customReason || `Diagnostic request timed out after ${latencyMs}ms`,
        evidenceSource,
        confidence,
        latencyMs,
        checkedAt: now,
        errorCategory,
      };
    }

    if (
      errorCategory === 'DNS' ||
      errorCategory === 'NETWORK_REFUSED' ||
      errorCategory === 'NOT_FOUND' ||
      errorCategory === 'PROCESS_SPAWN'
    ) {
      return {
        serverId: server.id,
        configured: true,
        networkReachable: false,
        protocolHealthy: false,
        ideRuntimeStatus,
        state: 'DISCONNECTED',
        reason: customReason || `Connection failed: ${errorCategory}`,
        evidenceSource,
        confidence,
        latencyMs,
        checkedAt: now,
        errorCategory,
      };
    }

    // 5. Protocol healthy
    if (protocolHealthy === true) {
      // Degraded check: latency > 5000ms
      const isDegraded = latencyMs > 5000;
      const state: HealthState = isDegraded ? 'DEGRADED' : 'CONNECTED';
      const reason = isDegraded
        ? `MCP handshake succeeded with elevated latency (${latencyMs}ms)`
        : customReason || `MCP protocol verified via handshake (${latencyMs}ms)`;

      return {
        serverId: server.id,
        configured: true,
        networkReachable: true,
        protocolHealthy: true,
        ideRuntimeStatus,
        state,
        reason,
        evidenceSource,
        confidence,
        latencyMs,
        checkedAt: now,
        lastSuccessfulCheck: now,
        errorCategory: 'NONE',
      };
    }

    // 6. Stdio static verification (safe mode, no process execution)
    if (evidenceSource === 'PATH_VERIFICATION') {
      return {
        serverId: server.id,
        configured: true,
        networkReachable: null,
        protocolHealthy: null,
        ideRuntimeStatus,
        state: 'UNKNOWN',
        reason: customReason || 'Executable verified on PATH; isolated diagnostic not run (requires user consent)',
        evidenceSource,
        confidence: 'CONFIRMED',
        latencyMs,
        checkedAt: now,
        lastSuccessfulCheck: previousRecord?.lastSuccessfulCheck,
        errorCategory: 'NONE',
      };
    }

    // 7. Fallback unknown
    return {
      serverId: server.id,
      configured: true,
      networkReachable,
      protocolHealthy,
      ideRuntimeStatus,
      state: 'UNKNOWN',
      reason: customReason || 'Server status pending initial verification',
      evidenceSource,
      confidence: 'UNVERIFIED',
      latencyMs,
      checkedAt: now,
      lastSuccessfulCheck: previousRecord?.lastSuccessfulCheck,
      errorCategory,
    };
  }
}

