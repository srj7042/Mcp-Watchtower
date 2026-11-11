/**
 * Standalone Floating Desktop HUD HTML Template.
 * Provides a lightweight, always-visible floating desktop window (Always-On-Top via Document PiP)
 * for Windows, macOS, and Linux.
 */

export function renderFloatingHudHtml(port: number, authToken: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Watchtower - Floating Desktop HUD</title>
  <style>
    :root {
      --bg-primary: #18181b;
      --bg-secondary: #27272a;
      --bg-card: #1f1f23;
      --border-color: #3f3f46;
      --text-main: #f4f4f5;
      --text-muted: #a1a1aa;
      --accent: #38bdf8;
      --healthy: #10b981;
      --degraded: #f59e0b;
      --error: #ef4444;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-main);
      font-family: var(--font-family);
      font-size: 12px;
      overflow: hidden;
      padding: 10px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .hud-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    }

    /* Header */
    .hud-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 6px;
    }

    .hud-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--text-main);
    }

    .model-badge {
      font-size: 10px;
      font-weight: 600;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }

    .btn-pip {
      background: var(--bg-secondary);
      color: var(--text-main);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    }

    .btn-pip:hover {
      background: var(--accent);
      color: #000;
      border-color: var(--accent);
    }

    .btn-pip.active {
      background: var(--healthy);
      color: #000;
      border-color: var(--healthy);
    }

    /* Progress Section */
    .section-block {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .block-labels {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--text-muted);
      font-weight: 500;
    }

    .block-labels strong {
      color: var(--text-main);
    }

    .progress-track {
      width: 100%;
      height: 7px;
      background: var(--bg-secondary);
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .progress-fill {
      height: 100%;
      width: 0%;
      background: var(--healthy);
      border-radius: 4px;
      transition: width 0.3s ease, background 0.3s ease;
    }

    .progress-fill.degraded {
      background: var(--degraded);
    }

    .progress-fill.error {
      background: var(--error);
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }

    .metric-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 5px 6px;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .metric-title {
      font-size: 9px;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
    }

    .metric-value {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
      font-family: ui-monospace, monospace;
    }

    .metric-cost {
      font-size: 9px;
      color: var(--accent);
      font-family: ui-monospace, monospace;
    }

    /* Footer Ticker */
    .hud-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--border-color);
      padding-top: 5px;
      font-size: 10px;
      color: var(--text-muted);
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--healthy);
      display: inline-block;
      margin-right: 4px;
    }

    .status-dot.disconnected {
      background: var(--error);
    }

    .ticker-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 250px;
      font-family: ui-monospace, monospace;
      font-size: 9.5px;
    }
  </style>
</head>
<body>

  <div id="hudContainer" class="hud-container">
    <!-- Header -->
    <div class="hud-header">
      <div class="hud-title">
        <span>🛡️ Watchtower HUD</span>
      </div>
      <span id="modelBadge" class="model-badge">Gemini 3.8 Flash (Active)</span>
      <button id="btnPip" class="btn-pip" onclick="togglePictureInPicture()" title="Float on top of all desktop windows (Always on Top)">
        📌 Float On Top
      </button>
    </div>

    <!-- Live Context Window Utilization -->
    <div class="section-block">
      <div class="block-labels">
        <span>Context Utilization (<span id="modelLimit">1,000,000</span> max)</span>
        <strong id="contextPercent">0.00%</strong>
      </div>
      <div class="progress-track">
        <div id="contextFill" class="progress-fill" style="width: 0%;"></div>
      </div>
    </div>

    <!-- Tripartite Metrics Grid -->
    <div class="metrics-grid">
      <div class="metric-card">
        <span class="metric-title">Draft Estimate</span>
        <span id="metricDraft" class="metric-value">0</span>
        <span class="metric-cost">in-flight</span>
      </div>
      <div class="metric-card">
        <span class="metric-title">Request Total</span>
        <span id="metricRequest" class="metric-value">0</span>
        <span class="metric-cost">with context</span>
      </div>
      <div class="metric-card">
        <span class="metric-title">Actual Reported</span>
        <span id="metricActual" class="metric-value">0</span>
        <span id="metricCost" class="metric-cost">$0.0000</span>
      </div>
    </div>

    <!-- MCP Fleet Availability -->
    <div class="section-block">
      <div class="block-labels">
        <span>MCP Fleet Operational Health</span>
        <strong id="mcpPercent">100% Operational</strong>
      </div>
      <div class="progress-track">
        <div id="mcpFill" class="progress-fill" style="width: 100%;"></div>
      </div>
    </div>

    <!-- Footer Activity Ticker -->
    <div class="hud-footer">
      <div style="display: flex; align-items: center;">
        <span id="statusDot" class="status-dot"></span>
        <span id="wsStatus">Live Connected</span>
      </div>
      <span id="statusTicker" class="ticker-text">Monitoring active editor typing & Antigravity...</span>
    </div>
  </div>

  <script>
    const PORT = ${port};
    const AUTH_TOKEN = "${authToken}";
    let ws = null;
    let pipWindow = null;

    const MODEL_LIMITS = {
      'gemini-3.8-flash': 1000000,
      'gemini-3.0-flash': 1000000,
      'gemini-2.0-flash': 1000000,
      'gemini-1.5-flash': 1000000,
      'gemini-1.5-pro': 2000000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'o1': 200000,
      'claude-3-7-sonnet': 200000,
      'claude-3-5-sonnet': 200000,
      'claude-3-5-haiku': 200000,
      'claude-3-opus': 200000,
      'deepseek': 64000,
    };

    function updateUI(state) {
      if (!state) return;

      const model = state.targetModel || 'gemini-3.8-flash';
      const draftTokens = state.draftTokens || 0;
      const requestTokens = state.requestTokens || (draftTokens > 0 ? draftTokens + 45 : 0);
      const actualTokens = state.actualTokens || 0;
      const cost = state.totalCostUsd || 0;

      // 1. Model Badge
      const modelBadge = document.getElementById('modelBadge');
      if (modelBadge) {
        if (model.includes('3.8')) modelBadge.textContent = 'Gemini 3.8 Flash';
        else if (model.includes('gemini')) modelBadge.textContent = 'Gemini Flash';
        else modelBadge.textContent = model;
      }

      // 2. Context Window Progress Bar
      let maxLimit = MODEL_LIMITS[model] || 1000000;
      const usedTokens = requestTokens > 0 ? requestTokens : draftTokens;
      const pct = Math.min(100, (usedTokens / maxLimit) * 100);

      const limitEl = document.getElementById('modelLimit');
      const pctEl = document.getElementById('contextPercent');
      const fillEl = document.getElementById('contextFill');

      if (limitEl) limitEl.textContent = maxLimit.toLocaleString();
      if (pctEl) pctEl.textContent = pct.toFixed(2) + '%';
      if (fillEl) {
        fillEl.style.width = Math.max(usedTokens > 0 ? 1 : 0, pct) + '%';
        fillEl.className = 'progress-fill ' + (pct > 85 ? 'error' : pct > 60 ? 'degraded' : '');
      }

      // 3. Metrics Cards
      const draftEl = document.getElementById('metricDraft');
      const reqEl = document.getElementById('metricRequest');
      const actEl = document.getElementById('metricActual');
      const costEl = document.getElementById('metricCost');

      if (draftEl) draftEl.textContent = draftTokens.toLocaleString();
      if (reqEl) reqEl.textContent = requestTokens.toLocaleString();
      if (actEl) actEl.textContent = actualTokens.toLocaleString();
      if (costEl) costEl.textContent = '$' + cost.toFixed(4);

      // 4. MCP Fleet
      const total = state.mcpTotal || 0;
      const healthy = state.mcpHealthy || 0;
      const mcpPercent = total > 0 ? Math.round((healthy / total) * 100) : 100;

      const mcpLabel = document.getElementById('mcpPercent');
      const mcpFill = document.getElementById('mcpFill');
      if (mcpLabel) {
        mcpLabel.textContent = total > 0 ? mcpPercent + '% (' + healthy + '/' + total + ' Healthy)' : '100% Operational';
      }
      if (mcpFill) {
        mcpFill.style.width = mcpPercent + '%';
        mcpFill.className = 'progress-fill ' + (mcpPercent < 50 ? 'error' : mcpPercent < 80 ? 'degraded' : '');
      }

      // 5. Status Ticker
      const tickerEl = document.getElementById('statusTicker');
      if (tickerEl && state.lastEvent) {
        tickerEl.textContent = state.lastEvent;
      }
    }

    // Connect WebSocket
    function connectWebSocket() {
      const url = 'ws://127.0.0.1:' + PORT + '/events?token=' + AUTH_TOKEN;
      ws = new WebSocket(url);

      ws.onopen = () => {
        document.getElementById('statusDot')?.classList.remove('disconnected');
        document.getElementById('wsStatus').textContent = 'Live Connected';
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'STATE_UPDATE') {
            updateUI(msg.payload);
          } else if (msg.eventType) {
            fetchState(); // Quick sync on raw event
          }
        } catch (e) {
          // ignore parsing error
        }
      };

      ws.onclose = () => {
        document.getElementById('statusDot')?.classList.add('disconnected');
        document.getElementById('wsStatus').textContent = 'Reconnecting...';
        setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    // Fallback polling for maximum reliability across OS
    async function fetchState() {
      try {
        const res = await fetch('/api/state?token=' + AUTH_TOKEN);
        if (res.ok) {
          const state = await res.json();
          updateUI(state);
        }
      } catch (e) {
        // ignore network drop
      }
    }

    // Document Picture-in-Picture for native Always-On-Top floating window
    async function togglePictureInPicture() {
      const container = document.getElementById('hudContainer');
      const btn = document.getElementById('btnPip');

      if ('documentPictureInPicture' in window) {
        if (window.documentPictureInPicture.window) {
          window.documentPictureInPicture.window.close();
          return;
        }

        try {
          pipWindow = await window.documentPictureInPicture.requestWindow({
            width: 380,
            height: 270,
          });

          // Copy styles into PiP window
          document.querySelectorAll('style, link[rel="stylesheet"]').forEach((s) => {
            pipWindow.document.head.appendChild(s.cloneNode(true));
          });

          // Move HUD inside PiP window
          pipWindow.document.body.appendChild(container);
          btn.textContent = '📌 Return to Tab';
          btn.classList.add('active');

          pipWindow.addEventListener('pagehide', () => {
            document.body.appendChild(container);
            btn.textContent = '📌 Float On Top';
            btn.classList.remove('active');
            pipWindow = null;
          });
        } catch (err) {
          console.warn('PiP launch error:', err);
          fallbackFloatingWindow();
        }
      } else {
        fallbackFloatingWindow();
      }
    }

    function fallbackFloatingWindow() {
      window.open(window.location.href, 'MCP_Watchtower_HUD', 'width=380,height=270,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
    }

    // Init
    connectWebSocket();
    fetchState();
    setInterval(fetchState, 1500);
  </script>
</body>
</html>`;
}

