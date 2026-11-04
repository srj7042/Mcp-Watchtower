import { ErrorCategory } from '../models/health.js';

export class WatchtowerError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory = 'UNKNOWN',
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WatchtowerError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigValidationError extends WatchtowerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIG_SYNTAX', details);
    this.name = 'ConfigValidationError';
  }
}

export class ProtocolDiagnosticError extends WatchtowerError {
  constructor(message: string, category: ErrorCategory = 'PROTOCOL_ERROR', details?: Record<string, unknown>) {
    super(message, category, details);
    this.name = 'ProtocolDiagnosticError';
  }
}

export class SecurityViolationError extends WatchtowerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SECURITY_VIOLATION', details);
    this.name = 'SecurityViolationError';
  }
}

export function classifyError(error: unknown): { message: string; category: ErrorCategory } {
  if (error instanceof WatchtowerError) {
    return { message: error.message, category: error.category };
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('enotfound') || msg.includes('getaddrinfo')) {
      return { message: error.message, category: 'DNS' };
    }
    if (msg.includes('cert') || msg.includes('tls') || msg.includes('ssl')) {
      return { message: error.message, category: 'TLS' };
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout') || msg.includes('abort')) {
      return { message: error.message, category: 'TIMEOUT' };
    }
    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')) {
      return { message: error.message, category: 'AUTH' };
    }
    if (msg.includes('econnrefused') || msg.includes('connection refused')) {
      return { message: error.message, category: 'NETWORK_REFUSED' };
    }
    if (msg.includes('enoent') || msg.includes('not found')) {
      return { message: error.message, category: 'NOT_FOUND' };
    }
    return { message: error.message, category: 'UNKNOWN' };
  }

  return { message: String(error), category: 'UNKNOWN' };
}
