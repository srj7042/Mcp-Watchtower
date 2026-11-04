import { McpDiagnosticEvent } from '../models/diagnostics.js';

export class ConnectionHistory {
  private events: McpDiagnosticEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents: number = 500) {
    this.maxEvents = maxEvents;
  }

  public record(event: McpDiagnosticEvent): void {
    this.events.unshift(event); // newest first
    if (this.events.length > this.maxEvents) {
      this.events.length = this.maxEvents;
    }
  }

  public getEventsForServer(serverId: string, limit: number = 50): McpDiagnosticEvent[] {
    return this.events.filter((e) => e.serverId === serverId).slice(0, limit);
  }

  public getAllEvents(limit: number = 100): McpDiagnosticEvent[] {
    return this.events.slice(0, limit);
  }

  public clear(): void {
    this.events = [];
  }
}

