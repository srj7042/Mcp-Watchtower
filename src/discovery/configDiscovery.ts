import * as fs from 'fs';
import { McpConfigFile } from '../models/config.js';
import { GlobalConfigReader } from './globalConfigReader.js';
import { WorkspaceConfigReader } from './workspaceConfigReader.js';
import { ConfigParser } from './configParser.js';
import { ILogger, defaultLogger } from '../utils/logger.js';

export interface DiscoveryOptions {
  customPaths?: string[];
  globalPath?: string;
}

export class ConfigDiscovery {
  private globalReader: GlobalConfigReader;
  private workspaceReader: WorkspaceConfigReader;

  constructor(
    private readonly options: DiscoveryOptions = {},
    private readonly logger: ILogger = defaultLogger
  ) {
    this.globalReader = new GlobalConfigReader(options.globalPath, logger);
    this.workspaceReader = new WorkspaceConfigReader(logger);
  }

  public async discoverAllFiles(): Promise<McpConfigFile[]> {
    const files: McpConfigFile[] = [];

    // 1. Read Global Config
    const globalFile = await this.globalReader.read();
    if (globalFile.exists || globalFile.parseError) {
      files.push(globalFile);
    }

    // 2. Read Workspace Configs
    const workspaceFiles = await this.workspaceReader.readAll();
    files.push(...workspaceFiles);

    // 3. Read Custom Configs
    if (this.options.customPaths) {
      for (const customPath of this.options.customPaths) {
        try {
          const stats = await fs.promises.stat(customPath);
          if (stats.isFile()) {
            const content = await fs.promises.readFile(customPath, 'utf8');
            const customFile = ConfigParser.parseFileContent(
              content,
              customPath,
              'MANUAL',
              stats.mtimeMs
            );
            files.push(customFile);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed reading custom config at ${customPath}: ${msg}`);
          files.push({
            path: customPath,
            source: 'MANUAL',
            exists: false,
            parseError: `Failed reading file: ${msg}`,
            servers: [],
            lastModifiedMs: 0,
          });
        }
      }
    }

    return files;
  }
}

