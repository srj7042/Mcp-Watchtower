import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as crypto from 'crypto';
import { ILogger, defaultLogger } from '../utils/logger.js';
import { IDisposable } from '../utils/disposable.js';
import { EventBus } from '../core/eventBus.js';
import { ObservabilityEvent } from '../observability/events.js';
import { renderFloatingHudHtml } from './floatingHudHtml.js';

export interface WebSocketServerOptions {
  port?: number;
  authToken?: string;
  host?: string;
}

export interface HudServerState {
  targetModel: string;
  draftTokens: number;
  requestTokens: number;
  actualTokens: number;
  totalCostUsd: number;
  mcpTotal: number;
  mcpHealthy: number;
  lastEvent: string;
  lastUpdated: number;
}

export class WatchtowerWebSocketServer implements IDisposable {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private readonly authToken: string;
  private isDisposed = false;
  private actualPort: number = 0;
  private latestState: HudServerState = {
    targetModel: 'gemini-3.8-flash',
    draftTokens: 0,
    requestTokens: 0,
    actualTokens: 0,
    totalCostUsd: 0,
    mcpTotal: 0,
    mcpHealthy: 0,
    lastEvent: 'Monitoring active',
    lastUpdated: Date.now(),
  };

  constructor(
    private readonly eventBus: EventBus,
    options: WebSocketServerOptions = {},
    private readonly logger: ILogger = defaultLogger
  ) {
    // Generate secure random token if not provided
    this.authToken = options.authToken || crypto.randomBytes(16).toString('hex');

    this.eventBus.on('observability:event', (event: ObservabilityEvent) => {
      this.handleObservabilityEvent(event);
      this.broadcast(event);
    });
  }

  public async start(desiredPort: number = 19840): Promise<number> {
    if (this.wss) return this.actualPort;

    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server strictly bound to 127.0.0.1
        this.httpServer = http.createServer((req, res) => {
          const reqUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
          if (reqUrl.pathname === '/floating' || reqUrl.pathname === '/hud') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderFloatingHudHtml(this.actualPort || desiredPort, this.authToken));
            return;
          }
          if (reqUrl.pathname === '/api/state') {
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify(this.latestState));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'MCP Watchtower Event Server Active',
            floatingHud: `http://127.0.0.1:${this.actualPort || desiredPort}/floating?token=${this.authToken}`,
          }));
        });

        this.wss = new WebSocketServer({
          server: this.httpServer,
          // Verify client token
          verifyClient: (info, callback) => {
            const url = new URL(info.req.url || '/', `http://${info.req.headers.host || '127.0.0.1'}`);
            const tokenQuery = url.searchParams.get('token');
            const tokenHeader = info.req.headers['x-watchtower-token'];

            if (tokenQuery === this.authToken || tokenHeader === this.authToken) {
              callback(true);
            } else {
              this.logger.warn('Rejected unauthorized WebSocket connection attempt');
              callback(false, 401, 'Unauthorized');
            }
          },
        });

        this.wss.on('connection', (ws: WebSocket) => {
          this.logger.info('Companion agent connected to WebSocket server');

          ws.on('message', (data: Buffer | string) => {
            try {
              const parsed = JSON.parse(data.toString());
              if (parsed && typeof parsed.eventType === 'string' && parsed.agentId) {
                // Legitimate observability event
                this.eventBus.emit('observability:event', parsed as ObservabilityEvent);
              }
            } catch (err) {
              this.logger.warn('Failed to parse incoming WebSocket event message:', err);
            }
          });

          ws.on('error', (err) => {
            this.logger.error('WebSocket client connection error:', err);
          });
        });

        // Listen on loopback 127.0.0.1
        this.httpServer.listen(desiredPort, '127.0.0.1', () => {
          const addr = this.httpServer?.address();
          if (addr && typeof addr === 'object') {
            this.actualPort = addr.port;
            this.logger.info(`Watchtower WebSocket server running at ws://127.0.0.1:${this.actualPort}`);
            resolve(this.actualPort);
          } else {
            resolve(desiredPort);
          }
        });

        this.httpServer.on('error', (err: Error & { code?: string }) => {
          if (err.code === 'EADDRINUSE' && desiredPort !== 0) {
            this.logger.warn(`Port ${desiredPort} in use, retrying with ephemeral port...`);
            this.httpServer?.listen(0, '127.0.0.1', () => {
              const addr = this.httpServer?.address();
              if (addr && typeof addr === 'object') {
                this.actualPort = addr.port;
                this.logger.info(`Watchtower WebSocket server running at ws://127.0.0.1:${this.actualPort}`);
                resolve(this.actualPort);
              }
            });
          } else {
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public broadcast(event: ObservabilityEvent): void {
    if (!this.wss || this.isDisposed) return;

    const payload = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // Client might have disconnected
        }
      }
    }
  }

  private handleObservabilityEvent(event: ObservabilityEvent): void {
    if (event.eventType === 'agent:draft') {
      this.latestState.draftTokens = event.draftTokens;
      this.latestState.targetModel = event.model || this.latestState.targetModel;
      this.latestState.requestTokens = event.draftTokens > 0 ? event.draftTokens + 45 : 0;
      this.latestState.totalCostUsd = this.calculateCost(this.latestState.actualTokens || this.latestState.draftTokens, this.latestState.targetModel);
      this.latestState.lastEvent = `Draft: ${event.draftTokens} tokens in active editor`;
    } else if (event.eventType === 'agent:prompt') {
      this.latestState.requestTokens = event.estimatedPromptTokens;
      this.latestState.targetModel = event.model || this.latestState.targetModel;
      this.latestState.lastEvent = `Prompt submitted (${event.estimatedPromptTokens} tokens)`;
    } else if (event.eventType === 'agent:token_usage') {
      this.latestState.actualTokens += event.totalTokens;
      this.latestState.targetModel = event.model || this.latestState.targetModel;
      this.latestState.totalCostUsd = this.calculateCost(this.latestState.actualTokens, this.latestState.targetModel);
      this.latestState.lastEvent = `Actual usage: ${event.totalTokens} tokens (${event.model})`;
    } else if (event.eventType === 'agent:tool_call') {
      this.latestState.lastEvent = `Tool: ${event.toolName} (${event.status})`;
    } else if (event.eventType === 'agent:execution') {
      this.latestState.lastEvent = `Execution: ${event.status} (${event.durationMs || 0}ms)`;
    }
    this.latestState.lastUpdated = Date.now();
    this.broadcastState();
  }

  private calculateCost(tokens: number, model: string): number {
    const m = (model || '').toLowerCase();
    let rate = 0.10; // Default Gemini Flash rate ($0.10/1M)
    if (m.includes('gpt-4o-mini')) rate = 0.15;
    else if (m.includes('gpt-4o')) rate = 2.50;
    else if (m.includes('o1')) rate = 15.00;
    else if (m.includes('claude-3-7') || m.includes('claude-3-5-sonnet')) rate = 3.00;
    else if (m.includes('gemini') && m.includes('pro')) rate = 1.25;
    else if (m.includes('gemini') && m.includes('flash')) rate = 0.10;
    return (tokens / 1_000_000) * rate;
  }

  public broadcastState(): void {
    if (!this.wss || this.isDisposed) return;
    const msg = JSON.stringify({ type: 'STATE_UPDATE', payload: this.latestState });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch {
          // Client might have disconnected
        }
      }
    }
  }

  public getLatestState(): HudServerState {
    return { ...this.latestState };
  }

  public setMcpSummary(total: number, healthy: number): void {
    this.latestState.mcpTotal = total;
    this.latestState.mcpHealthy = healthy;
    this.broadcastState();
  }

  public getPort(): number {
    return this.actualPort;
  }

  public getAuthToken(): string {
    return this.authToken;
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.terminate();
      }
      this.wss.close();
      this.wss = null;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
  }
}
