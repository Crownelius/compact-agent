/**
 * MemPalace text search — tokenized, field-weighted scoring.
 *
 * Design goals:
 *   1. Zero dependencies (no FTS index, no embedding model)
 *   2. Reasonable ranking out of the box: title-ish fields outrank body
 *   3. Tolerant to short queries (single keyword should still rank well)
 *   4. Tolerant to plural / case variations via simple stemming
 *
 * We tokenize on non-alphanumeric, lowercase everything, drop tokens
 * shorter than 2 chars and a small stopword list, and score each drawer
 * by summing per-token field weights:
 *
 *   tags     × 4   (semantic tags are the strongest signal)
 *   room     × 3
 *   wing     × 2
 *   content  × 1   (matches anywhere in body)
 *
 * Importance acts as a multiplier on the final score so the user can
 * boost high-signal drawers via the importance field. Recency also
 * lightly boosts via a half-life of 90 days.
 *
 * This is good enough until the store gets large; the search() entry
 * point is the swap-in for a real FTS / embedding search later.
 */

import type { Drawer, SearchOptions, SearchHit } from './types.js';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'or', 'but', 'the', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
  'that', 'these', 'those', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'by', 'from', 'as', 'into', 'about', 'it', 'its', 'i', 'you', 'we',
  'they', 'them', 'me', 'my', 'your', 'our', 'their', 'his', 'her',
]);

/**
 * Tokenize a string into lowercase, deduplicated, non-stopword tokens of
 * length ≥ 2. Very lightweight stemming: trailing 's' is stripped to fold
 * "drawer"/"drawers" together. Aggressive stemming (Porter, etc.) would
 * cost a lot for marginal recall gains at this scale.
 */
export function tokenize(s: string): string[] {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2) continue;
    if (STOPWORDS.has(raw)) continue;
    // Tiny stemmer: strip trailing 's' on words ≥ 4 chars (avoids "is"/"as" issues)
    const stem = raw.length >= 4 && raw.endsWith('s') ? raw.slice(0, -1) : raw;
    out.add(stem);
  }
  return [...out];
}

/**
 * Score a single drawer against a tokenized query. Returns 0 if no match,
 * otherwise a positive score (higher = better).
 *
 * The `matchedFields` array tracks which fields contributed so callers
 * can use it for diagnostics / highlighting.
 */
function scoreDrawer(
  drawer: Drawer,
  queryTokens: string[],
  matchedFields: Set<'content' | 'tags' | 'wing' | 'room'>,
): number {
  if (queryTokens.length === 0) return 0;

  const contentTokens = new Set(tokenize(drawer.content));
  const tagSet = new Set(drawer.tags.flatMap(tokenize));
  const wingTokens = new Set(tokenize(drawer.wing));
  const roomTokens = new Set(tokenize(drawer.room));

  let score = 0;
  let anyMatch = false;

  for (const qt of queryTokens) {
    if (tagSet.has(qt)) { score += 4; matchedFields.add('tags'); anyMatch = true; }
    if (roomTokens.has(qt)) { score += 3; matchedFields.add('room'); anyMatch = true; }
    if (wingTokens.has(qt)) { score += 2; matchedFields.add('wing'); anyMatch = true; }
    if (contentTokens.has(qt)) { score += 1; matchedFields.add('content'); anyMatch = true; }
  }

  if (!anyMatch) return 0;

  // Importance multiplier — 0.5 default gives no boost, 1.0 → 1.5×, 0 → 0.5×
  score *= 1 + (drawer.importance - 0.5);

  // Recency bonus — half-life of 90 days. Drawers from today get +50%,
  // 90-day-old drawers get +25%, older fade toward baseline.
  const ageDays = (Date.now() - new Date(drawer.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
  const recencyBoost = 0.5 * Math.pow(0.5, ageDays / 90);
  score *= 1 + recencyBoost;

  return score;
}

/**
 * Top-level search. Filters by scope/wing/room/tags first, then scores
 * each remaining drawer and returns the top `limit` by score.
 */
export function searchDrawers(
  drawers: Drawer[],
  query: string,
  opts: SearchOptions = {},
): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  let candidates = drawers;
  if (opts.wing) candidates = candidates.filter((d) => d.wing === opts.wing!.toLowerCase());
  if (opts.room) candidates = candidates.filter((d) => d.room === opts.room!.toLowerCase());
  if (opts.tags && opts.tags.length > 0) {
    const required = opts.tags.map((t) => t.toLowerCase());
    candidates = candidates.filter((d) => required.every((t) => d.tags.includes(t)));
  }
  if (opts.minImportance !== undefined) {
    candidates = candidates.filter((d) => d.importance >= opts.minImportance!);
  }

  const hits: SearchHit[] = [];
  for (const d of candidates) {
    const matchedFields = new Set<'content' | 'tags' | 'wing' | 'room'>();
    const score = scoreDrawer(d, tokens, matchedFields);
    if (score > 0) {
      hits.push({ drawer: d, score, matchedFields: [...matchedFields] });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, opts.limit ?? 20);
}
