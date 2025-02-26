import { google } from '@ai-sdk/google';

export type ToolName = 'gemini' | 'fallback';

interface ToolConfig {
  maxTokens: number;
  temperature: number;
}

const toolConfigs: Record<ToolName, ToolConfig> = {
  gemini: {
    maxTokens: 2048,
    temperature: 0.7
  },
  fallback: {
    maxTokens: 1024,
    temperature: 0.5
  }
};

export function getToolConfig(tool: ToolName): ToolConfig {
  return toolConfigs[tool];
}

export function getModel(tool: ToolName) {
  switch (tool) {
    case 'gemini':
      return google('gemini-2.0-flash');
    case 'fallback':
      // Using same model for fallback but with different settings
      return google('gemini-2.0-flash');
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
} 