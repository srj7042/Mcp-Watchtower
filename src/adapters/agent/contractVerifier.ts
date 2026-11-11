import { IAgentAdapter } from './agentAdapter.js';
import { ObservabilityEvent } from '../../observability/events.js';

export interface ContractVerificationResult {
  valid: boolean;
  errors: string[];
  capabilitiesVerified: string[];
}

export class AdapterContractVerifier {
  public static async verifyAdapterContract(adapter: IAgentAdapter): Promise<ContractVerificationResult> {
    const errors: string[] = [];
    const capabilitiesVerified: string[] = [];

    // 1. Definition verification
    const def = adapter.definition;
    if (!def) {
      errors.push('Adapter must provide a definition');
      return { valid: false, errors, capabilitiesVerified };
    }

    if (!def.id || typeof def.id !== 'string') {
      errors.push('Definition must contain a valid string id');
    }
    if (!def.name || typeof def.name !== 'string') {
      errors.push('Definition must contain a valid string name');
    }
    if (!def.vendor || typeof def.vendor !== 'string') {
      errors.push('Definition must contain a valid string vendor');
    }

    // 2. Capabilities declaration verification
    const caps = def.capabilities;
    if (!caps) {
      errors.push('Definition must declare capabilities');
    } else {
      if (typeof caps.supportsDraftTracking !== 'boolean') errors.push('supportsDraftTracking must be boolean');
      if (typeof caps.supportsPromptInterception !== 'boolean') errors.push('supportsPromptInterception must be boolean');
      if (typeof caps.supportsExecutionTracking !== 'boolean') errors.push('supportsExecutionTracking must be boolean');
      if (typeof caps.supportsToolCallInterception !== 'boolean') errors.push('supportsToolCallInterception must be boolean');
      if (typeof caps.supportsSessionLifecycle !== 'boolean') errors.push('supportsSessionLifecycle must be boolean');
      if (typeof caps.reportsExactTokenMetrics !== 'boolean') errors.push('reportsExactTokenMetrics must be boolean');

      const validMethods = ['VSCODE_API', 'FILE_TRANSCRIPT_WATCH', 'HOOK_SOCKET', 'COMPANION_PROCESS', 'MANUAL'];
      if (!validMethods.includes(caps.captureMethod)) {
        errors.push(`captureMethod "${caps.captureMethod}" is invalid. Must be one of: ${validMethods.join(', ')}`);
      }

      if (caps.supportsDraftTracking) capabilitiesVerified.push('supportsDraftTracking');
      if (caps.supportsPromptInterception) capabilitiesVerified.push('supportsPromptInterception');
      if (caps.supportsExecutionTracking) capabilitiesVerified.push('supportsExecutionTracking');
      if (caps.supportsToolCallInterception) capabilitiesVerified.push('supportsToolCallInterception');
      if (caps.supportsSessionLifecycle) capabilitiesVerified.push('supportsSessionLifecycle');
      if (caps.reportsExactTokenMetrics) capabilitiesVerified.push('reportsExactTokenMetrics');
    }

    // 3. Health check verification
    try {
      const health = await adapter.checkHealth();
      if (!health || typeof health !== 'object') {
        errors.push('checkHealth() must return an object');
      } else {
        const validStatuses = ['ACTIVE', 'DEGRADED', 'DISCONNECTED', 'UNSUPPORTED'];
        if (!validStatuses.includes(health.status)) {
          errors.push(`Health status "${health.status}" is invalid. Must be one of: ${validStatuses.join(', ')}`);
        }
        if (typeof health.timestamp !== 'number') {
          errors.push('Health check must include a numeric timestamp');
        }
      }
    } catch (err) {
      errors.push(`checkHealth() threw an unexpected exception: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 4. Event listener subscription verification
    try {
      const receivedEvents: ObservabilityEvent[] = [];
      const sub = adapter.onEvent((e) => receivedEvents.push(e));
      if (!sub || typeof sub.dispose !== 'function') {
        errors.push('onEvent() must return an IDisposable object');
      } else {
        sub.dispose(); // Cleanup
      }
    } catch (err) {
      errors.push(`onEvent() threw an error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      capabilitiesVerified,
    };
  }
}

