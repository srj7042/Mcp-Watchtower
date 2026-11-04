import { CompositeDisposable, IDisposable } from '../utils/disposable.js';
import { ILogger, defaultLogger } from '../utils/logger.js';

export class LifecycleManager implements IDisposable {
  private readonly composite = new CompositeDisposable();
  private isShuttingDown = false;

  constructor(private readonly logger: ILogger = defaultLogger) {}

  public register<T extends IDisposable>(disposable: T): T {
    if (this.isShuttingDown) {
      disposable.dispose();
      return disposable;
    }
    return this.composite.add(disposable);
  }

  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;
    this.logger.info('Shutting down MCP Watchtower resources...');
    this.composite.dispose();
    this.logger.info('Shutdown complete.');
  }

  public dispose(): void {
    this.shutdown().catch((err) => {
      this.logger.error('Error during lifecycle disposal', err);
    });
  }
}

