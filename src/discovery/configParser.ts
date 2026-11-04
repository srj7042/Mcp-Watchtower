import {
  ConfigSource,
  DiscoveredServerEntry,
  McpConfigFile,
  McpTransportType,
  RawMcpServerConfig,
} from '../models/config.js';
import { UrlValidator } from '../security/urlValidator.js';

export class ConfigParser {
  public static readonly MAX_CONFIG_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

  public static parseFileContent(
    content: string,
    filePath: string,
    source: ConfigSource,
    lastModifiedMs: number = Date.now()
  ): McpConfigFile {
    if (content.length > this.MAX_CONFIG_FILE_SIZE_BYTES) {
      return {
        path: filePath,
        source,
        exists: true,
        parseError: `Configuration file exceeds maximum allowed size of 2MB (${(content.length / 1024 / 1024).toFixed(2)}MB)`,
        servers: [],
        lastModifiedMs,
      };
    }

    let parsed: unknown;
    try {
      // Strip potential leading UTF-8 BOM
      const cleanContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
      parsed = JSON.parse(cleanContent);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        path: filePath,
        source,
        exists: true,
        parseError: `JSON Syntax Error: ${message}`,
        servers: [],
        lastModifiedMs,
      };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        path: filePath,
        source,
        exists: true,
        parseError: 'Root configuration must be a valid JSON object containing an "mcpServers" key.',
        servers: [],
        lastModifiedMs,
      };
    }

    const rootObj = parsed as Record<string, unknown>;
    const serversObj = rootObj.mcpServers;

    if (!serversObj || typeof serversObj !== 'object' || Array.isArray(serversObj)) {
      return {
        path: filePath,
        source,
        exists: true,
        parseError: 'Missing or invalid "mcpServers" object in configuration.',
        servers: [],
        lastModifiedMs,
      };
    }

    const discoveredServers: DiscoveredServerEntry[] = [];
    const serverMap = serversObj as Record<string, unknown>;

    for (const [serverName, serverVal] of Object.entries(serverMap)) {
      const entry = this.parseServerEntry(serverName, serverVal, filePath, source);
      discoveredServers.push(entry);
    }

    return {
      path: filePath,
      source,
      exists: true,
      servers: discoveredServers,
      lastModifiedMs,
    };
  }

  public static parseServerEntry(
    serverName: string,
    rawVal: unknown,
    filePath: string,
    source: ConfigSource
  ): DiscoveredServerEntry {
    const id = `${source.toLowerCase()}:${filePath}:${serverName}`;

    if (!rawVal || typeof rawVal !== 'object' || Array.isArray(rawVal)) {
      return {
        id,
        name: serverName,
        source,
        configFilePath: filePath,
        transport: 'unsupported',
        rawConfig: {},
        isValid: false,
        validationError: 'Server definition must be a JSON object',
        enabled: true,
      };
    }

    const raw = rawVal as RawMcpServerConfig;
    const isExplicitlyDisabled = raw.disabled === true || raw.enabled === false;
    const transport = this.determineTransport(raw);

    const validation = this.validateConfig(transport, raw);

    return {
      id,
      name: serverName,
      source,
      configFilePath: filePath,
      transport,
      rawConfig: raw,
      isValid: validation.isValid,
      validationError: validation.error,
      enabled: !isExplicitlyDisabled,
    };
  }

  public static determineTransport(raw: RawMcpServerConfig): McpTransportType {
    if ('command' in raw) {
      return 'stdio';
    }
    if ('serverUrl' in raw || 'url' in raw) {
      return 'streamableHttp';
    }
    return 'unsupported';
  }

  public static validateConfig(
    transport: McpTransportType,
    raw: RawMcpServerConfig
  ): { isValid: boolean; error?: string } {
    if (transport === 'stdio') {
      if (typeof raw.command !== 'string' || raw.command.trim().length === 0) {
        return { isValid: false, error: 'Stdio transport requires a non-empty "command" string.' };
      }
      if (raw.args !== undefined && !Array.isArray(raw.args)) {
        return { isValid: false, error: '"args" must be an array of strings.' };
      }
      if (Array.isArray(raw.args)) {
        for (let i = 0; i < raw.args.length; i++) {
          if (typeof raw.args[i] !== 'string') {
            return { isValid: false, error: `"args[${i}]" must be a string.` };
          }
        }
      }
      if (raw.env !== undefined && (typeof raw.env !== 'object' || raw.env === null || Array.isArray(raw.env))) {
        return { isValid: false, error: '"env" must be an object of key-value environment variables.' };
      }
      return { isValid: true };
    }

    if (transport === 'streamableHttp') {
      const url = (raw.serverUrl || raw.url) as string;
      const urlCheck = UrlValidator.validate(url);
      if (!urlCheck.valid) {
        return { isValid: false, error: urlCheck.reason || 'Invalid server URL' };
      }
      if (raw.headers !== undefined && (typeof raw.headers !== 'object' || raw.headers === null || Array.isArray(raw.headers))) {
        return { isValid: false, error: '"headers" must be a key-value object of HTTP headers.' };
      }
      if (raw.timeoutSeconds !== undefined && (typeof raw.timeoutSeconds !== 'number' || raw.timeoutSeconds <= 0)) {
        return { isValid: false, error: '"timeoutSeconds" must be a positive number.' };
      }
      return { isValid: true };
    }

    return {
      isValid: false,
      error: 'Unrecognized MCP transport. Expected "command" (stdio) or "serverUrl" (Streamable HTTP).',
    };
  }
}
