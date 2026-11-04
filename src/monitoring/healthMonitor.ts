import { ServerRegistry } from './serverRegistry.js';
import { McpAdapter } from '../adapters/mcp/mcpAdapter.js';
import { HealthStateMachine } from '../core/stateMachine.js';
import { CheckScheduler } from './checkScheduler.js';
import { EventBus } from '../core/eventBus.js';
import { McpHealthRecord } from '../models/health.js';
import { McpDiagnosticEvent } from '../models/diagnostics.js';
import { IDisposable } from '../utils/disposable.js';
import { ILogger, defaultLogger } from '../utils/logger.js';

export interface HealthMonitorOptions {
  checkIntervalSeconds?: number;
  requestTimeoutSeconds?: number;
  maxConcurrentChecks?: number;
  monitoringEnabled?: boolean;
}

export class HealthMonitor implements IDisposable {
  public readonly registry: ServerRegistry;
  private readonly adapter: McpAdapter;
  private readonly scheduler: CheckScheduler;
  private disposables: IDisposable[] = [];
  private requestTimeoutMs: number;

  constructor(
    private readonly eventBus: EventBus,
    options: HealthMonitorOptions = {},
    private readonly logger: ILogger = defaultLogger
  ) {
    this.registry = new ServerRegistry();
    this.adapter = new McpAdapter(logger);
    this.requestTimeoutMs = (options.requestTimeoutSeconds ?? 8) * 1000;

    this.scheduler = new CheckScheduler(
      async (serverId: string) => {
        await this.checkServer(serverId, false);
      },
      {
        checkIntervalSeconds: options.checkIntervalSeconds ?? 60,
        maxConcurrentChecks: options.maxConcurrentChecks ?? 2,
        enabled: options.monitoringEnabled ?? true,
      },
      logger
    );

    this.setupListeners();
  }

  private setupListeners(): void {
    this.disposables.push(
      this.eventBus.on('servers:synced', (servers) => {
        this.registry.setServers(servers);
        for (const s of servers) {
          if (!this.registry.getHealth(s.id)) {
            // Initial placeholder
            const initialRecord = HealthStateMachine.evaluate({
              server: s,
              evidenceSource: 'CONFIG_PARSE',
            });
            this.registry.setHealth(initialRecord);
            this.eventBus.emit('health:updated', initialRecord);
          }
        }
      })
    );

    this.disposables.push(
      this.eventBus.on('server:discovered', (server) => {
        this.registry.setServers([server, ...this.registry.getAllServers()]);
        const initialRecord = HealthStateMachine.evaluate({
          server,
          evidenceSource: 'CONFIG_PARSE',
        });
        this.registry.setHealth(initialRecord);
        this.eventBus.emit('health:updated', initialRecord);
        this.scheduler.enqueue(server.id, true);
      })
    );
  }

  public async checkAll(priority: boolean = true): Promise<void> {
    const servers = this.registry.getAllServers();
    this.logger.info(`Queueing health checks for ${servers.length} server(s)...`);
    for (const s of servers) {
      if (s.enabled) {
        this.scheduler.enqueue(s.id, priority);
      }
    }
  }

  public async checkServer(
    serverId: string,
    allowConsentLaunch: boolean = false
  ): Promise<McpHealthRecord | undefined> {
    const server = this.registry.getServer(serverId);
    if (!server) {
      return undefined;
    }

    // Mutex check: prevent overlapping checks for the same server
    if (!this.registry.markCheckingStart(serverId)) {
      this.logger.debug(`Check already in-flight for server: ${server.name}`);
      return this.registry.getHealth(serverId);
    }

    const previousRecord = this.registry.getHealth(serverId);

    try {
      this.logger.debug(`Running diagnostic check for: ${server.name} (${server.transport})`);
      const { result, evidenceSource } = await this.adapter.runCheck(server, {
        timeoutMs: this.requestTimeoutMs,
        allowConsentLaunch,
      });

      if (result.capabilities) {
        this.registry.setCapabilities(serverId, result.capabilities);
      }

      const newRecord = HealthStateMachine.evaluate({
        server,
        networkReachable: result.success ? true : (server.transport === 'streamableHttp' ? false : null),
        protocolHealthy: result.success && evidenceSource !== 'PATH_VERIFICATION',
        latencyMs: result.latencyMs,
        evidenceSource,
        errorCategory: result.errorCategory,
        customReason: result.reason,
        previousRecord,
      });

      if (result.success) {
        this.scheduler.retryPolicy.recordSuccess(serverId);
      } else {
        this.scheduler.retryPolicy.recordFailure(serverId);
      }

      this.registry.setHealth(newRecord);
      this.eventBus.emit('health:updated', newRecord);

      // Record diagnostic event if state changed or error occurred
      if (!previousRecord || previousRecord.state !== newRecord.state || !result.success) {
        const event: McpDiagnosticEvent = {
          id: `${serverId}-${Date.now()}`,
          serverId,
          eventType: 'HEALTH_CHANGE',
          previousState: previousRecord?.state,
          newState: newRecord.state,
          sanitizedMessage: newRecord.reason,
          timestamp: newRecord.checkedAt,
        };
        this.registry.recordEvent(event);
        this.eventBus.emit('diagnostic:event', event);
      }

      return newRecord;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Unexpected error during check for ${server.name}`, err);

      const errRecord = HealthStateMachine.evaluate({
        server,
        evidenceSource: 'CONFIG_PARSE',
        errorCategory: 'UNKNOWN',
        customReason: `Diagnostic runner failed: ${msg}`,
        previousRecord,
      });

      this.registry.setHealth(errRecord);
      this.eventBus.emit('health:updated', errRecord);
      return errRecord;
    } finally {
      this.registry.markCheckingEnd(serverId);
    }
  }

  public async runConsentDiagnostic(serverId: string): Promise<McpHealthRecord | undefined> {
    return this.checkServer(serverId, true);
  }

  public getHealth(serverId: string): McpHealthRecord | undefined {
    return this.registry.getHealth(serverId);
  }

  public getAllHealth(): Map<string, McpHealthRecord> {
    return this.registry.getAllHealth();
  }

  public isMonitoringEnabled(): boolean {
    return this.scheduler.isMonitoringEnabled();
  }

  public toggleMonitoring(): boolean {
    const next = !this.scheduler.isMonitoringEnabled();
    this.scheduler.setEnabled(next);
    return next;
  }

  public dispose(): void {
    this.scheduler.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

