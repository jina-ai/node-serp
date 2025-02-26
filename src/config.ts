import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import * as dotenv from 'dotenv';

dotenv.config();

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

// Setup proxy if present
if (process.env.https_proxy) {
  try {
    const proxyUrl = new URL(process.env.https_proxy).toString();
    const dispatcher = new ProxyAgent({ uri: proxyUrl });
    setGlobalDispatcher(dispatcher);
    console.log('Proxy configured:', proxyUrl);
  } catch (error) {
    console.error('Failed to set proxy:', error);
  }
}

// Create custom provider instance with our preferred env var name
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY
});

export function getModel(tool: ToolName) {
  switch (tool) {
    case 'gemini':
      return google('gemini-2.0-flash-lite');
    case 'fallback':
      return google('gemini-2.0-flash-lite');
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
} 