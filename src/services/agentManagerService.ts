import { IDisposable } from '../utils/disposable.js';
import { ILogger, defaultLogger } from '../utils/logger.js';
import { EventBus } from '../core/eventBus.js';
import { IAgentAdapter } from '../adapters/agent/agentAdapter.js';
import { AgentHealthCheckResult, AgentCapabilities } from '../models/agent.js';
import { ObservabilityEvent, AgentTokenUsageEvent } from '../observability/events.js';
import { SqliteStorage, TokenUsageSummary } from '../storage/sqliteStorage.js';
import { WatchtowerWebSocketServer } from '../server/websocketServer.js';
import { PricingEngine } from '../tokenization/pricingEngine.js';

// Implementations
import { GenericInputAdapter } from '../adapters/agent/implementations/genericInputAdapter.js';
import { AntigravityAdapter } from '../adapters/agent/implementations/antigravityAdapter.js';
import { ClaudeCodeAdapter } from '../adapters/agent/implementations/claudeCodeAdapter.js';
import { CodexAdapter } from '../adapters/agent/implementations/codexAdapter.js';
import { CursorAdapter } from '../adapters/agent/implementations/cursorAdapter.js';
import { VsCodeAgentAdapter } from '../adapters/agent/implementations/vscodeAdapter.js';

export interface AgentObservabilityState {
  adapters: Array<{
    id: string;
    name: string;
    vendor: string;
    status: string;
    capabilities: AgentCapabilities;
    healthMessage?: string;
  }>;
  tokenSummary: TokenUsageSummary;
  recentEvents: ObservabilityEvent[];
}

export class AgentManagerService implements IDisposable {
  private adapters = new Map<string, IAgentAdapter>();
  private adapterStatus = new Map<string, AgentHealthCheckResult>();
  private readonly eventBusSubscription: IDisposable;

  constructor(
    private readonly eventBus: EventBus,
    private readonly storage: SqliteStorage,
    private readonly wsServer: WatchtowerWebSocketServer,
    private readonly pricing: PricingEngine = new PricingEngine(),
    private readonly logger: ILogger = defaultLogger
  ) {
    // Listen for all observability events emitted across adapters or WebSocket
    this.eventBusSubscription = this.eventBus.on('observability:event', (event: ObservabilityEvent) => {
      this.handleObservabilityEvent(event);
    });
  }

  public async initialize(): Promise<void> {
    this.logger.info('Initializing AgentManagerService...');

    // Register all default adapters
    this.registerAdapter(new GenericInputAdapter(this.eventBus, this.logger));
    this.registerAdapter(new AntigravityAdapter(this.eventBus, this.logger));
    this.registerAdapter(new ClaudeCodeAdapter(this.eventBus, this.logger));
    this.registerAdapter(new CodexAdapter(this.eventBus, this.logger));
    this.registerAdapter(new CursorAdapter(this.eventBus, this.logger));
    this.registerAdapter(new VsCodeAgentAdapter(this.eventBus, this.logger));

    // Initialize all adapters
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.initialize();
      } catch (err) {
        this.logger.error(`Failed to initialize adapter ${adapter.definition.name}:`, err);
      }
    }

    await this.checkAllHealth();
    this.logger.info(`AgentManagerService initialized with ${this.adapters.size} adapters.`);
  }

  public registerAdapter(adapter: IAgentAdapter): void {
    this.adapters.set(adapter.definition.id, adapter);
  }

  public getAdapter(id: string): IAgentAdapter | undefined {
    return this.adapters.get(id);
  }

  public getAllAdapters(): IAgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  public async checkAllHealth(): Promise<Record<string, AgentHealthCheckResult>> {
    const results: Record<string, AgentHealthCheckResult> = {};
    for (const [id, adapter] of this.adapters) {
      try {
        const res = await adapter.checkHealth();
        this.adapterStatus.set(id, res);
        results[id] = res;
      } catch (err) {
        const failure: AgentHealthCheckResult = {
          status: 'DISCONNECTED',
          message: `Health check error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        };
        this.adapterStatus.set(id, failure);
        results[id] = failure;
      }
    }
    return results;
  }

  private handleObservabilityEvent(event: ObservabilityEvent): void {
    // If event is token usage without cost calculation, calculate it
    if (event.eventType === 'agent:token_usage') {
      const usage = event as AgentTokenUsageEvent;
      if (usage.estimatedCostUsd === undefined) {
        const pricingRes = this.pricing.calculateCost(
          usage.model,
          usage.promptTokens,
          usage.completionTokens,
          usage.cachedTokens || 0
        );
        usage.estimatedCostUsd = pricingRes.totalCostUsd;
      }
    }

    // Persist to SQLite
    this.storage.recordEvent(event);

    // Broadcast over WebSocket to any connected companion apps / clients
    this.wsServer.broadcast(event);
  }

  public getObservabilityState(): AgentObservabilityState {
    const adaptersList = Array.from(this.adapters.values()).map((a) => {
      const status = this.adapterStatus.get(a.definition.id);
      return {
        id: a.definition.id,
        name: a.definition.name,
        vendor: a.definition.vendor,
        status: status?.status || 'UNKNOWN',
        capabilities: a.definition.capabilities,
        healthMessage: status?.message,
      };
    });

    const tokenSummary = this.storage.getTokenUsageSummary();
    const recentEvents = this.storage.getRecentEvents(30);

    return {
      adapters: adaptersList,
      tokenSummary,
      recentEvents,
    };
  }

  public dispose(): void {
    this.eventBusSubscription.dispose();
    for (const adapter of this.adapters.values()) {
      adapter.dispose();
    }
    this.adapters.clear();
    this.adapterStatus.clear();
  }
}
