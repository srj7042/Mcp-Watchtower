import {
  DashboardViewModel,
  HostToWebviewMessage,
  ServerViewModel,
  WebviewToHostMessage,
  AdapterViewModel,
  AgentObservabilityViewModel,
} from '../messages/types.js';
import { ObservabilityEvent } from '../../observability/events.js';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

let currentViewModel: DashboardViewModel | null = null;
let currentSearchTerm = '';
let currentActiveTab = 'overview';
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

// Client-side quick tokenizer estimation for interactive playground
function estimateTokensClient(text: string, _model?: string): number {
  if (!text || text.length === 0) return 0;
  const isCode = /[{}[\]();=><+*\\_#-]/.test(text) || /\b(function|const|let|var|class|import|def)\b/.test(text);
  const charsPerToken = isCode ? 3.5 : 4.0;
  const words = text.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const word of words) {
    if (word.length <= 5) count += 1;
    else count += Math.max(1, Math.ceil(word.length / charsPerToken));
  }
  const indentation = (text.match(/ {4}|\t/g) || []).length;
  count += indentation;
  return Math.max(1, count);
}

function calculateCostClient(tokens: number, model: string): number {
  let ratePerMillion = 2.50; // default GPT-4o
  const m = model.toLowerCase();
  if (m.includes('gpt-4o-mini')) ratePerMillion = 0.15;
  else if (m.includes('o1-mini')) ratePerMillion = 3.00;
  else if (m.includes('o1')) ratePerMillion = 15.00;
  else if (m.includes('claude-3-7') || m.includes('claude-3-5-sonnet')) ratePerMillion = 3.00;
  else if (m.includes('claude-3-5-haiku')) ratePerMillion = 0.80;
  else if (m.includes('opus')) ratePerMillion = 15.00;
  else if (m.includes('gemini') && m.includes('flash')) ratePerMillion = 0.10;
  else if (m.includes('gemini') && m.includes('pro')) ratePerMillion = 1.25;
  else if (m.includes('deepseek')) ratePerMillion = 0.14;
  return (tokens / 1_000_000) * ratePerMillion;
}

function updatePersistentLiveBar(
  model: string,
  draftTokens: number,
  requestTokens: number,
  actualTokens: number,
  cost: number,
  mcpSummary?: { total: number; healthy: number }
): void {
  const modelBadge = document.getElementById('liveBarModelBadge');
  const draftEl = document.getElementById('liveBarDraft');
  const requestEl = document.getElementById('liveBarRequest');
  const actualEl = document.getElementById('liveBarActual');
  const costEl = document.getElementById('liveBarCost');
  const mcpLabel = document.getElementById('liveBarMcpHealth');

  const contextLimitEl = document.getElementById('liveBarContextLimit');
  const contextPercentEl = document.getElementById('liveBarContextPercent');
  const contextBarEl = document.getElementById('liveBarContextProgress');

  if (modelBadge) {
    if (model.includes('3.8')) modelBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> Google Gemini 3.8 Flash (Active)`;
    else if (model.includes('3.0')) modelBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> Google Gemini 3.0 Flash`;
    else if (model.includes('gemini')) modelBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> Google Gemini Flash`;
    else modelBadge.textContent = model;
  }

  if (draftEl) draftEl.textContent = draftTokens.toLocaleString();
  if (requestEl) requestEl.textContent = requestTokens.toLocaleString();
  if (actualEl) actualEl.textContent = actualTokens.toLocaleString();
  if (costEl) costEl.textContent = `$${cost.toFixed(6)}`;

  if (mcpSummary && mcpLabel) {
    const total = mcpSummary.total;
    const healthy = mcpSummary.healthy;
    const pct = total > 0 ? Math.round((healthy / total) * 100) : 100;
    mcpLabel.textContent = `${pct}% Operational (${healthy}/${total} Healthy)`;
  }

  const contextLimits: Record<string, number> = {
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
  let maxLimit = contextLimits[model];
  if (!maxLimit) {
    const m = model.toLowerCase();
    if (m.includes('gemini') && m.includes('pro')) maxLimit = 2000000;
    else if (m.includes('gemini')) maxLimit = 1000000;
    else if (m.includes('claude') || m.includes('o1')) maxLimit = 200000;
    else maxLimit = 128000;
  }

  const usedTokens = requestTokens > 0 ? requestTokens : draftTokens;
  const percent = Math.min(100, (usedTokens / maxLimit) * 100);

  if (contextLimitEl) contextLimitEl.textContent = maxLimit.toLocaleString();
  if (contextPercentEl) contextPercentEl.textContent = `${percent.toFixed(2)}%`;
  if (contextBarEl) {
    contextBarEl.style.width = `${Math.max(usedTokens > 0 ? 1 : 0, percent)}%`;
    contextBarEl.className = `live-bar-fill ${percent > 85 ? 'error' : percent > 60 ? 'degraded' : 'healthy'}`;
  }
}

function initDashboard(): void {
  // 1. Tab Navigation
  const tabButtons = document.querySelectorAll('.nav-tab');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // 2. Bind Header Buttons
  document.getElementById('btnRefreshAll')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'refreshAll' });
  });

  document.getElementById('btnFloatingWindow')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openFloatingWindow' });
  });

  document.getElementById('btnToggleMonitoring')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'toggleMonitoring' });
  });

  document.getElementById('btnCopyReport')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'copyReport' });
  });

  document.getElementById('btnOpenVsCodeSettings')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'openSettings' });
  });

  document.getElementById('btnClearHistory')?.addEventListener('click', () => {
    vscode.postMessage({ command: 'clearHistory' });
  });

  // 3. Search input (MCP servers)
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  searchInput?.addEventListener('input', (e: Event) => {
    currentSearchTerm = (e.target as HTMLInputElement).value.toLowerCase().trim();
    renderServerList();
  });

  // 4. Interactive Live Draft Input
  const draftArea = document.getElementById('liveDraftInput') as HTMLTextAreaElement | null;
  const modelPicker = document.getElementById('selectModel') as HTMLSelectElement | null;

  function updateLiveMeter(): void {
    const text = draftArea?.value || '';
    const model = modelPicker?.value || 'gemini-3.8-flash';
    const draftTokens = estimateTokensClient(text, model);
    const requestTokens = draftTokens > 0 ? draftTokens + 45 : 0; // Simulated context overhead
    const cost = calculateCostClient(draftTokens, model);

    const meterDraftEl = document.getElementById('meterDraftTokens');
    const meterRequestEl = document.getElementById('meterRequestTokens');
    const meterCostEl = document.getElementById('meterDraftCost');

    if (meterDraftEl) meterDraftEl.textContent = String(draftTokens);
    if (meterRequestEl) meterRequestEl.textContent = String(requestTokens);
    if (meterCostEl) meterCostEl.textContent = `$${cost.toFixed(6)}`;

    // Update Context Window Progress Bar
    const contextLimits: Record<string, number> = {
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
    let maxLimit = contextLimits[model];
    if (!maxLimit) {
      const m = model.toLowerCase();
      if (m.includes('gemini') && m.includes('pro')) maxLimit = 2000000;
      else if (m.includes('gemini')) maxLimit = 1000000;
      else if (m.includes('claude') || m.includes('o1')) maxLimit = 200000;
      else maxLimit = 128000;
    }
    const usedTokens = requestTokens > 0 ? requestTokens : draftTokens;
    const percent = Math.min(100, (usedTokens / maxLimit) * 100);

    const limitEl = document.getElementById('modelContextLimit');
    const percentEl = document.getElementById('contextPercentLabel');
    const barEl = document.getElementById('contextProgressBar');

    if (limitEl) limitEl.textContent = maxLimit.toLocaleString();
    if (percentEl) percentEl.textContent = `${percent.toFixed(2)}%`;
    if (barEl) {
      barEl.style.width = `${Math.max(usedTokens > 0 ? 1 : 0, percent)}%`;
      barEl.className = `progress-bar-fill ${percent > 85 ? 'error' : percent > 60 ? 'degraded' : 'healthy'}`;
    }

    // Sync Top Persistent Live Bar
    updatePersistentLiveBar(model, draftTokens, requestTokens, 0, cost);
  }

  draftArea?.addEventListener('input', updateLiveMeter);
  modelPicker?.addEventListener('change', () => {
    updateLiveMeter();
    if (modelPicker) {
      vscode.postMessage({ command: 'setTargetModel', model: modelPicker.value });
    }
  });

  // 5. Listen for messages from extension host
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

function switchTab(tabId: string): void {
  currentActiveTab = tabId;

  // Update tab buttons
  document.querySelectorAll('.nav-tab').forEach((b) => {
    if ((b as HTMLElement).dataset.tab === currentActiveTab) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach((p) => {
    if (p.id === `tab-${tabId}`) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  vscode.postMessage({ command: 'changeTab', tab: tabId });
}

function updateUI(): void {
  if (!currentViewModel) return;

  const { summary, monitoringEnabled, lastRefreshed, version, observability } = currentViewModel;

  // 1. Update MCP summary counters
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

  // Update MCP Fleet Health Progress Bar
  const mcpPercent = summary.total > 0 ? Math.round((summary.healthy / summary.total) * 100) : 0;
  const mcpBar = document.getElementById('mcpHealthProgressBar');
  const mcpLabel = document.getElementById('mcpHealthPercentLabel');
  if (mcpBar) {
    mcpBar.style.width = `${mcpPercent}%`;
    mcpBar.className = `progress-bar-fill ${mcpPercent >= 80 ? 'healthy' : mcpPercent >= 50 ? 'degraded' : 'error'}`;
  }
  if (mcpLabel) {
    mcpLabel.textContent = `${mcpPercent}% Operational (${summary.healthy}/${summary.total} Healthy)`;
  }

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

  // 4. Update Overview KPIs
  const kpiMcpCount = document.getElementById('kpiMcpCount');
  const kpiMcpHealthy = document.getElementById('kpiMcpHealthy');
  const kpiActiveAgents = document.getElementById('kpiActiveAgents');
  const kpiDraftTokens = document.getElementById('kpiDraftTokens');
  const kpiActualTokens = document.getElementById('kpiActualTokens');
  const kpiTotalCost = document.getElementById('kpiTotalCost');

  if (kpiMcpCount) kpiMcpCount.textContent = `${summary.healthy} / ${summary.total}`;
  if (kpiMcpHealthy) kpiMcpHealthy.textContent = `${summary.healthy} Verified Healthy`;

  if (observability) {
    const activeCount = observability.adapters.filter((a) => a.status === 'ACTIVE').length;
    if (kpiActiveAgents) kpiActiveAgents.textContent = String(activeCount);
    if (kpiDraftTokens) kpiDraftTokens.textContent = String(observability.tokenSummary.totalDraftTokens);
    if (kpiActualTokens) kpiActualTokens.textContent = String(observability.tokenSummary.totalActualTokens);
    if (kpiTotalCost) kpiTotalCost.textContent = `$${observability.tokenSummary.totalCostUsd.toFixed(4)}`;

    // Update Persistent Top Live Bar
    const liveModel = observability.liveTokens?.targetModel || 'gemini-3.8-flash';
    const draft = observability.tokenSummary.totalDraftTokens;
    const req = observability.tokenSummary.totalRequestTokens;
    const act = observability.tokenSummary.totalActualTokens;
    const cost = observability.tokenSummary.totalCostUsd;
    updatePersistentLiveBar(liveModel, draft, req, act, cost, summary);

    // Render Overview lists
    renderOverviewAgents(observability.adapters);
    renderOverviewEvents(observability.recentEvents);

    // Sync Target Model picker if updated from backend
    if (observability.liveTokens?.targetModel) {
      const target = observability.liveTokens.targetModel;
      const picker = document.getElementById('selectModel') as HTMLSelectElement | null;
      if (picker && picker.value !== target) {
        const optionExists = Array.from(picker.options).some((o) => o.value === target);
        if (optionExists) {
          picker.value = target;
        } else {
          const opt = document.createElement('option');
          opt.value = target;
          opt.textContent = target;
          opt.selected = true;
          picker.appendChild(opt);
        }
      }
    }

    // Render Agent Monitor tab
    renderAgentCards(observability.adapters);

    // Render Token Analytics tab
    renderTokenAnalytics(observability);

    // Render Cost Intelligence tab
    renderCostIntelligence(observability);

    // Render Execution History tab
    renderExecutionHistory(observability.recentEvents);

    // Render Adapter Management tab
    renderAdapterManagement(observability.adapters);
  }

  // 5. Render MCP Server List (Preserved)
  renderServerList();
}

function renderOverviewAgents(adapters: AdapterViewModel[]): void {
  const container = document.getElementById('overviewAgentsList');
  if (!container) return;
  container.innerHTML = '';

  for (const a of adapters) {
    const item = document.createElement('div');
    item.className = 'compact-list-item';
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(a.name)}</strong>
        <span class="server-meta">(${escapeHtml(a.vendor)})</span>
      </div>
      <span class="badge ${a.status.toLowerCase()}">${escapeHtml(a.status)}</span>
    `;
    container.appendChild(item);
  }
}

function renderOverviewEvents(events: ObservabilityEvent[]): void {
  const container = document.getElementById('overviewRecentEvents');
  if (!container) return;
  container.innerHTML = '';

  if (!events || events.length === 0) {
    container.innerHTML = '<div class="server-meta">No observability events recorded yet.</div>';
    return;
  }

  for (const ev of events.slice(0, 6)) {
    const item = document.createElement('div');
    item.className = 'compact-list-item';
    const time = new Date(ev.timestamp).toLocaleTimeString();
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(ev.agentName)}</strong>
        <span class="server-meta">${escapeHtml(ev.eventType)}</span>
      </div>
      <span class="server-meta">${escapeHtml(time)}</span>
    `;
    container.appendChild(item);
  }
}

function renderAgentCards(adapters: AdapterViewModel[]): void {
  const container = document.getElementById('agentCardsContainer');
  if (!container) return;
  container.innerHTML = '';

  for (const a of adapters) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    const caps = a.capabilities || {};

    card.innerHTML = `
      <div class="agent-card-header">
        <div>
          <div class="agent-card-title">${escapeHtml(a.name)}</div>
          <div class="agent-card-vendor">${escapeHtml(a.vendor)}</div>
        </div>
        <span class="badge ${a.status.toLowerCase()}">${escapeHtml(a.status)}</span>
      </div>
      <div class="agent-desc">${escapeHtml(a.healthMessage || 'Operational')}</div>
      <div class="server-meta">Capture Method: <strong>${escapeHtml(caps.captureMethod || 'MANUAL')}</strong></div>
      <div class="agent-caps-list">
        <span class="cap-pill ${caps.supportsDraftTracking ? 'supported' : 'unsupported'}">Draft Typing</span>
        <span class="cap-pill ${caps.supportsPromptInterception ? 'supported' : 'unsupported'}">Prompt Intercept</span>
        <span class="cap-pill ${caps.supportsExecutionTracking ? 'supported' : 'unsupported'}">Exec Tracking</span>
        <span class="cap-pill ${caps.supportsToolCallInterception ? 'supported' : 'unsupported'}">Tool Calls</span>
        <span class="cap-pill ${caps.reportsExactTokenMetrics ? 'supported' : 'unsupported'}">Exact Metrics</span>
      </div>
    `;
    container.appendChild(card);
  }
}

function renderTokenAnalytics(obs: AgentObservabilityViewModel): void {
  const draftTotalEl = document.getElementById('analyticsDraftTotal');
  const requestTotalEl = document.getElementById('analyticsRequestTotal');
  const actualTotalEl = document.getElementById('analyticsActualTotal');
  const modelListEl = document.getElementById('analyticsModelList');

  if (draftTotalEl) draftTotalEl.textContent = String(obs.tokenSummary.totalDraftTokens);
  if (requestTotalEl) requestTotalEl.textContent = String(obs.tokenSummary.totalRequestTokens);
  if (actualTotalEl) actualTotalEl.textContent = String(obs.tokenSummary.totalActualTokens);

  // Update Stacked Token Class Bar
  const d = obs.tokenSummary.totalDraftTokens;
  const r = obs.tokenSummary.totalRequestTokens;
  const a = obs.tokenSummary.totalActualTokens;
  const sum = d + r + a;
  const dPct = sum > 0 ? (d / sum) * 100 : 0;
  const rPct = sum > 0 ? (r / sum) * 100 : 0;
  const aPct = sum > 0 ? (a / sum) * 100 : 0;

  const barDraft = document.getElementById('barDraftFill');
  const barReq = document.getElementById('barRequestFill');
  const barAct = document.getElementById('barActualFill');
  const classLabel = document.getElementById('classDistributionLabel');

  if (barDraft) barDraft.style.width = `${dPct}%`;
  if (barReq) barReq.style.width = `${rPct}%`;
  if (barAct) barAct.style.width = `${aPct}%`;
  if (classLabel) classLabel.textContent = `${aPct.toFixed(1)}% Verified Actuals`;

  if (modelListEl) {
    modelListEl.innerHTML = '';
    const byModel = obs.tokenSummary.byModel || {};
    const keys = Object.keys(byModel);

    if (keys.length === 0) {
      modelListEl.innerHTML = '<div class="server-meta">No reported usage by model yet.</div>';
    } else {
      for (const m of keys) {
        const item = document.createElement('div');
        item.className = 'compact-list-item';
        item.innerHTML = `
          <strong>${escapeHtml(m)}</strong>
          <div>
            <span>${byModel[m].actualTokens} tokens</span>
            <span class="badge">$${byModel[m].costUsd.toFixed(4)}</span>
          </div>
        `;
        modelListEl.appendChild(item);
      }
    }
  }
}

function renderCostIntelligence(obs: AgentObservabilityViewModel): void {
  const costTotalEl = document.getElementById('costTotalValue');
  const costSavingsEl = document.getElementById('costSavingsValue');

  if (costTotalEl) {
    costTotalEl.textContent = `$${obs.tokenSummary.totalCostUsd.toFixed(6)}`;
  }
  if (costSavingsEl) {
    // Calculate estimated savings from caching
    const savings = obs.tokenSummary.totalActualTokens > 0 ? (obs.tokenSummary.totalCostUsd * 0.25) : 0;
    costSavingsEl.textContent = `$${savings.toFixed(6)}`;
  }
}

function renderExecutionHistory(events: ObservabilityEvent[]): void {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  if (!events || events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No execution records recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  for (const ev of events) {
    const row = document.createElement('tr');
    const time = new Date(ev.timestamp).toLocaleTimeString();
    let details = '';

    if (ev.eventType === 'agent:token_usage') {
      const usage = ev;
      details = `Tokens: ${usage.totalTokens} (${usage.source}) | Cost: $${(usage.estimatedCostUsd || 0).toFixed(4)}`;
    } else if (ev.eventType === 'agent:tool_call') {
      const tc = ev;
      details = `Tool: ${tc.toolName} (${tc.status}) [${tc.durationMs || 0}ms]`;
    } else if (ev.eventType === 'agent:prompt') {
      const pr = ev;
      details = `Prompt chars: ${pr.promptTextLength} | Model: ${pr.model}`;
    } else if (ev.eventType === 'agent:execution') {
      const ex = ev;
      details = `Status: ${ex.status} | Model: ${ex.model} [${ex.durationMs || 0}ms]`;
    } else {
      details = ev.sessionId;
    }

    row.innerHTML = `
      <td>${escapeHtml(time)}</td>
      <td><strong>${escapeHtml(ev.agentName)}</strong></td>
      <td><span class="badge">${escapeHtml(ev.eventType)}</span></td>
      <td><code>${escapeHtml(ev.sessionId.substring(0, 16))}</code></td>
      <td>${escapeHtml(details)}</td>
    `;
    tbody.appendChild(row);
  }
}

function renderAdapterManagement(adapters: AdapterViewModel[]): void {
  const container = document.getElementById('adapterManagementList');
  if (!container) return;
  container.innerHTML = '';

  for (const a of adapters) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.innerHTML = `
      <div class="agent-card-header">
        <div>
          <div class="agent-card-title">${escapeHtml(a.name)}</div>
          <div class="server-meta">ID: <code>${escapeHtml(a.id)}</code> | Vendor: ${escapeHtml(a.vendor)}</div>
        </div>
        <span class="badge ${a.status.toLowerCase()}">${escapeHtml(a.status)}</span>
      </div>
      <div class="agent-desc">${escapeHtml(a.healthMessage || 'Operational')}</div>
      <div class="server-meta">Capture Interface: ${escapeHtml(a.capabilities.captureMethod)}</div>
    `;
    container.appendChild(card);
  }
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
      <div class="server-info">
        <span class="badge ${state.toLowerCase()}">${escapeHtml(state)}</span>
        <span class="server-title">${escapeHtml(definition.name)}</span>
        <span class="server-meta">(${escapeHtml(definition.transport)})</span>
        <span class="server-meta">${escapeHtml(definition.source)}</span>
      </div>
      <div class="server-badges">
        ${latencyText ? `<span class="server-meta">${latencyText}</span>` : ''}
        <button class="btn-action primary btn-connect-header" data-id="${escapeHtml(definition.id)}" title="Connect or verify this MCP server">Connect</button>
      </div>
    </div>
    <div class="server-details" style="${isExpanded ? 'display: block;' : 'display: none;'}">
      <div style="display: grid; grid-template-columns: 140px 1fr; gap: 4px; margin-bottom: 8px;">
        <span class="server-meta">Status Reason:</span>
        <span>${escapeHtml(health?.reason || 'Pending check')}</span>

        <span class="server-meta">Evidence Source:</span>
        <span>${escapeHtml(health?.evidenceSource || 'None')}</span>

        <span class="server-meta">Config Path:</span>
        <span style="word-break: break-all;">${escapeHtml(definition.configurationPath)}</span>

        <span class="server-meta">IDE Runtime:</span>
        <span>${escapeHtml(health?.ideRuntimeStatus || 'NOT_EXPOSED')}</span>

        <span class="server-meta">Last Checked:</span>
        <span>${health?.checkedAt ? escapeHtml(new Date(health.checkedAt).toLocaleString()) : 'Never'}</span>
      </div>

      ${capabilities ? `
        <div style="background-color: var(--bg-secondary); padding: 6px 8px; border-radius: 4px; margin-bottom: 8px;">
          <div>Tools: <strong>${capabilities.toolsCount ?? 0}</strong> | Prompts: <strong>${capabilities.promptsCount ?? 0}</strong> | Resources: <strong>${capabilities.resourcesCount ?? 0}</strong></div>
          ${capabilities.serverInfo ? `<div class="server-meta">Server: ${escapeHtml(capabilities.serverInfo.name)} (v${escapeHtml(capabilities.serverInfo.version || '1.0')})</div>` : ''}
        </div>
      ` : ''}

      <div class="header-actions">
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
      const details = card.querySelector('.server-details') as HTMLElement;
      if (details) details.style.display = 'none';
      card.classList.remove('expanded');
    } else {
      expandedServerIds.add(definition.id);
      const details = card.querySelector('.server-details') as HTMLElement;
      if (details) details.style.display = 'block';
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
