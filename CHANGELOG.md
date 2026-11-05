# Changelog

All notable changes to MCP Watchtower are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-05

### Added
- **Interactive Server Connection Buttons**: Added instant connect/reconnect triggers in Dashboard header, per-server cards, sidebar tree actions, and command palette (`MCP Watchtower: Connect to Server...`).
- **Full Universal Cross-Platform Support**: Robust path and executable resolution across macOS (ARM64/x64), Windows (x64/ARM64 with `PATHEXT` `.exe`/`.cmd`/`.bat` lookup), and Linux.
- **CI/CD Multi-OS Release Pipeline**: GitHub Actions workflow running automated testing on Ubuntu, Windows, and macOS, with automated VSIX publishing on tagged releases.
- **Comprehensive Cross-Platform Installation Guide**: Added 3-click GUI and command-line instructions for VS Code and Google Antigravity across macOS, Windows, and Linux.

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

