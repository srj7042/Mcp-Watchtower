import { ConfigSource, McpTransportType } from './config.js';

export interface McpServerDefinition {
  id: string;
  name: string;
  transport: McpTransportType;
  source: ConfigSource;
  configurationPath: string;
  configurationValid: boolean;
  validationError?: string;
  enabled: boolean;
  sanitizedMetadata: Record<string, unknown>;
  discoveredAt: string;
  updatedAt: string;
}

