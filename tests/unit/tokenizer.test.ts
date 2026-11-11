import { describe, it, expect } from 'vitest';
import { LocalTokenizer } from '../../src/tokenization/tokenizer.js';
import { PricingEngine } from '../../src/tokenization/pricingEngine.js';

describe('LocalTokenizer', () => {
  it('correctly resolves model families', () => {
    expect(LocalTokenizer.resolveModelFamily('gpt-4o')).toBe('GPT');
    expect(LocalTokenizer.resolveModelFamily('o1-mini')).toBe('GPT');
    expect(LocalTokenizer.resolveModelFamily('claude-3-7-sonnet-20250219')).toBe('CLAUDE');
    expect(LocalTokenizer.resolveModelFamily('gemini-2.0-flash-exp')).toBe('GEMINI');
    expect(LocalTokenizer.resolveModelFamily('deepseek-coder-v2')).toBe('LLAMA');
    expect(LocalTokenizer.resolveModelFamily('custom-unknown-model')).toBe('GENERIC');
    expect(LocalTokenizer.resolveModelFamily()).toBe('GENERIC');
  });

  it('estimates draft tokens with sensible bounds as user types', () => {
    expect(LocalTokenizer.estimateDraftTokens('')).toBe(0);
    expect(LocalTokenizer.estimateDraftTokens('hello')).toBe(1);
    expect(LocalTokenizer.estimateDraftTokens('function calculateTotal(items: CartItem[]): number { return items.reduce((sum, i) => sum + i.price, 0); }', 'gpt-4o')).toBeGreaterThan(10);

    const prose = 'Write a short story about an astronaut who discovered a mechanical flower on Mars.';
    const tokens = LocalTokenizer.estimateDraftTokens(prose, 'claude-3-5-sonnet');
    expect(tokens).toBeGreaterThan(12);
    expect(tokens).toBeLessThan(25);
  });

  it('accurately estimates complete request tokens with tools and system prompt', () => {
    const estimate = LocalTokenizer.estimateRequestTokens({
      prompt: 'What is the current status of the database?',
      model: 'gpt-4o',
      systemPrompt: 'You are an expert DevOps engineer assistant.',
      contextMessages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi, how can I help you today?' },
      ],
      tools: [
        {
          name: 'query_database',
          description: 'Runs read-only SQL queries on the active database',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
    });

    expect(estimate.model).toBe('gpt-4o');
    expect(estimate.promptTokens).toBeGreaterThan(0);
    expect(estimate.systemPromptTokens).toBeGreaterThan(0);
    expect(estimate.contextTokens).toBeGreaterThan(0);
    expect(estimate.toolsOverheadTokens).toBeGreaterThan(0);
    expect(estimate.totalEstimatedTokens).toBe(
      estimate.promptTokens + estimate.systemPromptTokens + estimate.contextTokens + estimate.toolsOverheadTokens
    );
  });
});

describe('PricingEngine', () => {
  const engine = new PricingEngine();

  it('calculates default pricing for known models', () => {
    // GPT-4o: $2.50 / M input, $10.00 / M output
    const res = engine.calculateCost('gpt-4o', 100_000, 10_000);
    expect(res.inputCostUsd).toBeCloseTo(0.25, 4);
    expect(res.outputCostUsd).toBeCloseTo(0.10, 4);
    expect(res.totalCostUsd).toBeCloseTo(0.35, 4);
    expect(res.isCustomRate).toBe(false);
  });

  it('accounts for cached tokens at lower rate', () => {
    // Claude 3.5 Sonnet: $3.00 / M input, $0.30 / M cached input, $15.00 / M output
    // 100k input total, of which 80k is cached, 20k is fresh
    const res = engine.calculateCost('claude-3-5-sonnet', 100_000, 5_000, 80_000);
    expect(res.cachedCostUsd).toBeCloseTo(0.024, 4); // 80k * 0.30 / 1M = 0.024
    expect(res.inputCostUsd).toBeCloseTo(0.06, 4); // 20k * 3.00 / 1M = 0.06
    expect(res.outputCostUsd).toBeCloseTo(0.075, 4); // 5k * 15.00 / 1M = 0.075
    expect(res.totalCostUsd).toBeCloseTo(0.024 + 0.06 + 0.075, 4);
  });

  it('supports custom rate overrides', () => {
    engine.setCustomRate('custom-llm', 5.0, 20.0, 1.0);
    const res = engine.calculateCost('custom-llm', 1_000_000, 100_000);
    expect(res.inputCostUsd).toBeCloseTo(5.0, 4);
    expect(res.outputCostUsd).toBeCloseTo(2.0, 4);
    expect(res.totalCostUsd).toBeCloseTo(7.0, 4);
    expect(res.isCustomRate).toBe(true);
    engine.clearCustomRates();
  });
});

