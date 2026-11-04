import {
  DashboardViewModel,
  HostToWebviewMessage,
  ServerViewModel,
  WebviewToHostMessage,
} from '../messages/types.js';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

let currentViewModel: DashboardViewModel | null = null;
let currentSearchTerm = '';
const expandedServerIds = new Set<string>();

// Utility: Safe HTML escaping
function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function initDashboard(): void {
  // Bind Header Buttons
  document.getElementById('btnRefreshAll')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'refreshAll' });
  });

  document.getElementById('btnToggleMonitoring')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'toggleMonitoring' });
  });

  document.getElementById('btnSettings')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openSettings' });
  });

  document.getElementById('btnCopyReport')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'copyReport' });
  });

  // Search input
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  searchInput?.addEventListener('input', (e: Event) => {
    currentSearchTerm = (e.target as HTMLInputElement).value.toLowerCase().trim();
    renderServerList();
  });

  // Listen for messages from extension host
  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as HostToWebviewMessage;
    if (msg.type === 'STATE_UPDATE') {
      currentViewModel = msg.payload;
      updateUI();
    }
  });

  // Notify extension that webview is ready
  vscode.postMessage({ command: 'ready' });
}

function updateUI(): void {
  if (!currentViewModel) return;

  // 1. Update summary counters
  const { summary, monitoringEnabled, lastRefreshed, version } = currentViewModel;

  const totalEl = document.getElementById('summaryTotal');
  const healthyEl = document.getElementById('summaryHealthy');
  const degradedEl = document.getElementById('summaryDegraded');
  const errorEl = document.getElementById('summaryError');
  const unknownEl = document.getElementById('summaryUnknown');

  if (totalEl) totalEl.textContent = String(summary.total);
  if (healthyEl) healthyEl.textContent = String(summary.healthy);
  if (degradedEl) degradedEl.textContent = String(summary.degraded);
  if (errorEl) errorEl.textContent = String(summary.disconnected);
  if (unknownEl) unknownEl.textContent = String(summary.unknown);

  // 2. Update monitoring badge
  const badgeEl = document.getElementById('monitoringBadge');
  const toggleBtn = document.getElementById('btnToggleMonitoring');
  if (badgeEl) {
    if (monitoringEnabled) {
      badgeEl.className = 'badge active';
      badgeEl.textContent = 'Monitoring: Active';
    } else {
      badgeEl.className = 'badge paused';
      badgeEl.textContent = 'Monitoring: Paused';
    }
  }
  if (toggleBtn) {
    toggleBtn.textContent = monitoringEnabled ? 'Pause' : 'Resume';
  }

  // 3. Update footer
  const footerTimeEl = document.getElementById('lastRefreshedTime');
  const versionEl = document.getElementById('extensionVersion');
  if (footerTimeEl) {
    footerTimeEl.textContent = lastRefreshed ? new Date(lastRefreshed).toLocaleTimeString() : 'Never';
  }
  if (versionEl) {
    versionEl.textContent = version;
  }

  // 4. Render Server List
  renderServerList();
}

function renderServerList(): void {
  const container = document.getElementById('serverListContainer');
  if (!container || !currentViewModel) return;

  const servers = currentViewModel.servers.filter((s) => {
    if (!currentSearchTerm) return true;
    const nameMatch = s.definition.name.toLowerCase().includes(currentSearchTerm);
    const transportMatch = s.definition.transport.toLowerCase().includes(currentSearchTerm);
    const sourceMatch = s.definition.source.toLowerCase().includes(currentSearchTerm);
    return nameMatch || transportMatch || sourceMatch;
  });

  if (servers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>No MCP Servers Match Filter</h2>
        <p>Try clearing your search query or check your mcp_config.json configuration.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  for (const s of servers) {
    const card = createServerCardElement(s);
    container.appendChild(card);
  }
}

function createServerCardElement(server: ServerViewModel): HTMLElement {
  const { definition, health, capabilities } = server;
  const isExpanded = expandedServerIds.has(definition.id);
  const state = health?.state || 'UNKNOWN';

  const card = document.createElement('div');
  card.className = `server-card ${isExpanded ? 'expanded' : ''}`;
  card.dataset.id = definition.id;

  const latencyText = health?.latencyMs !== undefined ? `${health.latencyMs}ms` : '';

  card.innerHTML = `
    <div class="server-header" role="button" tabindex="0" aria-expanded="${isExpanded}">
      <div class="server-title">
        <span class="status-dot ${state}" title="State: ${state}"></span>
        <span class="server-name">${escapeHtml(definition.name)}</span>
        <div class="server-meta-tags">
          <span class="tag">${escapeHtml(definition.transport)}</span>
          <span class="tag">${escapeHtml(definition.source)}</span>
        </div>
      </div>
      <div class="server-status-pill">
        <span class="status-text">${escapeHtml(state)}</span>
        ${latencyText ? `<span class="latency">(${latencyText})</span>` : ''}
        <button class="btn-action primary btn-connect-header" data-id="${escapeHtml(definition.id)}" title="Connect or verify this MCP server">Connect</button>
      </div>
    </div>
    <div class="server-details">
      <div class="detail-grid">
        <div class="detail-label">Status Reason:</div>
        <div class="detail-value">${escapeHtml(health?.reason || 'Pending check')}</div>

        <div class="detail-label">Evidence Source:</div>
        <div class="detail-value">${escapeHtml(health?.evidenceSource || 'None')}</div>

        <div class="detail-label">Config Path:</div>
        <div class="detail-value">${escapeHtml(definition.configurationPath)}</div>

        <div class="detail-label">IDE Runtime:</div>
        <div class="detail-value">${escapeHtml(health?.ideRuntimeStatus || 'NOT_EXPOSED')}</div>

        <div class="detail-label">Last Checked:</div>
        <div class="detail-value">${health?.checkedAt ? escapeHtml(new Date(health.checkedAt).toLocaleString()) : 'Never'}</div>
      </div>

      ${capabilities ? `
        <div class="capabilities-box">
          <div class="capabilities-header">Advertised Capabilities</div>
          <div>Tools: <strong>${capabilities.toolsCount ?? 0}</strong> | Prompts: <strong>${capabilities.promptsCount ?? 0}</strong> | Resources: <strong>${capabilities.resourcesCount ?? 0}</strong></div>
          ${capabilities.serverInfo ? `<div>Server: ${escapeHtml(capabilities.serverInfo.name)} (v${escapeHtml(capabilities.serverInfo.version || '1.0')})</div>` : ''}
        </div>
      ` : ''}

      <div class="card-actions">
        <button class="btn-action primary btn-connect-card" data-id="${escapeHtml(definition.id)}">
          <span>⚡ Connect Server</span>
        </button>
        <button class="btn-action btn-refresh-server" data-id="${escapeHtml(definition.id)}">Refresh</button>
        ${definition.transport === 'stdio' ? `
          <button class="btn-action btn-run-stdio" data-id="${escapeHtml(definition.id)}">Run Diagnostic Check</button>
        ` : ''}
        <button class="btn-action btn-copy-server" data-id="${escapeHtml(definition.id)}">Copy Diagnostics</button>
      </div>
    </div>
  `;

  // Toggle expansion
  const header = card.querySelector('.server-header');
  header?.addEventListener('click', () => {
    if (expandedServerIds.has(definition.id)) {
      expandedServerIds.delete(definition.id);
      card.classList.remove('expanded');
    } else {
      expandedServerIds.add(definition.id);
      card.classList.add('expanded');
    }
  });

  // Action buttons
  card.querySelector('.btn-connect-header')?.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    vscode.postMessage({ command: 'connectServer', serverId: definition.id });
  });

  card.querySelector('.btn-connect-card')?.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    vscode.postMessage({ command: 'connectServer', serverId: definition.id });
  });

  card.querySelector('.btn-refresh-server')?.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    vscode.postMessage({ command: 'refreshServer', serverId: definition.id });
  });

  card.querySelector('.btn-run-stdio')?.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    vscode.postMessage({ command: 'runStdioDiagnostic', serverId: definition.id });
  });

  card.querySelector('.btn-copy-server')?.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    vscode.postMessage({ command: 'copyReport', serverId: definition.id });
  });

  return card;
}

// Start
document.addEventListener('DOMContentLoaded', initDashboard);
