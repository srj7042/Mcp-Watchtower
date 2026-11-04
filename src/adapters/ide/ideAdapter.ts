import { AntigravityCompatibility, IdeCapabilityReport } from './antigravityCompatibility.js';

export class IdeAdapter {
  private static cachedReport?: IdeCapabilityReport;

  public static getCapabilityReport(forceRefresh = false): IdeCapabilityReport {
    if (!this.cachedReport || forceRefresh) {
      this.cachedReport = AntigravityCompatibility.probe();
    }
    return this.cachedReport;
  }
}

