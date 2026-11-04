# MCP Watchtower 🗼

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.90-purple)](https://code.visualstudio.com/)
[![Google Antigravity](https://img.shields.io/badge/Google%20Antigravity-Supported-green)](https://antigravity.google)

**MCP Watchtower** is a production-oriented, local-first monitoring extension for the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). Designed specifically for Visual Studio Code and Google Antigravity IDE, Watchtower verifies and presents the real operational health of configured MCP servers in a compact, floating-like dashboard and status bar.

---

## 🚀 Simple Installation

### Method 1: Directly inside the IDE (Easiest — No Terminal Needed)
1. In Antigravity IDE or VS Code, press **`Cmd + Shift + X`** (or `Ctrl + Shift + X` on Windows/Linux) to open the **Extensions** panel.
2. Click the **`···`** (Views and More Actions) menu in the top right of the Extensions panel.
3. Select **Install from VSIX...**
4. Choose the [`mcp-watchtower-1.0.0.vsix`](mcp-watchtower-1.0.0.vsix) file.
5. Press **`Cmd + Shift + P`** and run **`Developer: Reload Window`**.

*You will immediately see the **`$(pulse) MCP: ...`** icon in the bottom-right status bar and the **Watchtower** icon in the left activity bar!*

---

### Method 2: Via Terminal

#### For Google Antigravity IDE:
```bash
# If antigravity-ide is in your PATH:
antigravity-ide --install-extension mcp-watchtower-1.0.0.vsix

# Or directly using the macOS app binary:
"/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide" --install-extension mcp-watchtower-1.0.0.vsix
```

#### For Visual Studio Code:
```bash
code --install-extension mcp-watchtower-1.0.0.vsix
```

---

### Method 3: Build & Install from Source
```bash
git clone https://github.com/srj7042/Mcp-Watchtower.git
cd Mcp-Watchtower
npm install
npm run package
```
This generates `mcp-watchtower-1.0.0.vsix` in the project root.

---

## 🎯 Quick Start

1. **Open Dashboard**: Click the status bar item `$(pulse) MCP: 4/6 Healthy` at the bottom-right of your window, or press `Cmd + Shift + P` and search for **`MCP Watchtower: Open Dashboard`**.
2. **Connect Any Server**: Click the **`Connect`** button on any server card to initiate a real-time protocol handshake and inspect live capabilities (tools, prompts, resources count).
3. **Sidebar View**: Click the **Watchtower icon** in your left activity bar to inspect configured servers and trigger quick actions.

---

## ✨ Features

- 🔭 **Zero-Config Discovery**: Automatically discovers MCP servers from global (`~/.gemini/config/mcp_config.json`), workspace (`.agents/mcp_config.json`), and custom user paths.
- ⚡ **One-Click Connect**: Connect or re-verify any MCP server with a dedicated Connect button directly in the dashboard or sidebar.
- 🚦 **Evidence-Based Multi-Dimensional Health**: Discards naive booleans. Separates `CONFIGURED`, `NETWORK_REACHABLE`, `MCP_PROTOCOL_HEALTH`, and `IDE_RUNTIME_STATUS`.
- 🤝 **Real Protocol Handshakes**: Validates remote Streamable HTTP servers by completing real MCP initialization handshakes through the official MCP TypeScript SDK without ever executing user tools.
- 🛡️ **Stdio Process Safety**: Zero duplicate stdio processes spawned in background polling. Verifies PATH and binary accessibility safely. Isolated diagnostic runs require explicit interactive consent.
- 🔒 **Ironclad Security & Zero Secrets in UI**: Full SSRF protection (blocking cloud metadata endpoints like `169.254.169.254`), automatic token/password redaction, strict Content Security Policy, and zero telemetry.
- ⚡ **Ultra-Lightweight on Apple Silicon**: Pure native TypeScript UI with zero React/Vue runtime overhead. Instant rendering (< 50ms) and minimal memory usage.

---

## 🧭 What Watchtower Does vs What It Cannot Detect

### What Watchtower Does:
1. **Parses & Validates MCP Config**: Validates JSON syntax, arguments, environment dictionaries, and URLs against strict security bounds.
2. **Performs Protocol Diagnostics**: Connects to Streamable HTTP endpoints and completes initialization handshakes, extracting advertised tools, resources, and prompt counts.
3. **Monitors Stdio Executables**: Verifies executable existence and binary permissions without duplicate process spawning.
4. **Surfaces Live Health**: Displays verified health state (`CONNECTED`, `DEGRADED`, `DISCONNECTED`, `AUTH_REQUIRED`, `CONFIG_ERROR`, `TIMEOUT`, `UNKNOWN`) in the status bar and floating dashboard.

### What Watchtower Cannot Detect (Honest Architecture Boundary):
- **IDE Runtime Internal Agent State**: Neither VS Code core nor Antigravity exposes a third-party extension hook into active AI agent sessions or internal stdio child processes.
- **Watchtower never fakes internal IDE state**: It explicitly surfaces IDE runtime status as `NOT_EXPOSED` rather than inventing false green lights.
- **Process Hijacking**: Watchtower will **never** attempt to kill, attach to, or restart external processes owned by the IDE or other applications.

---

## ⚙️ Configuration & Settings

Configure Watchtower via Settings (`Preferences -> Settings -> Extensions -> MCP Watchtower`):

| Setting Key | Default | Description |
|:------------|:-------:|:------------|
| `mcpWatchtower.monitoring.enabled` | `true` | Enable periodic background health checks. |
| `mcpWatchtower.monitoring.checkIntervalSeconds` | `60` | Interval between background checks (10s - 3600s). |
| `mcpWatchtower.monitoring.requestTimeoutSeconds` | `8` | Timeout for diagnostic handshakes (2s - 60s). |
| `mcpWatchtower.monitoring.maxConcurrentChecks` | `2` | Maximum concurrent diagnostic checks. |
| `mcpWatchtower.monitoring.allowAutoStdioDiagnostic` | `false` | Disabled by default. Safety guardrail for stdio processes. |
| `mcpWatchtower.security.allowLocalInsecureHttp` | `true` | Allow unencrypted `http://` strictly for `localhost` and `127.0.0.1`. |
| `mcpWatchtower.security.blockCloudMetadataEndpoints` | `true` | Block requests to `169.254.169.254` and `metadata.google.internal`. |
| `mcpWatchtower.customConfigPaths` | `[]` | Additional paths to scan for `mcp_config.json`. |

---

## ⌨️ Commands

Access via Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- `MCP Watchtower: Open Dashboard` (`mcpWatchtower.openDashboard`)
- `MCP Watchtower: Connect / Test Server` (`mcpWatchtower.connectServer`)
- `MCP Watchtower: Refresh All Servers` (`mcpWatchtower.refreshAll`)
- `MCP Watchtower: Refresh Server` (`mcpWatchtower.refreshServer`)
- `MCP Watchtower: Inspect Server Details` (`mcpWatchtower.inspectServer`)
- `MCP Watchtower: Validate Configuration Files` (`mcpWatchtower.validateConfiguration`)
- `MCP Watchtower: Show Diagnostics Output Channel` (`mcpWatchtower.showDiagnostics`)
- `MCP Watchtower: Copy Sanitized Diagnostic Report` (`mcpWatchtower.copySanitizedReport`)
- `MCP Watchtower: Toggle Periodic Monitoring` (`mcpWatchtower.toggleMonitoring`)
- `MCP Watchtower: Run Consent-Based Diagnostic (Stdio)` (`mcpWatchtower.runConsentBasedDiagnostic`)

---

## 🔒 Security & Privacy Policy

- **Zero Telemetry**: No analytics, tracking, or network calls beyond the user's configured MCP servers.
- **Secret Redaction**: Bearer tokens, passwords, and sensitive keys matching security filters are replaced with `[REDACTED]`.
- **SSRF Hardening**: Rejects cloud metadata services (`169.254.169.254`), non-HTTP schemes (`file:`, `javascript:`), and remote unencrypted HTTP.
- **Process Isolation**: Commands are invoked with argument arrays and `shell: false` to eliminate shell injection vulnerabilities.

---

## 📄 License

Distributed under the [MIT License](LICENSE).
