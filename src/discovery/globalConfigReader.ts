import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { McpConfigFile } from '../models/config.js';
import { ConfigParser } from './configParser.js';
import { ILogger, defaultLogger } from '../utils/logger.js';

export class GlobalConfigReader {
  public static readonly DEFAULT_GLOBAL_PATH = path.join(
    os.homedir(),
    '.gemini',
    'config',
    'mcp_config.json'
  );

  constructor(
    private readonly customPath?: string,
    private readonly logger: ILogger = defaultLogger
  ) {}

  public getGlobalPath(): string {
    return this.customPath || GlobalConfigReader.DEFAULT_GLOBAL_PATH;
  }

  public async read(): Promise<McpConfigFile> {
    const configPath = this.getGlobalPath();
    this.logger.debug(`Reading global MCP config from: ${configPath}`);

    try {
      const stats = await fs.promises.stat(configPath);
      if (!stats.isFile()) {
        return {
          path: configPath,
          source: 'GLOBAL',
          exists: false,
          parseError: 'Target path is not a file',
          servers: [],
          lastModifiedMs: 0,
        };
      }

      const content = await fs.promises.readFile(configPath, 'utf8');
      return ConfigParser.parseFileContent(content, configPath, 'GLOBAL', stats.mtimeMs);
    } catch (err: unknown) {
      const isNotFound =
        typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT';

      if (isNotFound) {
        this.logger.debug(`Global config file does not exist at: ${configPath}`);
        return {
          path: configPath,
          source: 'GLOBAL',
          exists: false,
          servers: [],
          lastModifiedMs: 0,
        };
      }

      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed reading global config at ${configPath}: ${msg}`);
      return {
        path: configPath,
        source: 'GLOBAL',
        exists: true,
        parseError: `Filesystem error: ${msg}`,
        servers: [],
        lastModifiedMs: 0,
      };
    }
  }
}

