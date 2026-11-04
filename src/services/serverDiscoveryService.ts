import { ConfigDiscovery, DiscoveryOptions } from '../discovery/configDiscovery.js';
import { ConfigNormalizer } from '../discovery/configNormalizer.js';
import { ConfigFileWatcher } from '../discovery/fileWatcher.js';
import { McpServerDefinition } from '../models/server.js';
import { EventBus } from '../core/eventBus.js';
import { IDisposable } from '../utils/disposable.js';
import { ILogger, defaultLogger } from '../utils/logger.js';

export class ServerDiscoveryService implements IDisposable {
  private discovery: ConfigDiscovery;
  private fileWatcher?: ConfigFileWatcher;
  private currentServers: Map<string, McpServerDefinition> = new Map();

  constructor(
    private readonly eventBus: EventBus,
    private readonly options: DiscoveryOptions = {},
    private readonly logger: ILogger = defaultLogger
  ) {
    this.discovery = new ConfigDiscovery(options, logger);
    this.setupWatcher();
  }

  private setupWatcher(): void {
    this.fileWatcher = new ConfigFileWatcher(async (filePath) => {
      this.logger.info(`Config file watcher triggered for: ${filePath}`);
      await this.discoverAll();
      this.eventBus.emit('config:reloaded', undefined);
    }, this.logger);

    this.fileWatcher.watchWorkspacePattern();
    if (this.options.globalPath) {
      this.fileWatcher.watchCustomPath(this.options.globalPath);
    }
  }

  public async discoverAll(): Promise<McpServerDefinition[]> {
    this.logger.info('Starting MCP server configuration discovery...');
    const configFiles = await this.discovery.discoverAllFiles();

    const newServersMap = new Map<string, McpServerDefinition>();

    for (const file of configFiles) {
      if (file.parseError) {
        this.logger.warn(`Config file has parse error: ${file.path}: ${file.parseError}`);
      }

      for (const entry of file.servers) {
        const existing = this.currentServers.get(entry.id);
        const normalized = ConfigNormalizer.normalize(entry, existing);
        newServersMap.set(normalized.id, normalized);

        if (!existing) {
          this.eventBus.emit('server:discovered', normalized);
        } else if (
          existing.configurationValid !== normalized.configurationValid ||
          existing.enabled !== normalized.enabled ||
          JSON.stringify(existing.sanitizedMetadata) !== JSON.stringify(normalized.sanitizedMetadata)
        ) {
          this.eventBus.emit('server:updated', normalized);
        }
      }
    }

    // Check for removed servers
    for (const [id] of this.currentServers) {
      if (!newServersMap.has(id)) {
        this.eventBus.emit('server:removed', id);
      }
    }

    this.currentServers = newServersMap;
    const serverList = Array.from(this.currentServers.values());

    // Detect duplicates and log if any
    const duplicates = ConfigNormalizer.detectDuplicateNames(serverList);
    if (duplicates.size > 0) {
      for (const [name, ids] of duplicates.entries()) {
        this.logger.warn(`Duplicate server name detected: "${name}" across ${ids.length} configurations: ${ids.join(', ')}`);
      }
    }

    this.eventBus.emit('servers:synced', serverList);
    this.logger.info(`Discovery complete. Discovered ${serverList.length} total server definition(s).`);
    return serverList;
  }

  public getDiscoveredServers(): McpServerDefinition[] {
    return Array.from(this.currentServers.values());
  }

  public async validateAllConfigurations(): Promise<Array<{ path: string; valid: boolean; errors?: string[] }>> {
    const configFiles = await this.discovery.discoverAllFiles();
    return configFiles.map((file) => {
      const errors: string[] = [];
      if (file.parseError) {
        errors.push(file.parseError);
      }
      for (const s of file.servers) {
        if (!s.isValid && s.validationError) {
          errors.push(`[${s.name}]: ${s.validationError}`);
        }
      }
      return {
        path: file.path,
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    });
  }

  public dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
    this.currentServers.clear();
  }
}

