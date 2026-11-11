import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/core/eventBus.js';
import { AdapterContractVerifier } from '../../src/adapters/agent/contractVerifier.js';
import { GenericInputAdapter } from '../../src/adapters/agent/implementations/genericInputAdapter.js';
import { AntigravityAdapter } from '../../src/adapters/agent/implementations/antigravityAdapter.js';
import { ClaudeCodeAdapter } from '../../src/adapters/agent/implementations/claudeCodeAdapter.js';
import { CodexAdapter } from '../../src/adapters/agent/implementations/codexAdapter.js';
import { CursorAdapter } from '../../src/adapters/agent/implementations/cursorAdapter.js';
import { VsCodeAgentAdapter } from '../../src/adapters/agent/implementations/vscodeAdapter.js';
import { MockAgentAdapter } from '../mocks/mockAgentAdapter.js';

describe('Adapter Contract Tests (Universal SDK)', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.dispose();
  });

  it('GenericInputAdapter strictly adheres to SDK contract', async () => {
    const adapter = new GenericInputAdapter(eventBus);
    await adapter.initialize();
    const result = await AdapterContractVerifier.verifyAdapterContract(adapter);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.capabilitiesVerified).toContain('supportsDraftTracking');
    expect(result.capabilitiesVerified).not.toContain('supportsPromptInterception'); // Honest
    adapter.dispose();
  });

  it('AntigravityAdapter strictly adheres to SDK contract', async () => {
    const adapter = new AntigravityAdapter(eventBus);
    await adapter.initialize();
    const result = await AdapterContractVerifier.verifyAdapterContract(adapter);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.capabilitiesVerified).toContain('supportsPromptInterception');
    expect(result.capabilitiesVerified).toContain('supportsToolCallInterception');
    adapter.dispose();
  });

  it('ClaudeCodeAdapter strictly adheres to SDK contract', async () => {
    const adapter = new ClaudeCodeAdapter(eventBus);
    await adapter.initialize();
    const result = await AdapterContractVerifier.verifyAdapterContract(adapter);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.capabilitiesVerified).toContain('supportsPromptInterception');
    expect(result.capabilitiesVerified).toContain('supportsToolCallInterception');
    adapter.dispose();
  });

  it('CodexAdapter strictly adheres to SDK contract', async () => {
    const adapter = new CodexAdapter(eventBus);
    await adapter.initialize();
    const result = await AdapterContractVerifier.verifyAdapterContract(adapter);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.capabilitiesVerified).toContain('supportsExecutionTracking');
    adapter.dispose();
  });

  it('CursorAdapter strictly adheres to SDK contract', async () => {
    const adapter = new CursorAdapter(eventBus);
    await adapter.initialize();
    const result = await AdapterContractVerifier.verifyAdapterContract(adapter);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.capabilitiesVerified).toContain('supportsPromptInterception');
    adapter.dispose();
  });

  it('VsCodeAgentAdapter strictly adheres to SDK contract', async () => {
    const adapter = new VsCodeAgentAdapter(eventBus);
    await adapter.initialize();
    const result = await AdapterContractVerifier.verifyAdapterContract(adapter);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.capabilitiesVerified).toContain('supportsDraftTracking');
    adapter.dispose();
  });

  it('MockAgentAdapter satisfies contract for automated tests', async () => {
    const adapter = new MockAgentAdapter(eventBus);
    await adapter.initialize();
    const result = await AdapterContractVerifier.verifyAdapterContract(adapter);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.capabilitiesVerified.length).toBeGreaterThan(3);
    adapter.dispose();
  });
});

