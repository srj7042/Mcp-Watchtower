import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { DashboardProvider } from '../../src/providers/dashboardProvider.js';
import { EventBus } from '../../src/core/eventBus.js';
import { ServerDiscoveryService } from '../../src/services/serverDiscoveryService.js';
import { HealthMonitor } from '../../src/monitoring/healthMonitor.js';
import { Application } from '../../src/core/application.js';
import { McpServerDefinition } from '../../src/models/server.js';
import { McpHealthRecord } from '../../src/models/health.js';

describe('DashboardProvider', () => {
  it('builds a correct DashboardViewModel with sanitized metadata and counts', () => {
    const eventBus = new EventBus();
    const mockContext = {
      extensionPath: '/mock/ext',
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;

    const mockApp = {
      refreshAll: vi.fn(),
      refreshServer: vi.fn(),
      runConsentBasedDiagnostic: vi.fn(),
      copySanitizedReport: vi.fn(),
      toggleMonitoring: vi.fn(),
    } as unknown as Application;

    const mockServers: McpServerDefinition[] = [
      {
        id: 'srv-1',
        name: 'server-1',
        transport: 'streamableHttp',
        source: 'GLOBAL',
        configurationPath: '/global/mcp.json',
        configurationValid: true,
        enabled: true,
        sanitizedMetadata: { serverUrl: 'https://api.example.com' },
        discoveredAt: '',
        updatedAt: '',
      },
      {
        id: 'srv-2',
        name: 'server-2',
        transport: 'stdio',
        source: 'WORKSPACE',
        configurationPath: '/workspace/mcp.json',
        configurationValid: true,
        enabled: true,
        sanitizedMetadata: { command: 'node' },
        discoveredAt: '',
        updatedAt: '',
      },
    ];

    const mockHealth1: McpHealthRecord = {
      serverId: 'srv-1',
      configured: true,
      networkReachable: true,
      protocolHealthy: true,
      ideRuntimeStatus: 'NOT_EXPOSED',
      state: 'CONNECTED',
      reason: 'Handshake complete',
      evidenceSource: 'SDK_INITIALIZE',
      confidence: 'CONFIRMED',
      latencyMs: 45,
      checkedAt: new Date().toISOString(),
      errorCategory: 'NONE',
    };

    const mockHealthMap = new Map<string, McpHealthRecord>([
      ['srv-1', mockHealth1],
    ]);

    const mockDiscovery = {
      getDiscoveredServers: () => mockServers,
    } as unknown as ServerDiscoveryService;

    const mockHealthMonitor = {
      getAllHealth: () => mockHealthMap,
      isMonitoringEnabled: () => true,
      registry: {
        getCapabilities: () => undefined,
        history: { getEventsForServer: () => [] },
      },
    } as unknown as HealthMonitor;

    const provider = new DashboardProvider(
      mockContext,
      mockApp,
      eventBus,
      mockDiscovery,
      mockHealthMonitor
    );

    const vm = provider.buildViewModel();

    expect(vm.summary.total).toBe(2);
    expect(vm.summary.healthy).toBe(1);
    expect(vm.summary.unknown).toBe(1);
    expect(vm.servers.length).toBe(2);
    expect(vm.servers[0].health?.state).toBe('CONNECTED');
    expect(vm.servers[1].health).toBeUndefined();
    expect(vm.monitoringEnabled).toBe(true);

    provider.dispose();
  });
});
