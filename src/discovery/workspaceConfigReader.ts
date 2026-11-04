import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { McpConfigFile } from '../models/config.js';
import { ConfigParser } from './configParser.js';
import { ILogger, defaultLogger } from '../utils/logger.js';

export class WorkspaceConfigReader {
  public static readonly RELATIVE_WORKSPACE_CONFIG_PATH = path.join(
    '.agents',
    'mcp_config.json'
  );

  constructor(private readonly logger: ILogger = defaultLogger) {}

  public async readAll(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders
  ): Promise<McpConfigFile[]> {
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const results: McpConfigFile[] = [];
    for (const folder of workspaceFolders) {
      const configPath = path.join(
        folder.uri.fsPath,
        WorkspaceConfigReader.RELATIVE_WORKSPACE_CONFIG_PATH
      );
      this.logger.debug(`Checking workspace MCP config at: ${configPath}`);

      try {
        const stats = await fs.promises.stat(configPath);
        if (stats.isFile()) {
          const content = await fs.promises.readFile(configPath, 'utf8');
          const fileConfig = ConfigParser.parseFileContent(
            content,
            configPath,
            'WORKSPACE',
            stats.mtimeMs
          );
          results.push(fileConfig);
        }
      } catch (err: unknown) {
        const isNotFound =
          typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ENOENT';

        if (!isNotFound) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed reading workspace config at ${configPath}: ${msg}`);
          results.push({
            path: configPath,
            source: 'WORKSPACE',
            exists: true,
            parseError: `Filesystem error: ${msg}`,
            servers: [],
            lastModifiedMs: 0,
          });
        }
      }
    }

    return results;
  }
}

