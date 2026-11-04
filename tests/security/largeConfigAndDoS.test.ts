import { describe, it, expect } from 'vitest';
import { ConfigParser } from '../../src/discovery/configParser.js';
import { ServerRegistry } from '../../src/monitoring/serverRegistry.js';
import { McpServerDefinition } from '../../src/models/server.js';

describe('Security & Stability: Large Configuration and DoS Protection', () => {
  it('safely handles 100+ configured servers without memory blowup or slowdown', () => {
    const serversObj: Record<string, unknown> = {};
    for (let i = 0; i < 150; i++) {
      serversObj[`server-stress-${i}`] = {
        command: 'node',
        args: ['--version'],
        env: { ID: String(i) },
      };
    }

    const json = JSON.stringify({ mcpServers: serversObj });
    const startTime = performance.now();
    const result = ConfigParser.parseFileContent(json, '/fake/path.json', 'GLOBAL');
    const parseDuration = performance.now() - startTime;

    expect(result.servers.length).toBe(150);
    expect(result.parseError).toBeUndefined();
    // Must parse rapidly under 100ms
    expect(parseDuration).toBeLessThan(150);

    const registry = new ServerRegistry(500);
    const definitions: McpServerDefinition[] = result.servers.map((s) => ({
      id: s.id,
      name: s.name,
      transport: s.transport,
      source: s.source,
      configurationPath: s.configFilePath,
      configurationValid: s.isValid,
      enabled: s.enabled,
      sanitizedMetadata: {},
      discoveredAt: '',
      updatedAt: '',
    }));

    registry.setServers(definitions);
    expect(registry.getAllServers().length).toBe(150);
  });

  it('rejects payload exceeding 2MB before parsing to prevent regex/JSON DoS', () => {
    const hugeBlob = ' '.repeat(2 * 1024 * 1024 + 1);
    const res = ConfigParser.parseFileContent(hugeBlob, '/fake/huge.json', 'GLOBAL');
    expect(res.parseError).toContain('exceeds maximum allowed size');
    expect(res.servers.length).toBe(0);
  });
});

