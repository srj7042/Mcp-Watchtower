import { RawMcpServerConfig, McpTransportType } from '../models/config.js';
import { SecretRedactor } from './secretRedactor.js';

export interface SanitizedServerMetadata {
  transport: McpTransportType;
  command?: string;
  args?: string[];
  sanitizedEnvKeys?: string[];
  serverUrl?: string;
  hasHeaders?: boolean;
  headerKeys?: string[];
  timeoutSeconds?: number;
}

export class ConfigSanitizer {
  public static sanitize(
    transport: McpTransportType,
    rawConfig: RawMcpServerConfig
  ): SanitizedServerMetadata {
    const metadata: SanitizedServerMetadata = { transport };

    if (transport === 'stdio') {
      if (typeof rawConfig.command === 'string') {
        metadata.command = rawConfig.command;
      }
      if (Array.isArray(rawConfig.args)) {
        metadata.args = rawConfig.args.map((arg) => SecretRedactor.redactString(String(arg)));
      }
      if (rawConfig.env && typeof rawConfig.env === 'object') {
        metadata.sanitizedEnvKeys = Object.keys(rawConfig.env as Record<string, unknown>);
      }
    } else if (transport === 'streamableHttp') {
      const urlCandidate = rawConfig.serverUrl || rawConfig.url;
      if (typeof urlCandidate === 'string') {
        // Redact any query param secrets from the URL
        try {
          const parsed = new URL(urlCandidate);
          for (const key of parsed.searchParams.keys()) {
            if (SecretRedactor.isSensitiveKey(key)) {
              parsed.searchParams.set(key, '[REDACTED]');
            }
          }
          metadata.serverUrl = parsed.toString();
        } catch {
          metadata.serverUrl = SecretRedactor.redactString(urlCandidate);
        }
      }

      if (rawConfig.headers && typeof rawConfig.headers === 'object') {
        metadata.hasHeaders = true;
        metadata.headerKeys = Object.keys(rawConfig.headers as Record<string, unknown>);
      }

      if (typeof rawConfig.timeoutSeconds === 'number') {
        metadata.timeoutSeconds = rawConfig.timeoutSeconds;
      }
    }

    return metadata;
  }
}

