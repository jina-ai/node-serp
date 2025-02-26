import { LanguageModelUsage } from './types';

export class TokenTracker {
  private usage: Record<string, LanguageModelUsage> = {};

  trackUsage(model: string, usage: LanguageModelUsage) {
    if (!this.usage[model]) {
      this.usage[model] = { prompt: 0, completion: 0, total: 0 };
    }
    
    this.usage[model].prompt += usage.prompt;
    this.usage[model].completion += usage.completion;
    this.usage[model].total += usage.total;
  }

  getUsage(model?: string) {
    if (model) {
      return this.usage[model];
    }
    return this.usage;
  }

  reset() {
    this.usage = {};
  }
} 