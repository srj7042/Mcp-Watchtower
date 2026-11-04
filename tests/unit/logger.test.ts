import { describe, it, expect, vi } from 'vitest';
import { Logger } from '../../src/utils/logger.js';
import type { OutputChannel } from 'vscode';

describe('Logger', () => {
  it('appends formatted messages to output channel', () => {
    const lines: string[] = [];
    const mockChannel: OutputChannel = {
      name: 'Test',
      append: vi.fn(),
      appendLine: vi.fn((line: string) => lines.push(line)),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      replace: vi.fn(),
    };

    const logger = new Logger(mockChannel);
    logger.info('Discovery complete', { count: 5 });

    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('[INFO]');
    expect(lines[0]).toContain('Discovery complete');
    expect(lines[0]).toContain('"count":5');
  });

  it('redacts sensitive auth tokens and passwords', () => {
    const lines: string[] = [];
    const mockChannel: OutputChannel = {
      name: 'Test',
      append: vi.fn(),
      appendLine: vi.fn((line: string) => lines.push(line)),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
      replace: vi.fn(),
    };

    const logger = new Logger(mockChannel);
    logger.info('Connecting with Bearer secret-token-xyz-12345');
    logger.error('Failed connection', new Error('API key: super_secret_token_12345'));

    expect(lines[0]).not.toContain('secret-token-xyz-12345');
    expect(lines[0]).toContain('[REDACTED]');
    expect(lines[1]).not.toContain('super_secret_token_12345');
    expect(lines[1]).toContain('[REDACTED]');
  });
});

