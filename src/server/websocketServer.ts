import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as crypto from 'crypto';
import { ILogger, defaultLogger } from '../utils/logger.js';
import { IDisposable } from '../utils/disposable.js';
import { EventBus } from '../core/eventBus.js';
import { ObservabilityEvent } from '../observability/events.js';

export interface WebSocketServerOptions {
  port?: number;
  authToken?: string;
  host?: string;
}

export class WatchtowerWebSocketServer implements IDisposable {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private readonly authToken: string;
  private isDisposed = false;
  private actualPort: number = 0;

  constructor(
    private readonly eventBus: EventBus,
    options: WebSocketServerOptions = {},
    private readonly logger: ILogger = defaultLogger
  ) {
    // Generate secure random token if not provided
    this.authToken = options.authToken || crypto.randomBytes(16).toString('hex');
  }

  public async start(desiredPort: number = 19840): Promise<number> {
    if (this.wss) return this.actualPort;

    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server strictly bound to 127.0.0.1
        this.httpServer = http.createServer((_req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'MCP Watchtower Event Server Active' }));
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
