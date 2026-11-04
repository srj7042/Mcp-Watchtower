export class SecretRedactor {
  private static readonly SENSITIVE_KEY_PATTERN =
    /(token|secret|password|passwd|key|auth|authorization|cred|private|bearer|cookie|jwt)/i;

  private static readonly TOKEN_STRING_PATTERNS = [
    /(bearer\s+)[a-zA-Z0-9_.-]{8,}/gi,
    /(key|token|secret|password|auth|authorization)["']?\s*[:=]\s*["']?([a-zA-Z0-9_.-]{8,})["']?/gi,
    /\b(sk-[a-zA-Z0-9]{20,})\b/gi,
    /\b(ghp_[a-zA-Z0-9]{20,})\b/gi,
  ];

  public static redactString(input: string): string {
    if (!input) {
      return input;
    }
    let redacted = input;
    for (const pattern of this.TOKEN_STRING_PATTERNS) {
      redacted = redacted.replace(pattern, (_match, prefix, value) => {
        if (value) {
          return `${prefix}=[REDACTED]`;
        }
        return `${prefix}[REDACTED]`;
      });
    }
    return redacted;
  }

  public static isSensitiveKey(key: string): boolean {
    return this.SENSITIVE_KEY_PATTERN.test(key);
  }

  public static redactHeaders(
    headers?: Record<string, unknown>
  ): Record<string, string> {
    if (!headers || typeof headers !== 'object') {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(headers)) {
      if (this.isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof val === 'string') {
        result[key] = this.redactString(val);
      } else {
        result[key] = String(val);
      }
    }
    return result;
  }

  public static redactEnv(
    env?: Record<string, unknown>
  ): Record<string, string> {
    if (!env || typeof env !== 'object') {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(env)) {
      if (this.isSensitiveKey(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof val === 'string') {
        result[key] = this.redactString(val);
      } else {
        result[key] = String(val);
      }
    }
    return result;
  }

  public static redactObject<T>(input: T): T {
    if (input === null || input === undefined) {
      return input;
    }
    if (typeof input === 'string') {
      return this.redactString(input) as unknown as T;
    }
    if (typeof input !== 'object') {
      return input;
    }
    if (Array.isArray(input)) {
      return input.map((item) => this.redactObject(item)) as unknown as T;
    }

    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        output[key] = this.redactObject(value);
      } else if (this.isSensitiveKey(key)) {
        output[key] = '[REDACTED]';
      } else if (Array.isArray(value)) {
        output[key] = value.map((item) => this.redactObject(item));
      } else if (typeof value === 'string') {
        output[key] = this.redactString(value);
      } else {
        output[key] = value;
      }
    }
    return output as T;
  }
}
