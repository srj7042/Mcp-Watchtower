import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BaseAgentAdapter } from '../agentAdapter.js';
import { EventBus } from '../../../core/eventBus.js';
import { ILogger, defaultLogger } from '../../../utils/logger.js';
import { AgentDefinition, AgentHealthCheckResult } from '../../../models/agent.js';
import { LocalTokenizer } from '../../../tokenization/tokenizer.js';

export class ClaudeCodeAdapter extends BaseAgentAdapter {
  private scanInterval: NodeJS.Timeout | null = null;
  private currentSessionId: string = `claude_${Date.now()}`;
  private readonly claudeDir: string;
  private processedSessions = new Set<string>();

  public static readonly DEFINITION: AgentDefinition = {
    id: 'claude-code-adapter',
    name: 'Claude Code CLI',
    vendor: 'Anthropic',
    description: 'Monitors Claude Code command executions, tool calls, and exact reported token usage via session history or companion hooks.',
    version: '1.0.0',
    capabilities: {
      supportsDraftTracking: false,
      supportsPromptInterception: true,
      supportsExecutionTracking: true,
      supportsToolCallInterception: true,
      supportsSessionLifecycle: true,
      reportsExactTokenMetrics: true,
      captureMethod: 'FILE_TRANSCRIPT_WATCH',
    },
  };

  constructor(
    eventBus: EventBus,
    logger: ILogger = defaultLogger,
    customClaudeDir?: string
  ) {
    super(ClaudeCodeAdapter.DEFINITION, eventBus, logger);
    this.claudeDir = customClaudeDir || path.join(os.homedir(), '.claude');
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.emitSession(this.currentSessionId, 'ACTIVE', 'claude-3-7-sonnet', {
      runtime: 'Claude Code CLI',
      claudePath: this.claudeDir,
    });

    this.scanClaudeSessions();
    this.scanInterval = setInterval(() => this.scanClaudeSessions(), 5000);

    this.isInitialized = true;
    this.logger.info(`ClaudeCodeAdapter initialized. Claude path: ${this.claudeDir}`);
  }

  public scanClaudeSessions(): void {
    if (this.isDisposed || !fs.existsSync(this.claudeDir)) return;

    try {
      const historyFile = path.join(this.claudeDir, 'history.jsonl');
      if (fs.existsSync(historyFile)) {
        this.processHistoryFile(historyFile);
      }
    } catch (err) {
      this.logger.warn('Error reading Claude Code history:', err);
    }
  }

  public processHistoryFile(historyPath: string): void {
    try {
      const content = fs.readFileSync(historyPath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const entryId = entry.id || entry.timestamp || line;
          if (this.processedSessions.has(entryId)) continue;
          this.processedSessions.add(entryId);

          const model = entry.model || 'claude-3-7-sonnet';
          const prompt = entry.prompt || entry.input || '';

          if (prompt) {
            const tokens = LocalTokenizer.estimateDraftTokens(prompt, model);
            this.emitPrompt(this.currentSessionId, `p_${entryId}`, prompt.length, tokens, model);
          }

          if (entry.tools) {
            for (const t of entry.tools) {
              this.emitToolCall(
                this.currentSessionId,
                `tc_${entryId}_${t.name}`,
                t.name,
                t.status === 'error' ? 'FAILED' : 'SUCCESS',
                { durationMs: t.duration_ms }
              );
            }
          }

          if (entry.usage) {
            this.emitTokenUsage(
              this.currentSessionId,
              model,
              'REPORTED_ACTUAL',
              'EXACT',
              entry.usage.input_tokens || 0,
              entry.usage.output_tokens || 0,
              (entry.usage.input_tokens || 0) + (entry.usage.output_tokens || 0),
              {
                cachedTokens: entry.usage.cache_read_input_tokens,
              }
            );
          }
        } catch {
          // Skip unparseable line
        }
      }
    } catch (err) {
      this.logger.warn(`Could not read Claude history file ${historyPath}:`, err);
    }
  }

  public async checkHealth(): Promise<AgentHealthCheckResult> {
    const exists = fs.existsSync(this.claudeDir);
    return {
      status: exists ? 'ACTIVE' : 'DISCONNECTED',
      message: exists
        ? 'Claude Code directory detected with available session tracking.'
        : 'Claude Code directory (~/.claude) not found.',
      timestamp: Date.now(),
      details: {
        claudeDir: this.claudeDir,
        exists,
        processedEventsCount: this.processedSessions.size,
      },
    };
  }

  public override dispose(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.emitSession(this.currentSessionId, 'TERMINATED');
    super.dispose();
  }
}

