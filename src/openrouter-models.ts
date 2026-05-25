/**
 * OpenRouter model catalog fetcher.
 *
 * GET https://openrouter.ai/api/v1/models returns the full catalog
 * (300+ entries) with per-token pricing in USD. We cache the result
 * for the duration of the process — the catalog only changes when
 * OpenRouter adds/removes models, which is rare enough that one
 * fetch per REPL session is the right trade-off.
 *
 * Pricing in the response is per-token; we convert to per-1M tokens
 * for display because that's how everyone quotes LLM costs.
 *
 * No auth required for /models (it's public). We hit it without the
 * user's API key so it works even before the user has finished
 * configuring their key.
 */

export interface OpenRouterModel {
  /** Canonical model ID, e.g. "anthropic/claude-sonnet-4". */
  id: string;
  /** Display name, e.g. "Claude Sonnet 4". */
  name: string;
  /** Context window in tokens, or null if unknown. */
  contextLength: number | null;
  /** USD per million input tokens. */
  promptPerM: number;
  /** USD per million output tokens. */
  completionPerM: number;
  /** True when the model is free (both prompt + completion = 0). */
  isFree: boolean;
}

interface RawModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
  };
}

let _cache: OpenRouterModel[] | null = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;  // 1 hour

/**
 * Fetch the OpenRouter model catalog, normalized + sorted (free
 * models first, then alphabetical by ID).
 *
 * Returns an empty array on any network / parse failure instead of
 * throwing — the caller is typically the model-picker, which can
 * gracefully say "couldn't fetch models" without aborting the REPL.
 */
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  // Cache hit?
  if (_cache && (Date.now() - _cacheAt) < CACHE_TTL_MS) {
    return _cache;
  }

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models', {
      // Quick timeout — picker is interactive, can't sit on a stuck
      // request. If the network is slow the user can use /model <id>
      // directly.
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'compact-agent/1.x' },
    });
    if (!resp.ok) return [];
    const json = await resp.json() as { data?: RawModel[] };
    const raw = json.data ?? [];

    const models: OpenRouterModel[] = [];
    for (const r of raw) {
      if (!r.id) continue;
      const prompt = parsePrice(r.pricing?.prompt);
      const completion = parsePrice(r.pricing?.completion);
      models.push({
        id: r.id,
        name: r.name ?? r.id,
        contextLength: typeof r.context_length === 'number' ? r.context_length : null,
        promptPerM: prompt * 1_000_000,
        completionPerM: completion * 1_000_000,
        isFree: prompt === 0 && completion === 0,
      });
    }

    // Sort: free first, then alphabetical by ID. Cheaper paid
    // models float to the top within each group implicitly because
    // ID alphabetical happens to put well-known cheap-tier vendors
    // (anthropic, deepseek, google) near the top.
    models.sort((a, b) => {
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    _cache = models;
    _cacheAt = Date.now();
    return models;
  } catch {
    return [];
  }
}

function parsePrice(p: string | number | undefined): number {
  if (p === undefined || p === null) return 0;
  if (typeof p === 'number') return p;
  const n = parseFloat(p);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Format the per-million pricing as a compact column for use in
 * the picker's hint field. "in:$0.14 out:$0.28 · 128k" style.
 */
export function formatPricing(m: OpenRouterModel): string {
  if (m.isFree) {
    return `FREE · ${formatCtx(m.contextLength)}`;
  }
  return `in:$${formatPrice(m.promptPerM)} out:$${formatPrice(m.completionPerM)} · ${formatCtx(m.contextLength)}`;
}

function formatPrice(n: number): string {
  // Sub-$1: show two decimals. $1+: show one or whole-dollar.
  if (n < 1) return n.toFixed(2);
  if (n < 10) return n.toFixed(1);
  return n.toFixed(0);
}

function formatCtx(ctx: number | null): string {
  if (!ctx) return '?';
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
  if (ctx >= 1_000) return `${Math.round(ctx / 1_000)}k`;
  return String(ctx);
}
