export type ConfigSource = 'GLOBAL' | 'WORKSPACE' | 'MANUAL' | 'UNKNOWN';

export type McpTransportType = 'stdio' | 'streamableHttp' | 'unsupported';

export interface StdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface StreamableHttpServerConfig {
  serverUrl: string;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
}

export interface RawMcpServerConfig {
  command?: unknown;
  args?: unknown;
  env?: unknown;
  serverUrl?: unknown;
  url?: unknown;
  headers?: unknown;
  timeoutSeconds?: unknown;
  type?: unknown;
  transport?: unknown;
  disabled?: unknown;
  enabled?: unknown;
  [key: string]: unknown;
}

export interface DiscoveredServerEntry {
  id: string;
  name: string;
  source: ConfigSource;
  configFilePath: string;
  transport: McpTransportType;
  rawConfig: RawMcpServerConfig;
  isValid: boolean;
  validationError?: string;
  enabled: boolean;
}

export interface McpConfigFile {
  path: string;
  source: ConfigSource;
  exists: boolean;
  parseError?: string;
  servers: DiscoveredServerEntry[];
  lastModifiedMs: number;
}

