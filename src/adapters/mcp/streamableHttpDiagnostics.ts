import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UrlValidator } from '../../security/urlValidator.js';
import { McpCapabilities } from '../../models/diagnostics.js';
import { ErrorCategory } from '../../models/health.js';
import { ILogger, defaultLogger } from '../../utils/logger.js';
import { classifyError } from '../../utils/errors.js';

export interface StreamableHttpDiagnosticOptions {
  serverUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  allowLocalInsecureHttp?: boolean;
}

export interface DiagnosticCheckResult {
  success: boolean;
  latencyMs: number;
  capabilities?: McpCapabilities;
  error?: Error;
  errorCategory: ErrorCategory;
  reason: string;
}

export class StreamableHttpDiagnostics {
  constructor(private readonly logger: ILogger = defaultLogger) {}

  public async runDiagnostic(
    options: StreamableHttpDiagnosticOptions
  ): Promise<DiagnosticCheckResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 8000;

    // 1. URL Security Check
    const urlValidation = UrlValidator.validate(options.serverUrl, {
      allowLocalInsecureHttp: options.allowLocalInsecureHttp ?? true,
      blockCloudMetadata: true,
    });

    if (!urlValidation.valid) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        errorCategory: 'SECURITY_VIOLATION',
        reason: urlValidation.reason || 'Invalid server URL',
      };
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort(new Error(`MCP handshake timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let client: Client | undefined;
    let transport: StreamableHTTPClientTransport | undefined;

    try {
      this.logger.debug(`Initiating Streamable HTTP diagnostic handshake with: ${urlValidation.normalizedUrl}`);

      transport = new StreamableHTTPClientTransport(new URL(urlValidation.normalizedUrl), {
        requestInit: {
          headers: options.headers || {},
          signal: abortController.signal,
        },
      });

      client = new Client(
        {
          name: 'mcp-watchtower-monitor',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // Perform MCP initialization handshake
      await client.connect(transport);
      const latencyMs = Date.now() - startTime;

      // Extract server info and capabilities
      const serverVersion = client.getServerVersion();
      const rawCaps = client.getServerCapabilities() || {};

      let toolsCount = 0;
      let tools: Array<{ name: string; description?: string }> = [];
      let resourcesCount = 0;
      let promptsCount = 0;

      // Safely inspect capabilities if advertised
      if (rawCaps.tools) {
        try {
          const list = await client.listTools();
          toolsCount = list.tools.length;
          tools = list.tools.map((t) => ({ name: t.name, description: t.description }));
        } catch {
          // Non-fatal if listTools fails
        }
      }

      if (rawCaps.resources) {
        try {
          const list = await client.listResources();
          resourcesCount = list.resources.length;
        } catch {
          // Non-fatal
        }
      }

      if (rawCaps.prompts) {
        try {
          const list = await client.listPrompts();
          promptsCount = list.prompts.length;
        } catch {
          // Non-fatal
        }
      }

      const capabilities: McpCapabilities = {
        protocolVersion: '2024-11-05',
        serverInfo: serverVersion ? { name: serverVersion.name, version: serverVersion.version } : undefined,
        toolsCount,
        resourcesCount,
        promptsCount,
        tools,
        rawCapabilities: rawCaps as Record<string, unknown>,
      };

      const reason = `Handshake succeeded: ${serverVersion?.name || 'MCP Server'} (tools: ${toolsCount}, resources: ${resourcesCount}, prompts: ${promptsCount})`;
      this.logger.info(`Streamable HTTP diagnostic passed for ${options.serverUrl} in ${latencyMs}ms: ${reason}`);

      return {
        success: true,
        latencyMs,
        capabilities,
        errorCategory: 'NONE',
        reason,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      let errorCategory: ErrorCategory = 'UNKNOWN';
      let reason = 'Handshake failed';

      if (err instanceof StreamableHTTPError) {
        if (err.code === 401 || err.code === 403) {
          errorCategory = 'AUTH';
          reason = `HTTP ${err.code} Authentication Required`;
        } else {
          errorCategory = 'PROTOCOL_ERROR';
          reason = `Streamable HTTP error: ${err.message} (status: ${err.code})`;
        }
      } else {
        const classified = classifyError(err);
        errorCategory = classified.category;
        reason = classified.message;
      }

      this.logger.warn(`Streamable HTTP diagnostic failed for ${options.serverUrl} (${latencyMs}ms): ${reason}`);

      return {
        success: false,
        latencyMs,
        error: err instanceof Error ? err : new Error(String(err)),
        errorCategory,
        reason,
      };
    } finally {
      clearTimeout(timeoutId);
      if (client) {
        try {
          await client.close();
        } catch {
          // Safe cleanup
        }
      }
    }
  }
}

