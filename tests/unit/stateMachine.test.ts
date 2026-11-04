import { describe, it, expect } from 'vitest';
import { HealthStateMachine } from '../../src/core/stateMachine.js';
import { McpServerDefinition } from '../../src/models/server.js';

describe('HealthStateMachine', () => {
  const baseServer: McpServerDefinition = {
    id: 'test-1',
    name: 'test-server',
    transport: 'streamableHttp',
    source: 'GLOBAL',
    configurationPath: '/path.json',
    configurationValid: true,
    enabled: true,
    sanitizedMetadata: {},
    discoveredAt: '',
    updatedAt: '',
  };

  it('assigns CONFIG_ERROR when configuration is invalid', () => {
    const invalidServer = { ...baseServer, configurationValid: false, validationError: 'Missing serverUrl' };
    const record = HealthStateMachine.evaluate({
      server: invalidServer,
      evidenceSource: 'CONFIG_PARSE',
    });

    expect(record.state).toBe('CONFIG_ERROR');
    expect(record.configured).toBe(false);
    expect(record.reason).toBe('Missing serverUrl');
  });

  it('assigns CONNECTED on successful handshake with low latency', () => {
    const record = HealthStateMachine.evaluate({
      server: baseServer,
      protocolHealthy: true,
      latencyMs: 120,
      evidenceSource: 'SDK_INITIALIZE',
      customReason: 'Handshake completed',
    });

    expect(record.state).toBe('CONNECTED');
    expect(record.protocolHealthy).toBe(true);
    expect(record.latencyMs).toBe(120);
    expect(record.lastSuccessfulCheck).toBeDefined();
  });

  it('assigns DEGRADED when latency exceeds 5000ms', () => {
    const record = HealthStateMachine.evaluate({
      server: baseServer,
      protocolHealthy: true,
      latencyMs: 5400,
      evidenceSource: 'SDK_INITIALIZE',
    });

    expect(record.state).toBe('DEGRADED');
    expect(record.reason).toContain('elevated latency');
  });

  it('assigns AUTH_REQUIRED when authentication fails', () => {
    const record = HealthStateMachine.evaluate({
      server: baseServer,
      evidenceSource: 'SDK_INITIALIZE',
      errorCategory: 'AUTH',
      customReason: 'HTTP 401 Unauthorized',
    });

    expect(record.state).toBe('AUTH_REQUIRED');
    expect(record.errorCategory).toBe('AUTH');
  });

  it('assigns TIMEOUT when request times out', () => {
    const record = HealthStateMachine.evaluate({
      server: baseServer,
      evidenceSource: 'SDK_INITIALIZE',
      errorCategory: 'TIMEOUT',
      latencyMs: 8000,
    });

    expect(record.state).toBe('TIMEOUT');
    expect(record.errorCategory).toBe('TIMEOUT');
  });

  it('assigns UNKNOWN with clear reason for stdio PATH_VERIFICATION without executing process', () => {
    const stdioServer: McpServerDefinition = {
      ...baseServer,
      transport: 'stdio',
    };

    const record = HealthStateMachine.evaluate({
      server: stdioServer,
      evidenceSource: 'PATH_VERIFICATION',
      customReason: 'Executable verified at /usr/bin/node',
    });

    expect(record.state).toBe('UNKNOWN');
    expect(record.reason).toContain('/usr/bin/node');
    expect(record.evidenceSource).toBe('PATH_VERIFICATION');
  });
});

