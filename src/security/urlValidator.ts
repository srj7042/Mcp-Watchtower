import { SecurityViolationError } from '../utils/errors.js';

export interface UrlValidationOptions {
  allowLocalInsecureHttp?: boolean;
  blockCloudMetadata?: boolean;
}

export class UrlValidator {
  private static readonly BLOCKED_METADATA_HOSTS = new Set([
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.google',
    'instance-data',
    '100.100.100.200', // Alibaba Cloud metadata
  ]);

  private static readonly LOCALHOST_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    '[::1]',
    '::1',
  ]);

  public static validate(
    rawUrl: string,
    options: UrlValidationOptions = {}
  ): { valid: boolean; normalizedUrl: string; isLocal: boolean; reason?: string } {
    const {
      allowLocalInsecureHttp = true,
      blockCloudMetadata = true,
    } = options;

    if (!rawUrl || typeof rawUrl !== 'string') {
      return { valid: false, normalizedUrl: '', isLocal: false, reason: 'Empty or invalid URL input' };
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return { valid: false, normalizedUrl: '', isLocal: false, reason: `Malformed URL: "${rawUrl}"` };
    }

    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return {
        valid: false,
        normalizedUrl: parsed.toString(),
        isLocal: false,
        reason: `Unsupported URL protocol "${protocol}". Only http:// and https:// are permitted.`,
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check cloud metadata endpoints
    if (blockCloudMetadata) {
      if (this.BLOCKED_METADATA_HOSTS.has(hostname) || hostname.startsWith('169.254.')) {
        return {
          valid: false,
          normalizedUrl: parsed.toString(),
          isLocal: false,
          reason: `Access to cloud instance metadata endpoint "${hostname}" is prohibited.`,
        };
      }
    }

    const isLocal = this.LOCALHOST_HOSTS.has(hostname);

    if (protocol === 'http:') {
      if (!isLocal) {
        return {
          valid: false,
          normalizedUrl: parsed.toString(),
          isLocal,
          reason: `Insecure HTTP protocol is not permitted for remote host "${hostname}". Use HTTPS.`,
        };
      }
      if (!allowLocalInsecureHttp) {
        return {
          valid: false,
          normalizedUrl: parsed.toString(),
          isLocal,
          reason: 'Insecure HTTP connections to localhost are disabled by security policy.',
        };
      }
    }

    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      isLocal,
    };
  }

  public static assertValid(rawUrl: string, options?: UrlValidationOptions): string {
    const result = this.validate(rawUrl, options);
    if (!result.valid) {
      throw new SecurityViolationError(result.reason || 'Invalid URL');
    }
    return result.normalizedUrl;
  }
}

