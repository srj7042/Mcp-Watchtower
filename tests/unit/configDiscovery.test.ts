import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { GlobalConfigReader } from '../../src/discovery/globalConfigReader.js';
import { ConfigNormalizer } from '../../src/discovery/configNormalizer.js';
import { ConfigDiscovery } from '../../src/discovery/configDiscovery.js';

describe('Configuration Discovery Integration', () => {
  it('reads the real environment global config if present', async () => {
    const globalPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
    if (fs.existsSync(globalPath)) {
      const reader = new GlobalConfigReader(globalPath);
      const file = await reader.read();
      expect(file.exists).toBe(true);
      expect(file.servers.length).toBeGreaterThan(0);

      // Verify discovered servers contain known real servers
      const names = file.servers.map((s) => s.name);
      expect(names).toContain('data-agent-kit');
      expect(names).toContain('playwright');
    }
  });

  it('detects duplicate server names across configurations', () => {
    const mockServers = [
      {
        id: 'global:1:shared-server',
        name: 'shared-server',
        transport: 'stdio' as const,
        source: 'GLOBAL' as const,
        configurationPath: '/global/mcp.json',
        configurationValid: true,
        enabled: true,
        sanitizedMetadata: {},
        discoveredAt: '',
        updatedAt: '',
      },
      {
        id: 'workspace:2:shared-server',
        name: 'shared-server',
        transport: 'streamableHttp' as const,
        source: 'WORKSPACE' as const,
        configurationPath: '/workspace/mcp.json',
        configurationValid: true,
        enabled: true,
        sanitizedMetadata: {},
        discoveredAt: '',
        updatedAt: '',
      },
      {
        id: 'global:3:unique-server',
        name: 'unique-server',
        transport: 'stdio' as const,
        source: 'GLOBAL' as const,
        configurationPath: '/global/mcp.json',
        configurationValid: true,
        enabled: true,
        sanitizedMetadata: {},
        discoveredAt: '',
        updatedAt: '',
      },
    ];

    const duplicates = ConfigNormalizer.detectDuplicateNames(mockServers);
    expect(duplicates.has('shared-server')).toBe(true);
    expect(duplicates.get('shared-server')?.length).toBe(2);
    expect(duplicates.has('unique-server')).toBe(false);
  });

  it('safely handles non-existent configuration paths', async () => {
    const discovery = new ConfigDiscovery({
      globalPath: '/non/existent/path/mcp_config.json',
      customPaths: ['/another/invalid/file.json'],
    });

    const files = await discovery.discoverAllFiles();
    expect(files.length).toBe(1); // the custom invalid path is recorded with exists: false
    expect(files[0].exists).toBe(false);
  });
});

