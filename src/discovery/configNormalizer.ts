import { DiscoveredServerEntry } from '../models/config.js';
import { McpServerDefinition } from '../models/server.js';
import { ConfigSanitizer } from '../security/configSanitizer.js';

export class ConfigNormalizer {
  public static normalize(
    entry: DiscoveredServerEntry,
    existing?: McpServerDefinition
  ): McpServerDefinition {
    const now = new Date().toISOString();
    const sanitized = ConfigSanitizer.sanitize(entry.transport, entry.rawConfig);

    return {
      id: entry.id,
      name: entry.name,
      transport: entry.transport,
      source: entry.source,
      configurationPath: entry.configFilePath,
      configurationValid: entry.isValid,
      validationError: entry.validationError,
      enabled: entry.enabled,
      sanitizedMetadata: sanitized as unknown as Record<string, unknown>,
      discoveredAt: existing ? existing.discoveredAt : now,
      updatedAt: now,
    };
  }

  public static detectDuplicateNames(servers: McpServerDefinition[]): Map<string, string[]> {
    const nameToIds = new Map<string, string[]>();
    for (const server of servers) {
      const ids = nameToIds.get(server.name) || [];
      ids.push(server.id);
      nameToIds.set(server.name, ids);
    }

    const duplicates = new Map<string, string[]>();
    for (const [name, ids] of nameToIds.entries()) {
      if (ids.length > 1) {
        duplicates.set(name, ids);
      }
    }
    return duplicates;
  }
}

