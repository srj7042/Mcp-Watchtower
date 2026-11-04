import { describe, it, expect } from 'vitest';
import { SecretRedactor } from '../../src/security/secretRedactor.js';

describe('SecretRedactor', () => {
  it('redacts Authorization and Bearer tokens in headers', () => {
    const headers = {
      Authorization: 'Bearer super-secret-token-12345',
      'X-Api-Key': 'key_abc_987654321',
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };

    const redacted = SecretRedactor.redactHeaders(headers);

    expect(redacted['Authorization']).toBe('[REDACTED]');
    expect(redacted['X-Api-Key']).toBe('[REDACTED]');
    expect(redacted['Content-Type']).toBe('application/json');
    expect(redacted['Accept']).toBe('text/event-stream');
  });

  it('redacts sensitive environment variables while keeping safe names', () => {
    const env = {
      OPENAI_API_KEY: 'sk-proj-1234567890abcdefghijklmnop',
      GITHUB_TOKEN: 'ghp_1234567890abcdefghijklmnop',
      DB_PASSWORD: 'supersecretpassword',
      PORT: '8080',
      NODE_ENV: 'production',
    };

    const redacted = SecretRedactor.redactEnv(env);

    expect(redacted.OPENAI_API_KEY).toBe('[REDACTED]');
    expect(redacted.GITHUB_TOKEN).toBe('[REDACTED]');
    expect(redacted.DB_PASSWORD).toBe('[REDACTED]');
    expect(redacted.PORT).toBe('8080');
    expect(redacted.NODE_ENV).toBe('production');
  });

  it('redacts tokens embedded in command arguments or URLs', () => {
    const arg = '--token=abcde1234567890';
    const redacted = SecretRedactor.redactString(arg);
    expect(redacted).toBe('--token=[REDACTED]');
  });

  it('recursively redacts nested objects', () => {
    const complex = {
      server: 'main',
      credentials: {
        authToken: 'secret_12345678',
        nested: {
          apiKey: 'key_12345678',
        },
      },
      tags: ['production', 'critical'],
    };

    const redacted = SecretRedactor.redactObject(complex);
    expect(redacted.credentials.authToken).toBe('[REDACTED]');
    expect(redacted.credentials.nested.apiKey).toBe('[REDACTED]');
    expect(redacted.tags).toEqual(['production', 'critical']);
  });
});

