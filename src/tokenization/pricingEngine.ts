/**
 * Configurable Model Pricing Engine.
 * Calculates financial costs based on input, output, and cached token pricing.
 */

export interface ModelPricingTier {
  modelPattern: RegExp;
  displayName: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion: number;
}

export interface PricingCalculationResult {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  cachedCostUsd: number;
  totalCostUsd: number;
  isCustomRate: boolean;
}

export class PricingEngine {
  private static readonly DEFAULT_TIERS: ModelPricingTier[] = [
    // OpenAI Models
    {
      modelPattern: /gpt-4o-mini/i,
      displayName: 'GPT-4o Mini',
      inputPerMillion: 0.15,
      outputPerMillion: 0.60,
      cachedInputPerMillion: 0.075,
    },
    {
      modelPattern: /gpt-4o/i,
      displayName: 'GPT-4o',
      inputPerMillion: 2.50,
      outputPerMillion: 10.00,
      cachedInputPerMillion: 1.25,
    },
    {
      modelPattern: /o1-mini/i,
      displayName: 'o1 Mini',
      inputPerMillion: 3.00,
      outputPerMillion: 12.00,
      cachedInputPerMillion: 1.50,
    },
    {
      modelPattern: /o1/i,
      displayName: 'o1',
      inputPerMillion: 15.00,
      outputPerMillion: 60.00,
      cachedInputPerMillion: 7.50,
    },
    // Anthropic Models
    {
      modelPattern: /claude-3-7-sonnet/i,
      displayName: 'Claude 3.7 Sonnet',
      inputPerMillion: 3.00,
      outputPerMillion: 15.00,
      cachedInputPerMillion: 0.30,
    },
    {
      modelPattern: /claude-3-5-sonnet/i,
      displayName: 'Claude 3.5 Sonnet',
      inputPerMillion: 3.00,
      outputPerMillion: 15.00,
      cachedInputPerMillion: 0.30,
    },
    {
      modelPattern: /claude-3-5-haiku/i,
      displayName: 'Claude 3.5 Haiku',
      inputPerMillion: 0.80,
      outputPerMillion: 4.00,
      cachedInputPerMillion: 0.08,
    },
    {
      modelPattern: /claude-3-opus/i,
      displayName: 'Claude 3 Opus',
      inputPerMillion: 15.00,
      outputPerMillion: 75.00,
      cachedInputPerMillion: 1.50,
    },
    // Google Gemini Models
    {
      modelPattern: /gemini-2\.0-flash/i,
      displayName: 'Gemini 2.0 Flash',
      inputPerMillion: 0.10,
      outputPerMillion: 0.40,
      cachedInputPerMillion: 0.025,
    },
    {
      modelPattern: /gemini-1\.5-flash/i,
      displayName: 'Gemini 1.5 Flash',
      inputPerMillion: 0.075,
      outputPerMillion: 0.30,
      cachedInputPerMillion: 0.01875,
    },
    {
      modelPattern: /gemini-1\.5-pro/i,
      displayName: 'Gemini 1.5 Pro',
      inputPerMillion: 1.25,
      outputPerMillion: 5.00,
      cachedInputPerMillion: 0.3125,
    },
    // DeepSeek & Open Models
    {
      modelPattern: /deepseek/i,
      displayName: 'DeepSeek V3 / R1',
      inputPerMillion: 0.14,
      outputPerMillion: 0.28,
      cachedInputPerMillion: 0.014,
    },
    // Generic Fallback
    {
      modelPattern: /.*/,
      displayName: 'Generic Model',
      inputPerMillion: 1.00,
      outputPerMillion: 3.00,
      cachedInputPerMillion: 0.50,
    },
  ];

  private customRates = new Map<string, { input: number; output: number; cached?: number }>();

  public setCustomRate(model: string, inputPerMillion: number, outputPerMillion: number, cachedPerMillion?: number): void {
    this.customRates.set(model.toLowerCase(), {
      input: inputPerMillion,
      output: outputPerMillion,
      cached: cachedPerMillion ?? inputPerMillion * 0.5,
    });
  }

  public clearCustomRates(): void {
    this.customRates.clear();
  }

  public calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cachedTokens: number = 0
  ): PricingCalculationResult {
    const lowerModel = (model || 'unknown').toLowerCase();
    const custom = this.customRates.get(lowerModel);

    let inputRate = 1.0;
    let outputRate = 3.0;
    let cachedRate = 0.5;
    let isCustom = false;

    if (custom) {
      inputRate = custom.input;
      outputRate = custom.output;
      cachedRate = custom.cached ?? inputRate * 0.5;
      isCustom = true;
    } else {
      const match = PricingEngine.DEFAULT_TIERS.find((t) => t.modelPattern.test(model));
      if (match) {
        inputRate = match.inputPerMillion;
        outputRate = match.outputPerMillion;
        cachedRate = match.cachedInputPerMillion;
      }
    }

    // Subtract cached tokens from standard input tokens to avoid double billing
    const regularInputTokens = Math.max(0, inputTokens - cachedTokens);

    const inputCostUsd = (regularInputTokens / 1_000_000) * inputRate;
    const cachedCostUsd = (cachedTokens / 1_000_000) * cachedRate;
    const outputCostUsd = (outputTokens / 1_000_000) * outputRate;
    const totalCostUsd = inputCostUsd + cachedCostUsd + outputCostUsd;

    return {
      model,
      inputTokens,
      outputTokens,
      cachedTokens,
      inputCostUsd,
      outputCostUsd,
      cachedCostUsd,
      totalCostUsd,
      isCustomRate: isCustom,
    };
  }
}

