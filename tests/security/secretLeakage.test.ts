import { describe, it, expect } from 'vitest';
import { ConfigSanitizer } from '../../src/security/configSanitizer.js';
import { Logger } from '../../src/utils/logger.js';
import type { OutputChannel } from 'vscode';

describe('Security: Secret Leakage Defense', () => {
  it('sanitizes headers containing auth tokens in ConfigSanitizer', () => {
    const raw = {
      serverUrl: 'https://mcp.company.com/api',
      headers: {
        Authorization: 'Bearer ghp_1234567890abcdefghijklmnop',
        'X-API-KEY': 'sk-proj-999988887777666655554444',
      },
    };

    const sanitized = ConfigSanitizer.sanitize('streamableHttp', raw);

    // Raw secrets must not be exposed in metadata
    expect(sanitized.hasHeaders).toBe(true);
    expect(sanitized.headerKeys).toContain('Authorization');
    expect(sanitized.headerKeys).toContain('X-API-KEY');
    expect(JSON.stringify(sanitized)).not.toContain('ghp_1234567890abcdefghijklmnop');
    expect(JSON.stringify(sanitized)).not.toContain('sk-proj-999988887777666655554444');
  });

  it('redacts tokens from URLs containing secret query parameters', () => {
    const raw = {
      serverUrl: 'https://mcp.company.com/api?access_token=secret_12345678&apiKey=my_key_9999',
    };

    const sanitized = ConfigSanitizer.sanitize('streamableHttp', raw);
    expect(sanitized.serverUrl).toBeDefined();
    expect(sanitized.serverUrl).not.toContain('secret_12345678');
    expect(sanitized.serverUrl).not.toContain('my_key_9999');
    expect(decodeURIComponent(sanitized.serverUrl || '')).toContain('[REDACTED]');
  });

  it('ensures Logger scrubs secrets from formatted messages and error stacks', () => {
    const lines: string[] = [];
    const mockChannel: OutputChannel = {
      name: 'Test',
      append: () => {},
      appendLine: (l) => lines.push(l),
      clear: () => {},
      show: () => {},
      hide: () => {},
      dispose: () => {},
      replace: () => {},
    };

    const logger = new Logger(mockChannel);
    logger.error(
      'Handshake failed with credential',
      new Error('Auth failed for bearer ghp_1234567890abcdefghijklmnop with token=secret_pass_12345')
    );

    const logOutput = lines.join('\n');
    expect(logOutput).not.toContain('ghp_1234567890abcdefghijklmnop');
    expect(logOutput).not.toContain('secret_pass_12345');
    expect(logOutput).toContain('[REDACTED]');
  });
});
