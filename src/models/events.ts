import { McpServerDefinition } from './server.js';
import { McpHealthRecord } from './health.js';
import { McpDiagnosticEvent } from './diagnostics.js';

export interface WatchtowerEvents {
  'server:discovered': McpServerDefinition;
  'server:updated': McpServerDefinition;
  'server:removed': string;
  'servers:synced': McpServerDefinition[];
  'health:updated': McpHealthRecord;
  'diagnostic:event': McpDiagnosticEvent;
  'monitoring:toggled': boolean;
  'config:reloaded': void;
}

