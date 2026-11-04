import { describe, it, expect } from 'vitest';
import { StdioDiagnostics } from '../../src/adapters/mcp/stdioDiagnostics.js';

describe('StdioDiagnostics', () => {
  const stdio = new StdioDiagnostics();

  it('verifies standard binaries like node or sh on system PATH without executing them', () => {
    // Both sh and node exist on this machine
    const checkSh = stdio.verifyExecutable('sh');
    expect(checkSh.found).toBe(true);
    expect(checkSh.resolvedPath).toBeDefined();

    const checkNode = stdio.verifyExecutable('node');
    expect(checkNode.found).toBe(true);
    expect(checkNode.resolvedPath).toBeDefined();
  });

  it('correctly reports failure for non-existent commands', () => {
    const check = stdio.verifyExecutable('definitely_non_existent_binary_12345');
    expect(check.found).toBe(false);
    expect(check.error).toContain('not found on PATH');
  });

  it('verifies direct absolute paths', () => {
    const check = stdio.verifyExecutable('/bin/sh');
    expect(check.found).toBe(true);
    expect(check.resolvedPath).toBe('/bin/sh');
  });
});

