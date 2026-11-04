import { StdioDiagnostics } from './stdioDiagnostics.js';
import { StreamableHttpDiagnostics, DiagnosticCheckResult } from './streamableHttpDiagnostics.js';
import { McpServerDefinition } from '../../models/server.js';
import { ILogger, defaultLogger } from '../../utils/logger.js';

export interface McpCheckOptions {
  timeoutMs?: number;
  allowConsentLaunch?: boolean;
}

export class McpAdapter {
  public readonly stdio: StdioDiagnostics;
  public readonly http: StreamableHttpDiagnostics;

  constructor(logger: ILogger = defaultLogger) {
    this.stdio = new StdioDiagnostics(logger);
    this.http = new StreamableHttpDiagnostics(logger);
  }

  public async runCheck(
    server: McpServerDefinition,
    options: McpCheckOptions = {}
  ): Promise<{
    result: DiagnosticCheckResult;
    evidenceSource: 'SDK_INITIALIZE' | 'PATH_VERIFICATION' | 'STDIO_DIAGNOSTIC' | 'CONFIG_PARSE';
  }> {
    if (!server.configurationValid) {
      return {
        result: {
          success: false,
          latencyMs: 0,
          errorCategory: 'CONFIG_SYNTAX',
          reason: server.validationError || 'Invalid server configuration',
        },
        evidenceSource: 'CONFIG_PARSE',
      };
    }

    if (server.transport === 'streamableHttp') {
      const serverUrl = (server.sanitizedMetadata.serverUrl as string) || '';
      const result = await this.http.runDiagnostic({
        serverUrl,
        timeoutMs: options.timeoutMs,
      });
      return {
        result,
        evidenceSource: 'SDK_INITIALIZE',
      };
    }

    if (server.transport === 'stdio') {
      const command = (server.sanitizedMetadata.command as string) || '';

      if (options.allowConsentLaunch) {
        const args = (server.sanitizedMetadata.args as string[]) || [];
        const result = await this.stdio.runIsolatedDiagnostic({
          command,
          args,
          timeoutMs: options.timeoutMs,
        });
        return {
          result,
          evidenceSource: 'STDIO_DIAGNOSTIC',
        };
      }

      // Default safe mode: static verification
      const check = this.stdio.verifyExecutable(command);
      if (check.found) {
        return {
          result: {
            success: true,
            latencyMs: 1,
            errorCategory: 'NONE',
            reason: `Executable verified at: ${check.resolvedPath}`,
          },
          evidenceSource: 'PATH_VERIFICATION',
        };
      } else {
        return {
          result: {
            success: false,
            latencyMs: 1,
            errorCategory: 'NOT_FOUND',
            reason: check.error || `Executable "${command}" not found on PATH.`,
          },
          evidenceSource: 'PATH_VERIFICATION',
        };
      }
    }

    return {
      result: {
        success: false,
        latencyMs: 0,
        errorCategory: 'UNKNOWN',
        reason: 'Unsupported transport mechanism',
      },
      evidenceSource: 'CONFIG_PARSE',
    };
  }
}

