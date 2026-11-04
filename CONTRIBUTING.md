# Contributing to MCP Watchtower

We welcome contributions to MCP Watchtower! Please review these guidelines before submitting a pull request.

---

## 🛠️ Development Workflow

### Prerequisites
- Node.js >= 20 (Node 22 or 26 recommended)
- npm >= 10
- Visual Studio Code or Google Antigravity IDE

### Setup
```bash
git clone https://github.com/surajjaiswal/mcp-watchtower.git
cd mcp-watchtower
npm install
```

### Build & Watch
```bash
# Production bundle
npm run build

# Watch mode during active extension debugging
npm run watch
```

### Running Tests
```bash
# Typecheck
npm run typecheck

# Run test suite with Vitest
npm run test

# Run linter
npm run lint
```

### Packaging VSIX
```bash
npm run package
```

---

## 📜 Coding Guidelines

1. **Lazy Senior Dev Mode**: Write the minimum clean code that works. Avoid unnecessary abstractions and bloated dependencies.
2. **Security First**: Never log or expose credentials. Always validate untrusted input at trust boundaries.
3. **Evidence-Based Reporting**: Never fake connection health or claim IDE runtime state without verification.
4. **Clean Architecture**: Keep MCP SDK adapters isolated from domain models and UI view models.

