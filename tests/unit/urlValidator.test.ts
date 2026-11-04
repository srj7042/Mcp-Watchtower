import { describe, it, expect } from 'vitest';
import { UrlValidator } from '../../src/security/urlValidator.js';
import { SecurityViolationError } from '../../src/utils/errors.js';

describe('UrlValidator', () => {
  it('allows valid HTTPS remote URLs', () => {
    const result = UrlValidator.validate('https://api.example.com/mcp');
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe('https://api.example.com/mcp');
    expect(result.isLocal).toBe(false);
  });

  it('allows HTTP connections to localhost by default', () => {
    const res1 = UrlValidator.validate('http://localhost:3000/sse');
    expect(res1.valid).toBe(true);
    expect(res1.isLocal).toBe(true);

    const res2 = UrlValidator.validate('http://127.0.0.1:8080/mcp');
    expect(res2.valid).toBe(true);
    expect(res2.isLocal).toBe(true);
  });

  it('rejects unencrypted HTTP connections to remote hosts', () => {
    const result = UrlValidator.validate('http://insecure.remote-mcp.org/api');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Insecure HTTP protocol is not permitted for remote host');
  });

  it('blocks AWS/GCP cloud metadata endpoints', () => {
    const r1 = UrlValidator.validate('http://169.254.169.254/latest/meta-data/');
    expect(r1.valid).toBe(false);
    expect(r1.reason).toContain('prohibited');

    const r2 = UrlValidator.validate('http://metadata.google.internal/computeMetadata/v1/');
    expect(r2.valid).toBe(false);
    expect(r2.reason).toContain('prohibited');
  });

  it('rejects unsupported protocols', () => {
    const r1 = UrlValidator.validate('file:///etc/passwd');
    expect(r1.valid).toBe(false);
    expect(r1.reason).toContain('Unsupported URL protocol');

    const r2 = UrlValidator.validate('javascript:alert(1)');
    expect(r2.valid).toBe(false);
  });

  it('throws SecurityViolationError when assertValid fails', () => {
    expect(() => {
      UrlValidator.assertValid('http://169.254.169.254/secret');
    }).toThrow(SecurityViolationError);
  });
});

