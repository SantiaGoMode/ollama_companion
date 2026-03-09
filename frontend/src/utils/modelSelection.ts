import type { AgentType, ModelCapability, OllamaModel } from '../types/agent';

// Model family definitions with capabilities and quality tier per agent type.
// Higher tier = better fit for that use case. Tier 0 = capable but not specialized.
interface ModelFamily {
  pattern: string;
  caps: AgentType[];
  // Per-type quality tier: higher is better. Specialist models rank higher for their domain.
  tiers: Partial<Record<AgentType, number>>;
}

const MODEL_FAMILIES: ModelFamily[] = [
  // --- Reasoning specialists (tier 3 for reasoning) ---
  { pattern: 'deepseek-r1', caps: ['chat', 'reasoning', 'code', 'summarizer'], tiers: { reasoning: 3, chat: 2, code: 2, summarizer: 1 } },
  { pattern: 'qwq', caps: ['chat', 'reasoning', 'code'], tiers: { reasoning: 3, chat: 2, code: 2 } },
  { pattern: 'qwen3', caps: ['chat', 'reasoning', 'code', 'summarizer', 'generator', 'transformer'], tiers: { reasoning: 2, chat: 2, code: 2, summarizer: 2, generator: 2, transformer: 2 } },

  // --- Code specialists (tier 3 for code) ---
  { pattern: 'deepseek-coder', caps: ['chat', 'code'], tiers: { code: 3, chat: 1 } },
  { pattern: 'codellama', caps: ['chat', 'code'], tiers: { code: 3, chat: 1 } },
  { pattern: 'starcoder', caps: ['chat', 'code'], tiers: { code: 3, chat: 0 } },
  { pattern: 'coder', caps: ['chat', 'code'], tiers: { code: 3, chat: 1 } },

  // --- Vision/file specialists (tier 3 for file) ---
  { pattern: 'llava', caps: ['chat', 'file'], tiers: { file: 3, chat: 1 } },
  { pattern: 'bakllava', caps: ['chat', 'file'], tiers: { file: 3, chat: 1 } },
  { pattern: 'moondream', caps: ['chat', 'file'], tiers: { file: 2, chat: 0 } },

  // --- Strong general-purpose (tier 2 for most tasks) ---
  { pattern: 'qwen', caps: ['chat', 'summarizer', 'generator', 'transformer', 'code'], tiers: { chat: 2, summarizer: 2, generator: 2, transformer: 2, code: 2 } },
  { pattern: 'mistral', caps: ['chat', 'summarizer', 'generator', 'transformer'], tiers: { chat: 2, summarizer: 2, generator: 2, transformer: 2 } },
  { pattern: 'llama', caps: ['chat', 'summarizer', 'generator', 'transformer'], tiers: { chat: 2, summarizer: 2, generator: 2, transformer: 2 } },
  { pattern: 'gemma', caps: ['chat', 'summarizer', 'generator', 'transformer'], tiers: { chat: 2, summarizer: 2, generator: 2, transformer: 2 } },
  { pattern: 'wizard', caps: ['chat', 'code', 'generator'], tiers: { chat: 2, code: 2, generator: 2 } },
  { pattern: 'command-r', caps: ['chat', 'summarizer', 'generator'], tiers: { chat: 2, summarizer: 2, generator: 2 } },

  // --- Good general-purpose (tier 1) ---
  { pattern: 'dolphin', caps: ['chat', 'summarizer', 'generator', 'transformer'], tiers: { chat: 1, summarizer: 1, generator: 1, transformer: 1 } },
  { pattern: 'nous-hermes', caps: ['chat', 'generator', 'transformer'], tiers: { chat: 1, generator: 1, transformer: 1 } },
  { pattern: 'solar', caps: ['chat', 'summarizer', 'generator'], tiers: { chat: 1, summarizer: 1, generator: 1 } },
  { pattern: 'yi', caps: ['chat', 'summarizer', 'generator', 'transformer'], tiers: { chat: 1, summarizer: 1, generator: 1, transformer: 1 } },
  { pattern: 'phi', caps: ['chat', 'summarizer', 'transformer'], tiers: { chat: 1, summarizer: 1, transformer: 1 } },
  { pattern: 'vicuna', caps: ['chat', 'summarizer', 'generator'], tiers: { chat: 1, summarizer: 1, generator: 1 } },
  { pattern: 'zephyr', caps: ['chat', 'summarizer', 'generator'], tiers: { chat: 1, summarizer: 1, generator: 1 } },
  { pattern: 'neural-chat', caps: ['chat', 'summarizer'], tiers: { chat: 1, summarizer: 1 } },
  { pattern: 'orca', caps: ['chat', 'summarizer'], tiers: { chat: 1, summarizer: 1 } },
  { pattern: 'tinyllama', caps: ['chat'], tiers: { chat: 0 } },

  // --- Embedding models (not usable for agents) ---
  { pattern: 'nomic-embed', caps: [], tiers: {} },
  { pattern: 'mxbai-embed', caps: [], tiers: {} },
  { pattern: 'all-minilm', caps: [], tiers: {} },
  { pattern: 'snowflake-arctic-embed', caps: [], tiers: {} },
];

function getFamily(modelName: string): ModelFamily | null {
  const lower = modelName.toLowerCase().split(':')[0];
  for (const family of MODEL_FAMILIES) {
    if (lower.includes(family.pattern)) return family;
  }
  return null;
}

export function detectCaps(modelName: string): AgentType[] {
  const family = getFamily(modelName);
  if (family) return family.caps;
  // Unknown models: assume general-purpose
  return ['chat', 'summarizer', 'generator', 'transformer'];
}

export function isEmbeddingModel(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return lower.includes('embed') || lower.includes('minilm');
}

/**
 * Score a model for a given agent type.
 * Higher score = better fit. Considers:
 * 1. Family tier (specialist vs generalist)
 * 2. Model size (larger = more capable, used as tiebreaker)
 */
function scoreModel(model: OllamaModel, agentType: AgentType): number {
  if (isEmbeddingModel(model.name)) return -1;

  const family = getFamily(model.name);
  const caps = family ? family.caps : ['chat', 'summarizer', 'generator', 'transformer'];

  // Model doesn't support this type at all
  if (!caps.includes(agentType)) return -1;

  // Base score from quality tier (0-3), default 1 for unknown families
  const tier = family?.tiers[agentType] ?? 1;
  const tierScore = tier * 1000;

  // Tiebreaker: model size in GB (larger is better within same tier)
  // Normalize to 0-100 range (100GB+ models are rare)
  const sizeGB = model.size / (1024 * 1024 * 1024);
  const sizeScore = Math.min(sizeGB, 100);

  return tierScore + sizeScore;
}

/**
 * Pick the best available model for an agent type.
 * Ranks all installed models by specialization tier + size, returns the top pick.
 * Re-evaluates on every call so new models are picked up immediately.
 */
export function pickModelForType(
  agentType: AgentType,
  models: OllamaModel[],
  capabilities?: ModelCapability[],
): string {
  // 1. If user has explicitly set a default_for this type in settings, honor it
  if (capabilities && capabilities.length > 0) {
    const userDefault = capabilities.find((m) => m.default_for === agentType);
    if (userDefault) {
      const exists = models.find((m) => m.name === userDefault.model_name);
      if (exists) return exists.name;
    }
  }

  // 2. Score and rank all available models
  const scored = models
    .map((m) => ({ model: m, score: scoreModel(m, agentType) }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) return scored[0].model.name;

  // 3. Fallback: any non-embedding model
  const usable = models.filter((m) => !isEmbeddingModel(m.name));
  if (usable.length > 0) return usable[0].name;

  return models[0]?.name || 'llama3.2';
}

/**
 * Get the recommended model name for display (without running full selection).
 * Returns null if no suitable model is available.
 */
export function getRecommendedModelName(
  agentType: AgentType,
  models: OllamaModel[],
): string | null {
  const scored = models
    .map((m) => ({ model: m, score: scoreModel(m, agentType) }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].model.name : null;
}
