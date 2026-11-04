import { describe, it, expect } from 'vitest';
import { UrlValidator } from '../../src/security/urlValidator.js';

describe('Security: SSRF and Cloud Metadata Defense', () => {
  it('blocks AWS and GCP link-local metadata endpoints', () => {
    const maliciousUrls = [
      'http://169.254.169.254/latest/meta-data/',
      'http://169.254.169.254/computeMetadata/v1/',
      'http://169.254.1.1/secret',
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      'http://metadata.google/',
      'http://100.100.100.200/latest/meta-data/',
    ];

    for (const url of maliciousUrls) {
      const res = UrlValidator.validate(url);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('prohibited');
    }
  });

  it('blocks arbitrary dangerous URI schemes', () => {
    const dangerousSchemes = [
      'gopher://evil.com:70/1',
      'ftp://ftp.example.com/file',
      'file:///etc/shadow',
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'dict://dict.org/d:word',
      'ldap://ldap.example.com/o=Company',
    ];

    for (const url of dangerousSchemes) {
      const res = UrlValidator.validate(url);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Unsupported URL protocol');
    }
  });

  it('prohibits remote unencrypted HTTP to prevent credential sniffing', () => {
    const res = UrlValidator.validate('http://remote-server.com:8080/mcp');
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('Insecure HTTP protocol is not permitted');
  });
});

