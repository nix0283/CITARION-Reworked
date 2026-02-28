/**
 * Skills Module Index
 * 
 * Экспорт всех интегрированных skill-библиотек
 * @module lib/skills
 */

// Finance API integration
export {
  FinanceClient,
  getFinanceClient,
  type FinanceConfig,
  type StockQuote,
  type HistoricalData,
  type FinancialMetrics,
  type MarketNews,
} from './finance-client';

// Web Search integration
export {
  WebSearchClient,
  getWebSearchClient,
  type SearchConfig,
  type SearchResult,
  type WebPageContent,
} from './web-search-client';

// LLM integration placeholder (для будущего расширения)
export interface LLMConfig {
  provider?: 'openai' | 'anthropic' | 'zhipu';
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig = {}) {
    this.config = {
      provider: 'zhipu',
      model: 'glm-4',
      temperature: 0.7,
      maxTokens: 2048,
      ...config,
    };
  }

  async chat(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>): Promise<LLMResponse> {
    // Placeholder - в реальном проекте здесь будет вызов LLM API
    return {
      content: 'LLM integration placeholder',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async generate(prompt: string, options?: { systemPrompt?: string }): Promise<LLMResponse> {
    return this.chat([
      ...(options?.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
      { role: 'user' as const, content: prompt },
    ]);
  }
}

export function getLLMClient(config?: LLMConfig): LLMClient {
  return new LLMClient(config);
}

// Type для unified skill interface
export interface Skill {
  name: string;
  description: string;
  enabled: boolean;
  initialize?(): Promise<void>;
  destroy?(): void;
}

export default {
  FinanceClient,
  getFinanceClient,
  WebSearchClient,
  getWebSearchClient,
  LLMClient,
  getLLMClient,
};
