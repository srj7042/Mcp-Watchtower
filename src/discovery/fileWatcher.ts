import * as vscode from 'vscode';
import { IDisposable } from '../utils/disposable.js';
import { ILogger, defaultLogger } from '../utils/logger.js';

export type ConfigChangeCallback = (filePath: string) => void | Promise<void>;

export class ConfigFileWatcher implements IDisposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly debounceMs: number = 500;

  constructor(
    private readonly onChange: ConfigChangeCallback,
    private readonly logger: ILogger = defaultLogger
  ) {}

  public watchWorkspacePattern(): void {
    try {
      const pattern = '**/.agents/mcp_config.json';
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidChange((uri) => this.handleFileChange(uri.fsPath));
      watcher.onDidCreate((uri) => this.handleFileChange(uri.fsPath));
      watcher.onDidDelete((uri) => this.handleFileChange(uri.fsPath));

      this.watchers.push(watcher);
      this.logger.debug(`Watching workspace pattern for MCP config: ${pattern}`);
    } catch (err) {
      this.logger.warn('Failed to register workspace file watcher', err);
    }
  }

  public watchCustomPath(fileFsPath: string): void {
    try {
      const pattern = new vscode.RelativePattern(
        vscode.Uri.file(fileFsPath),
        '*'
      );
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidChange((uri) => this.handleFileChange(uri.fsPath));
      watcher.onDidCreate((uri) => this.handleFileChange(uri.fsPath));
      watcher.onDidDelete((uri) => this.handleFileChange(uri.fsPath));

      this.watchers.push(watcher);
      this.logger.debug(`Watching path: ${fileFsPath}`);
    } catch {
      // Best-effort watcher registration
    }
  }

  private handleFileChange(filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.logger.info(`Detected configuration file change: ${filePath}`);
      try {
        const result = this.onChange(filePath);
        if (result instanceof Promise) {
          result.catch((err) => this.logger.error('Error handling config change callback', err));
        }
      } catch (err) {
        this.logger.error('Error in config change callback', err);
      }
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  public dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }
}

