import { describe, it, expect } from 'vitest';
import {
  classifyError,
  ConfigValidationError,
  SecurityViolationError,
} from '../../src/utils/errors.js';

describe('Error Handling and Classification', () => {
  it('identifies custom Watchtower errors', () => {
    const err = new ConfigValidationError('Invalid JSON syntax');
    const result = classifyError(err);
    expect(result.category).toBe('CONFIG_SYNTAX');
    expect(result.message).toBe('Invalid JSON syntax');
  });

  it('classifies standard Node network errors correctly', () => {
    expect(classifyError(new Error('getaddrinfo ENOTFOUND api.example.com')).category).toBe('DNS');
    expect(classifyError(new Error('connect ECONNREFUSED 127.0.0.1:8080')).category).toBe('NETWORK_REFUSED');
    expect(classifyError(new Error('Connection timed out after 8000ms')).category).toBe('TIMEOUT');
    expect(classifyError(new Error('HTTP request failed with status 401 Unauthorized')).category).toBe('AUTH');
    expect(classifyError(new Error('spawn npx ENOENT')).category).toBe('NOT_FOUND');
  });

  it('handles SecurityViolationError correctly', () => {
    const err = new SecurityViolationError('SSRF blocked access to metadata service');
    expect(err.category).toBe('SECURITY_VIOLATION');
    expect(err.name).toBe('SecurityViolationError');
  });
});
