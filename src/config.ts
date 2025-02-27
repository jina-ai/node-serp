import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import * as dotenv from 'dotenv';

dotenv.config();

interface ModelConfig {
  provider: string;
  providerOptions?: Record<string, any>;
  options: {
    maxTokens: number;
    temperature: number;
  }
}

export const modelConfig = require('../config.json') as Record<string, ModelConfig | undefined>;

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

export function getModel(name: string = 'gemini') {
  const conf = modelConfig[name];
  if (!conf) {
    throw new Error(`Model config not found for ${name}`);
  }
  if (name === 'gemini') {
    if (conf.provider === 'vertex') {
      const createVertex = require('@ai-sdk/google-vertex').createVertex;
      return createVertex({ project: process.env.GCLOUD_PROJECT, ...conf.providerOptions })('gemini-2.0-flash-lite');
    }
    return google('gemini-2.0-flash-lite');
  }

  throw new Error(`Unknown model: ${name}`);
}

export function getModelConfig(name: string = 'gemini') {
  const conf = modelConfig[name];
  if (!conf) {
    throw new Error(`Model config not found for ${name}`);
  }
  return conf.options;
}

export const KNOWLEDGE_CUTOFF = 'October 2024'; 