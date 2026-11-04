# Changelog

All notable changes to MCP Watchtower are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-05

### Added
- **Global & Workspace Discovery**: Support for `~/.gemini/config/mcp_config.json`, `<workspace>/.agents/mcp_config.json`, and custom file paths with debounced file watching.
- **Evidence-Based Health State Machine**: Multi-dimensional health evaluation separating configured, reachable, protocol health, and IDE runtime status.
- **Streamable HTTP MCP Diagnostic Engine**: Full protocol initialization handshakes using official `@modelcontextprotocol/sdk` v1.32.2.
- **Safe Stdio Verification**: Executable PATH verification without running duplicate background processes, plus consent-based isolated diagnostic checks.
- **Compact Floating Dashboard**: Modern WebviewPanel developer UI with zero React/Vue overhead, native VS Code theme integration, and live two-way updates.
- **Status Bar Integration**: Verified operational counts (e.g. `MCP: 4/5 Healthy`) with click-to-open dashboard.
- **Sidebar Server Explorer**: TreeDataProvider for quick activity bar navigation.
- **Security Subsystem**: Automated secret redaction, SSRF prevention against cloud metadata services (`169.254.169.254`), and shell injection immunity.
- **Full Test Suite**: 54 automated unit, integration, and security tests.

