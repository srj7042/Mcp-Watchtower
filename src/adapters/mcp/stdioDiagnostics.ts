import * as fs from 'fs';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpCapabilities } from '../../models/diagnostics.js';
import { ILogger, defaultLogger } from '../../utils/logger.js';
import { classifyError } from '../../utils/errors.js';
import { DiagnosticCheckResult } from './streamableHttpDiagnostics.js';

export interface StdioDiagnosticOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
  cwd?: string;
}

export class StdioDiagnostics {
  constructor(private readonly logger: ILogger = defaultLogger) {}

  /**
   * Static path & executable verification without launching any process.
   * Completely safe to run periodically without side effects.
   */
  public verifyExecutable(command: string): { found: boolean; resolvedPath?: string; error?: string } {
    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      return { found: false, error: 'Command string is empty' };
    }

    const trimmed = command.trim();

    // 1. Direct path check (if absolute or relative path)
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      try {
        const resolved = path.resolve(trimmed);
        fs.accessSync(resolved, fs.constants.X_OK);
        return { found: true, resolvedPath: resolved };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { found: false, error: `Executable not accessible at path "${trimmed}": ${msg}` };
      }
    }

    // 2. PATH resolution
    const systemPath = process.env.PATH || '';
    // Include standard Homebrew / Mac paths in search
    const paths = [
      ...systemPath.split(path.delimiter),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ];

    for (const dir of paths) {
      if (!dir) continue;
      const candidate = path.join(dir, trimmed);
      try {
        if (fs.existsSync(candidate)) {
          fs.accessSync(candidate, fs.constants.X_OK);
          return { found: true, resolvedPath: candidate };
        }
      } catch {
        // Continue searching
      }
    }

    return {
      found: false,
      error: `Executable "${trimmed}" not found on PATH.`,
    };
  }

  /**
   * Isolated diagnostic client launch.
   * STRICT REQUIREMENT: Only called when the user explicitly grants consent!
   * Never called during background polling!
   */
  public async runIsolatedDiagnostic(
    options: StdioDiagnosticOptions
  ): Promise<DiagnosticCheckResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 8000;

    // Verify binary first
    const binaryCheck = this.verifyExecutable(options.command);
    if (!binaryCheck.found) {
      return {
        success: false,
        latencyMs: Date.now() - startTime,
        errorCategory: 'NOT_FOUND',
        reason: binaryCheck.error || `Command "${options.command}" not found`,
      };
    }

    const commandToRun = binaryCheck.resolvedPath || options.command;
    const safeEnv = {
      ...getDefaultEnvironment(),
      ...(options.env || {}),
      // Ensure PATH includes homebrew
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`,
    };

    let transport: StdioClientTransport | undefined;
    let client: Client | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      this.logger.info(`Starting isolated diagnostic process for command: ${commandToRun}`);

      transport = new StdioClientTransport({
        command: commandToRun,
        args: options.args || [],
        env: safeEnv,
        stderr: 'pipe',
        cwd: options.cwd,
      });

      client = new Client(
        {
          name: 'mcp-watchtower-diagnostic',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Stdio diagnostic timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // Complete initialize handshake
      await Promise.race([client.connect(transport), timeoutPromise]);
      const latencyMs = Date.now() - startTime;

      const serverVersion = client.getServerVersion();
      const rawCaps = client.getServerCapabilities() || {};

      let toolsCount = 0;
      let resourcesCount = 0;
      let promptsCount = 0;

      if (rawCaps.tools) {
        try {
          const list = await client.listTools();
          toolsCount = list.tools.length;
        } catch {
          // Ignore
        }
      }
      if (rawCaps.resources) {
        try {
          const list = await client.listResources();
          resourcesCount = list.resources.length;
        } catch {
          // Ignore
        }
      }
      if (rawCaps.prompts) {
        try {
          const list = await client.listPrompts();
          promptsCount = list.prompts.length;
        } catch {
          // Ignore
        }
      }

      const capabilities: McpCapabilities = {
        protocolVersion: '2024-11-05',
        serverInfo: serverVersion ? { name: serverVersion.name, version: serverVersion.version } : undefined,
        toolsCount,
        resourcesCount,
        promptsCount,
        rawCapabilities: rawCaps as Record<string, unknown>,
      };

      const reason = `Handshake succeeded (PID ${transport.pid ?? 'unknown'}): ${serverVersion?.name || 'MCP Server'} (tools: ${toolsCount}, resources: ${resourcesCount}, prompts: ${promptsCount})`;
      this.logger.info(`Stdio diagnostic passed in ${latencyMs}ms: ${reason}`);

      return {
        success: true,
        latencyMs,
        capabilities,
        errorCategory: 'NONE',
        reason,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const classified = classifyError(err);
      this.logger.warn(`Stdio diagnostic failed (${latencyMs}ms): ${classified.message}`);

      return {
        success: false,
        latencyMs,
        error: err instanceof Error ? err : new Error(String(err)),
        errorCategory: classified.category,
        reason: classified.message,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (client) {
        try {
          await client.close();
        } catch {
          // Process termination handled by transport.close()
        }
      }
    }
  }
}
