import { describe, it, expect } from 'vitest';
import { AntigravityCompatibility } from '../../src/adapters/ide/antigravityCompatibility.js';

describe('AntigravityCompatibility Probe', () => {
  it('correctly discovers IDE environment capabilities and honestly reports limitations', () => {
    const report = AntigravityCompatibility.probe();

    expect(report.capabilities.webviewPanels).toBe(true);
    expect(report.capabilities.statusBar).toBe(true);
    expect(report.capabilities.sidebarTreeViews).toBe(true);
    // Honest: internal IDE client inspection is never claimed
    expect(report.capabilities.ideInternalClientInspection).toBe(false);
    expect(report.capabilities.ideProcessTakeoverSupported).toBe(false);

    expect(report.limitations.length).toBeGreaterThan(0);
    expect(report.paths.globalConfigPath).toContain('.gemini/config/mcp_config.json');
  });
});

