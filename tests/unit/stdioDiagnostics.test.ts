import { describe, it, expect } from 'vitest';
import { StdioDiagnostics } from '../../src/adapters/mcp/stdioDiagnostics.js';

describe('StdioDiagnostics', () => {
  const stdio = new StdioDiagnostics();

  it('verifies standard binaries like node or shell on system PATH without executing them', () => {
    const checkNode = stdio.verifyExecutable('node');
    expect(checkNode.found).toBe(true);
    expect(checkNode.resolvedPath).toBeDefined();

    const shellCmd = process.platform === 'win32' ? 'cmd' : 'sh';
    const checkShell = stdio.verifyExecutable(shellCmd);
    expect(checkShell.found).toBe(true);
    expect(checkShell.resolvedPath).toBeDefined();
  });

  it('correctly reports failure for non-existent commands', () => {
    const check = stdio.verifyExecutable('definitely_non_existent_binary_12345');
    expect(check.found).toBe(false);
    expect(check.error).toContain('not found on PATH');
  });

  it('verifies direct absolute paths', () => {
    const check = stdio.verifyExecutable(process.execPath);
    expect(check.found).toBe(true);
    expect(check.resolvedPath).toBe(process.execPath);
  });
});

