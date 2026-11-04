import type { OutputChannel } from 'vscode';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, error?: unknown, ...args: unknown[]): void;
  show(): void;
  dispose(): void;
}

export class Logger implements ILogger {
  private outputChannel?: OutputChannel;

  constructor(outputChannel?: OutputChannel) {
    this.outputChannel = outputChannel;
  }

  public setOutputChannel(channel: OutputChannel): void {
    this.outputChannel = channel;
  }

  public debug(message: string, ...args: unknown[]): void {
    this.log('DEBUG', message, args);
  }

  public info(message: string, ...args: unknown[]): void {
    this.log('INFO', message, args);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.log('WARN', message, args);
  }

  public error(message: string, error?: unknown, ...args: unknown[]): void {
    let errDetail = '';
    if (error instanceof Error) {
      errDetail = ` [${error.name}: ${this.sanitizeString(error.message)}]`;
    } else if (error) {
      errDetail = ` [${this.sanitizeString(String(error))}]`;
    }
    this.log('ERROR', `${message}${errDetail}`, args);
  }

  public show(): void {
    if (this.outputChannel) {
      this.outputChannel.show(true);
    }
  }

  public dispose(): void {
    if (this.outputChannel) {
      this.outputChannel.dispose();
      this.outputChannel = undefined;
    }
  }

  private log(level: LogLevel, message: string, args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map((a) => this.safeFormat(a)).join(' ') : '';
    const line = `[${timestamp}] [${level}] ${this.sanitizeString(message)}${formattedArgs}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(line);
    } else if (process.env.NODE_ENV !== 'test') {
      if (level === 'ERROR') {
        // eslint-disable-next-line no-console
        console.error(line);
      } else if (level === 'WARN') {
        // eslint-disable-next-line no-console
        console.warn(line);
      } else {
        // eslint-disable-next-line no-console
        console.log(line);
      }
    }
  }

  private safeFormat(arg: unknown): string {
    if (typeof arg === 'string') {
      return this.sanitizeString(arg);
    }
    try {
      return this.sanitizeString(JSON.stringify(arg));
    } catch {
      return '[Unserializable]';
    }
  }

  private sanitizeString(str: string): string {
    // Redact common secret patterns like Bearer tokens, passwords, api keys
    return str
      .replace(/(bearer\s+)[a-zA-Z0-9_.-]{8,}/gi, '$1[REDACTED]')
      .replace(/(key|token|secret|password|auth|authorization)["']?\s*[:=]\s*["']?([a-zA-Z0-9_.-]{8,})["']?/gi, '$1=[REDACTED]');
  }
}

export const defaultLogger = new Logger();
