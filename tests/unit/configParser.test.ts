import { describe, it, expect } from 'vitest';
import { ConfigParser } from '../../src/discovery/configParser.js';

describe('ConfigParser', () => {
  it('parses valid stdio MCP server definitions', () => {
    const json = JSON.stringify({
      mcpServers: {
        'local-test': {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory'],
          env: {
            NODE_ENV: 'test',
          },
        },
      },
    });

    const file = ConfigParser.parseFileContent(json, '/path/mcp_config.json', 'GLOBAL');
    expect(file.exists).toBe(true);
    expect(file.parseError).toBeUndefined();
    expect(file.servers.length).toBe(1);

    const s = file.servers[0];
    expect(s.name).toBe('local-test');
    expect(s.transport).toBe('stdio');
    expect(s.isValid).toBe(true);
    expect(s.enabled).toBe(true);
  });

  it('parses valid Streamable HTTP MCP server definitions', () => {
    const json = JSON.stringify({
      mcpServers: {
        'remote-test': {
          serverUrl: 'https://mcp.example.com/api',
          headers: {
            Authorization: 'Bearer test-token',
          },
          timeoutSeconds: 15,
        },
      },
    });

    const file = ConfigParser.parseFileContent(json, '/path/mcp_config.json', 'GLOBAL');
    expect(file.servers.length).toBe(1);

    const s = file.servers[0];
    expect(s.name).toBe('remote-test');
    expect(s.transport).toBe('streamableHttp');
    expect(s.isValid).toBe(true);
  });

  it('handles disabled servers gracefully', () => {
    const json = JSON.stringify({
      mcpServers: {
        'disabled-srv': {
          command: 'echo',
          disabled: true,
        },
      },
    });

    const file = ConfigParser.parseFileContent(json, '/path/mcp_config.json', 'WORKSPACE');
    expect(file.servers[0].enabled).toBe(false);
  });

  it('reports syntax errors for malformed JSON', () => {
    const badJson = '{"mcpServers": { broken...';
    const file = ConfigParser.parseFileContent(badJson, '/path/mcp_config.json', 'GLOBAL');
    expect(file.parseError).toBeDefined();
    expect(file.parseError).toContain('JSON Syntax Error');
    expect(file.servers.length).toBe(0);
  });

  it('rejects files exceeding 2MB size limit', () => {
    const largeContent = ' '.repeat(2 * 1024 * 1024 + 10);
    const file = ConfigParser.parseFileContent(largeContent, '/path/mcp_config.json', 'GLOBAL');
    expect(file.parseError).toContain('exceeds maximum allowed size');
  });

  it('detects invalid configuration fields', () => {
    const json = JSON.stringify({
      mcpServers: {
        'invalid-stdio': {
          command: '', // Empty command is invalid
        },
        'invalid-http': {
          serverUrl: 'http://insecure-remote.com/api', // Insecure remote HTTP
        },
      },
    });

    const file = ConfigParser.parseFileContent(json, '/path/mcp_config.json', 'GLOBAL');
    expect(file.servers.length).toBe(2);

    const s1 = file.servers.find((s) => s.name === 'invalid-stdio');
    expect(s1?.isValid).toBe(false);
    expect(s1?.validationError).toContain('requires a non-empty "command"');

    const s2 = file.servers.find((s) => s.name === 'invalid-http');
    expect(s2?.isValid).toBe(false);
    expect(s2?.validationError).toContain('Insecure HTTP protocol is not permitted');
  });
});

