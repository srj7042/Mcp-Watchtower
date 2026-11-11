/**
 * Local Model-Aware Tokenizer Engine.
 * Estimates tokens locally as users type in real-time.
 * Strictly separates:
 * 1. Draft Estimates (in-flight user typing)
 * 2. Complete Request Estimates (full prompt payload + system prompt + history + tools)
 * 3. Actual Reported Usage (exact numbers from provider, or explicit UNKNOWN)
 */

export type ModelFamily = 'GPT' | 'CLAUDE' | 'GEMINI' | 'LLAMA' | 'GENERIC';

export interface ModelTokenProfile {
  family: ModelFamily;
  charsPerTokenText: number;
  charsPerTokenCode: number;
  whitespaceRunCost: number; // Tokens per 4 spaces of indentation
  overheadPerMessage: number;
  overheadPerTool: number;
}

export interface RequestTokenParams {
  prompt: string;
  model: string;
  systemPrompt?: string;
  contextMessages?: Array<{ role: string; content: string }>;
  tools?: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }>;
}

export interface RequestTokenEstimate {
  model: string;
  promptTokens: number;
  systemPromptTokens: number;
  contextTokens: number;
  toolsOverheadTokens: number;
  totalEstimatedTokens: number;
}

export class LocalTokenizer {
  private static readonly PROFILES: Record<ModelFamily, ModelTokenProfile> = {
    GPT: {
      family: 'GPT',
      charsPerTokenText: 4.0,
      charsPerTokenCode: 3.6,
      whitespaceRunCost: 1.0,
      overheadPerMessage: 3,
      overheadPerTool: 12,
    },
    CLAUDE: {
      family: 'CLAUDE',
      charsPerTokenText: 3.8,
      charsPerTokenCode: 3.4,
      whitespaceRunCost: 1.0,
      overheadPerMessage: 4,
      overheadPerTool: 16,
    },
    GEMINI: {
      family: 'GEMINI',
      charsPerTokenText: 3.9,
      charsPerTokenCode: 3.5,
      whitespaceRunCost: 1.0,
      overheadPerMessage: 3,
      overheadPerTool: 10,
    },
    LLAMA: {
      family: 'LLAMA',
      charsPerTokenText: 3.7,
      charsPerTokenCode: 3.3,
      whitespaceRunCost: 1.0,
      overheadPerMessage: 4,
      overheadPerTool: 14,
    },
    GENERIC: {
      family: 'GENERIC',
      charsPerTokenText: 4.0,
      charsPerTokenCode: 3.5,
      whitespaceRunCost: 1.0,
      overheadPerMessage: 4,
      overheadPerTool: 12,
    },
  };

  /**
   * Determine model family from model name.
   */
  public static resolveModelFamily(modelName?: string): ModelFamily {
    if (!modelName) return 'GENERIC';
    const lower = modelName.toLowerCase();
    if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('openai')) {
      return 'GPT';
    }
    if (lower.includes('claude') || lower.includes('anthropic')) {
      return 'CLAUDE';
    }
    if (lower.includes('gemini') || lower.includes('google')) {
      return 'GEMINI';
    }
    if (lower.includes('llama') || lower.includes('deepseek') || lower.includes('mistral') || lower.includes('qwen')) {
      return 'LLAMA';
    }
    return 'GENERIC';
  }

  /**
   * Estimates draft tokens for user input currently being typed.
   * Highly optimized for fast, synchronous execution on every keystroke.
   */
  public static estimateDraftTokens(text: string, modelName?: string): number {
    if (!text || text.length === 0) return 0;

    const family = this.resolveModelFamily(modelName);
    const profile = this.PROFILES[family];

    // Detect if content looks like code vs natural language
    const isCode = /[{}[\]();=><+*\\_#-]/.test(text) || /\b(function|const|let|var|class|import|def|return)\b/.test(text);
    const charsPerToken = isCode ? profile.charsPerTokenCode : profile.charsPerTokenText;

    // Advanced token estimation:
    // Split by whitespace and common punctuation delimiters
    const words = text.split(/\s+/).filter(Boolean);
    let tokenCount = 0;

    for (const word of words) {
      if (word.length <= 5) {
        tokenCount += 1;
      } else {
        // Multi-syllable or compound identifiers (CamelCase, snake_case)
        const parts = word.split(/(?=[A-Z])|[_\-.:/]/).filter(Boolean);
        if (parts.length > 1) {
          for (const p of parts) {
            tokenCount += Math.max(1, Math.ceil(p.length / charsPerToken));
          }
        } else {
          tokenCount += Math.max(1, Math.ceil(word.length / charsPerToken));
        }
      }
    }

    // Account for indentation whitespace runs
    const indentationRuns = (text.match(/ {4}|\t/g) || []).length;
    tokenCount += Math.round(indentationRuns * profile.whitespaceRunCost);

    return Math.max(1, tokenCount);
  }

  /**
   * Estimates total request tokens (system prompt + messages + tools + prompt).
   */
  public static estimateRequestTokens(params: RequestTokenParams): RequestTokenEstimate {
    const family = this.resolveModelFamily(params.model);
    const profile = this.PROFILES[family];

    const promptTokens = this.estimateDraftTokens(params.prompt, params.model);
    const systemPromptTokens = params.systemPrompt ? this.estimateDraftTokens(params.systemPrompt, params.model) : 0;

    let contextTokens = 0;
    if (params.contextMessages && params.contextMessages.length > 0) {
      for (const msg of params.contextMessages) {
        contextTokens += this.estimateDraftTokens(msg.content, params.model) + profile.overheadPerMessage;
      }
    }

    let toolsOverheadTokens = 0;
    if (params.tools && params.tools.length > 0) {
      for (const tool of params.tools) {
        const text = `${tool.name} ${tool.description || ''} ${JSON.stringify(tool.parameters || {})}`;
        toolsOverheadTokens += this.estimateDraftTokens(text, params.model) + profile.overheadPerTool;
      }
    }

    const totalEstimatedTokens = promptTokens + systemPromptTokens + contextTokens + toolsOverheadTokens;

    return {
      model: params.model,
      promptTokens,
      systemPromptTokens,
      contextTokens,
      toolsOverheadTokens,
      totalEstimatedTokens,
    };
  }
}
