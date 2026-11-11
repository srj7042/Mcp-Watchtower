import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BaseAgentAdapter } from '../agentAdapter.js';
import { EventBus } from '../../../core/eventBus.js';
import { ILogger, defaultLogger } from '../../../utils/logger.js';
import { AgentDefinition, AgentHealthCheckResult } from '../../../models/agent.js';
import { LocalTokenizer } from '../../../tokenization/tokenizer.js';

interface TranscriptStep {
  type?: string;
  step_index?: number;
  content?: string;
  status?: string;
  duration_ms?: number;
  error?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  tool_calls?: Array<{
    name?: string;
    tool_name?: string;
    status?: string;
    server_name?: string;
    args?: Record<string, unknown>;
    arguments?: Record<string, unknown>;
  }>;
  token_usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cached_tokens?: number;
  };
}

function normalizeAntigravityModel(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s.includes('3.8') && s.includes('flash')) return 'gemini-3.8-flash';
  if ((s.includes('3.0') || s.includes('3-0') || s.includes('3.')) && s.includes('flash')) return 'gemini-3.0-flash';
  if (s.includes('2.0') && s.includes('flash')) return 'gemini-2.0-flash';
  if (s.includes('1.5') && s.includes('flash')) return 'gemini-1.5-flash';
  if (s.includes('1.5') && s.includes('pro')) return 'gemini-1.5-pro';
  if (s.includes('pro')) return 'gemini-1.5-pro';
  if (s.includes('flash')) return 'gemini-3.8-flash';
  if (s.includes('opus')) return 'claude-3-opus';
  if (s.includes('claude')) return 'claude-3-7-sonnet';
  return 'gemini-3.8-flash';
}

export class AntigravityAdapter extends BaseAgentAdapter {
  private transcriptWatchers: fs.FSWatcher[] = [];
  private currentSessionId: string = `antigravity_${Date.now()}`;
  private lastProcessedLineCount: Map<string, number> = new Map();
  private scanInterval: NodeJS.Timeout | null = null;
  private readonly brainBaseDir: string;
  private activeModel: string = 'gemini-3.8-flash';

  public static readonly DEFINITION: AgentDefinition = {
    id: 'antigravity-adapter',
    name: 'Google Antigravity Agent',
    vendor: 'Google DeepMind',
    description: 'Monitors Google Antigravity IDE sessions, prompt submissions, planner responses, tool calls and token metrics via conversation transcript logs.',
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
    customBrainDir?: string
  ) {
    super(AntigravityAdapter.DEFINITION, eventBus, logger);
    this.brainBaseDir = customBrainDir || path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.emitSession(this.currentSessionId, 'ACTIVE', this.activeModel, {
      runtime: 'Google Antigravity IDE',
      brainPath: this.brainBaseDir,
    });

    this.scanForActiveSessions();
    this.scanInterval = setInterval(() => this.scanForActiveSessions(), 5000);

    this.isInitialized = true;
    this.logger.info(`AntigravityAdapter initialized. Brain directory: ${this.brainBaseDir}`);
  }

  public scanForActiveSessions(): void {
    if (this.isDisposed || !fs.existsSync(this.brainBaseDir)) return;

    try {
      const entries = fs.readdirSync(this.brainBaseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const transcriptPath = path.join(
            this.brainBaseDir,
            entry.name,
            '.system_generated',
            'logs',
            'transcript.jsonl'
          );

          if (fs.existsSync(transcriptPath)) {
            this.processTranscriptFile(entry.name, transcriptPath);
          }
        }
      }
    } catch (err) {
      this.logger.warn('Error scanning Antigravity brain directories:', err);
    }
  }

  public processTranscriptFile(conversationId: string, transcriptPath: string): void {
    try {
      const content = fs.readFileSync(transcriptPath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      const prevCount = this.lastProcessedLineCount.get(transcriptPath) || 0;

      if (lines.length <= prevCount) return;

      const newLines = lines.slice(prevCount);
      this.lastProcessedLineCount.set(transcriptPath, lines.length);

      for (const line of newLines) {
        try {
          const step = JSON.parse(line);
          this.handleTranscriptStep(conversationId, step);
        } catch {
          // Skip corrupt or partial JSON lines
        }
      }
    } catch (err) {
      this.logger.warn(`Could not read transcript at ${transcriptPath}:`, err);
    }
  }

  private handleTranscriptStep(conversationId: string, step: TranscriptStep): void {
    // 1. Detect dynamic model changes in transcript
    if (typeof step.content === 'string') {
      const match = step.content.match(/Model Selection`?\s+from\s+.*?to\s+([^.<)\n]+)/i);
      if (match && match[1]) {
        this.activeModel = normalizeAntigravityModel(match[1]);
        this.logger.info(`Antigravity active model updated to: ${this.activeModel}`);
      }
    }
    if (step.model) {
      this.activeModel = normalizeAntigravityModel(step.model);
    }

    const model = this.activeModel;

    if (step.type === 'USER_INPUT') {
      const promptText = typeof step.content === 'string' ? step.content : '';
      const promptTokens = LocalTokenizer.estimateDraftTokens(promptText, model);

      this.emitPrompt(
        conversationId,
        `step_${step.step_index || Date.now()}`,
        promptText.length,
        promptTokens,
        model
      );
    } else if (step.type === 'PLANNER_RESPONSE') {
      const execId = `step_${step.step_index || Date.now()}`;
      const status = step.status === 'ERROR' ? 'FAILED' : 'COMPLETED';

      this.emitExecution(
        conversationId,
        execId,
        status,
        model,
        step.duration_ms || 250,
        step.error
      );

      // Handle tool calls in planner response
      if (Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
        for (const tc of step.tool_calls) {
          this.emitToolCall(
            conversationId,
            `tc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tc.name || tc.tool_name || 'unknown_tool',
            tc.status === 'ERROR' ? 'FAILED' : 'SUCCESS',
            {
              executionId: execId,
              serverName: tc.server_name,
              argumentsSanitized: tc.args || tc.arguments,
            }
          );
        }
      }

      // Handle token metrics if available in step metadata or direct step properties
      const promptTok = step.token_usage?.prompt_tokens ?? step.input_tokens ?? 0;
      const compTok = step.token_usage?.completion_tokens ?? step.output_tokens ?? 0;
      const cachedTok = step.token_usage?.cached_tokens ?? step.cache_read_tokens ?? 0;
      const totalTok = step.token_usage?.total_tokens ?? (promptTok + compTok);

      if (promptTok > 0 || compTok > 0 || step.token_usage) {
        this.emitTokenUsage(
          conversationId,
          model,
          'REPORTED_ACTUAL',
          'EXACT',
          promptTok,
          compTok,
          totalTok,
          {
            executionId: execId,
            cachedTokens: cachedTok,
          }
        );
      }
    }
  }

  public async checkHealth(): Promise<AgentHealthCheckResult> {
    const brainExists = fs.existsSync(this.brainBaseDir);
    const geminiConfigExists = fs.existsSync(path.join(os.homedir(), '.gemini'));

    let status: 'ACTIVE' | 'DEGRADED' | 'DISCONNECTED' = 'DISCONNECTED';
    let message = 'No Antigravity runtime or conversation data detected.';

    if (brainExists) {
      status = 'ACTIVE';
      message = 'Antigravity IDE environment detected with active conversation brain storage.';
    } else if (geminiConfigExists) {
      status = 'DEGRADED';
      message = 'Found .gemini configuration directory, but no active conversation transcripts found.';
    }

    return {
      status,
      message,
      timestamp: Date.now(),
      details: {
        brainBaseDir: this.brainBaseDir,
        brainExists,
        geminiConfigExists,
        monitoredSessionsCount: this.lastProcessedLineCount.size,
      },
    };
  }

  public override dispose(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    for (const watcher of this.transcriptWatchers) {
      watcher.close();
    }
    this.transcriptWatchers = [];
    this.emitSession(this.currentSessionId, 'TERMINATED');
    super.dispose();
  }
}
