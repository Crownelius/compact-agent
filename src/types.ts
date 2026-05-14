import type OpenAI from 'openai';

// ── Messages ──────────────────────────────────────────────
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: Role;
  content: string | null;
  tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
  tool_call_id?: string;
  name?: string;
}

// ── Config ────────────────────────────────────────────────
export interface CrowcoderConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  provider: string;        // display name: "OpenRouter", "GLM", "Ollama", etc.
  maxTokens: number;
  temperature: number;
  permissionMode: 'ask' | 'auto' | 'yolo';  // ask=prompt, auto=safe-only, yolo=all
  dryRun?: boolean;        // when true, show what tools WOULD execute without running them
  theme?: 'full' | 'compact' | 'minimal';   // startup display mode
  showThinking?: boolean;  // when true, display model reasoning/thinking tokens
}

// ── Provider presets ──────────────────────────────────────
export interface ProviderPreset {
  name: string;
  baseURL: string;
  defaultModel: string;
  requiresKey: boolean;
}

export const PROVIDERS: Record<string, ProviderPreset> = {
  anthropic: {
    name: 'Anthropic (Claude)',
    baseURL: 'https://api.anthropic.com/v1/',
    defaultModel: 'claude-sonnet-4-20250514',
    requiresKey: true,
  },
  openai: {
    name: 'OpenAI (GPT)',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    requiresKey: true,
  },
  openrouter: {
    name: 'OpenRouter (Any Model)',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4',
    requiresKey: true,
  },
  google: {
    name: 'Google (Gemini)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.5-flash',
    requiresKey: true,
  },
  deepseek: {
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresKey: true,
  },
  ollama: {
    name: 'Ollama (Local)',
    baseURL: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5-coder:latest',
    requiresKey: false,
  },
  lmstudio: {
    name: 'LM Studio',
    baseURL: 'http://localhost:1234/v1',
    defaultModel: 'loaded-model',
    requiresKey: false,
  },
  glm: {
    name: 'GLM (ZhipuAI)',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    requiresKey: true,
  },
  custom: {
    name: 'Custom',
    baseURL: '',
    defaultModel: '',
    requiresKey: true,
  },
};
