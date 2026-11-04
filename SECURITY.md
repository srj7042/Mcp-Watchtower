# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

---

## Reporting a Vulnerability

The MCP Watchtower project takes application and protocol security seriously. If you discover a potential vulnerability in MCP Watchtower:

1. **Do not create a public issue**.
2. Email details of the vulnerability to `security@antigravity-mcp.org` or open a private advisory on GitHub.
3. Include:
   - Operating system and IDE version.
   - MCP Watchtower extension version.
   - Description of the vulnerability and attack vector.
   - Proof-of-concept steps or configuration file.

### Our Commitment
- We will acknowledge receipt of your vulnerability report within 48 hours.
- We will provide a remediation plan and coordinate disclosure timelines responsibly.
- A patched release will be issued promptly.

---

## Core Security Controls

- **No Remote Telemetry**: Watchtower executes 100% locally.
- **Strict SSRF Mitigation**: IP addresses in link-local ranges or matching cloud metadata endpoints are rejected before socket establishment.
- **No Shell Execution**: Child processes are executed directly without a shell interpreter (`shell: false`).
- **No Secret Persistence**: Secrets in configurations are scrubbed and never written to extension state or log channels.

