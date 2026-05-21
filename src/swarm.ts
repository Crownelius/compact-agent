/**
 * Agentic swarming — fan out N specialized agents on the same task
 * concurrently and merge their outputs.
 *
 * Inspired by LangGraph's `Send` map-reduce primitive and OpenAI Agents
 * SDK's handoff pattern. The audit ranked these as the two most-portable
 * concepts from the swarming-framework ecosystem; this is the map-reduce
 * half (Send-style fan-out). Sequential handoff stays on the roadmap
 * for /multi-execute.
 *
 * Usage:
 *   /swarm code-architect,silent-failure-hunter,type-design-analyzer  audit the auth flow
 *
 * Each agent receives:
 *   - System prompt: its own ECC agent prompt (the role-specific persona)
 *   - User message: the task verbatim
 *   - Empty tool list: swarm runs are analysis-only; no file edits or
 *     bash commands. If you want a swarm to make changes, /architect (or
 *     other agent slash) first, then act on the synthesis manually.
 *
 * Concurrency: Promise.allSettled — one agent failing doesn't kill the
 * others. Errors surface in the result block.
 *
 * Key pool: every concurrent agent uses streamChat which goes through
 * the key rotation pool from v1.23.0. Users with multiple OpenRouter
 * accounts get true parallel throughput across keys.
 *
 * Cost note: N agents = N model calls. The orchestrator's /help text
 * surfaces this so it isn't surprising.
 */

import type { CrowcoderConfig } from './types.js';
import { streamChat } from './api.js';
import { findEccSkillByName } from './ecc.js';

export interface SwarmAgent {
  /** Display name (matches the ECC slug like 'code-architect') */
  name: string;
  /** The system prompt the agent runs with — usually the ECC skill body */
  prompt: string;
}

export interface SwarmResult {
  agent: string;
  text: string;
  durationMs: number;
  /** Set when this agent's call threw — others may still have succeeded */
  error?: string;
}

/**
 * Look up agents by slug and return their full prompts. Throws on the
 * first unknown slug so the caller can correct + retry rather than
 * partially running.
 *
 * Accepts both bare slugs ("code-architect") and the "agent: <slug>"
 * form that listSkills() returns.
 */
export function resolveAgents(slugs: string[]): SwarmAgent[] {
  const out: SwarmAgent[] = [];
  for (const raw of slugs) {
    const slug = raw.trim();
    if (!slug) continue;
    // Try direct name match first ("agent: <slug>"), then bare slug
    const skill = findEccSkillByName(`agent: ${slug}`) ?? findEccSkillByName(slug);
    if (!skill) {
      throw new Error(`Unknown agent: "${slug}". Run /ecc-guide agents to see what's available.`);
    }
    out.push({ name: slug, prompt: skill.prompt });
  }
  return out;
}

/**
 * Run all agents concurrently against the same task. Each agent gets a
 * private message history (its prompt + the task); they don't see each
 * other's output. Merging is the caller's job — usually print-with-
 * attribution + an optional synthesis prompt.
 *
 * No tools available to swarm agents — analysis only. If we exposed
 * tools we'd need lock coordination on the filesystem + permission
 * prompts for every parallel write, which defeats the purpose.
 */
export async function runSwarm(
  agents: SwarmAgent[],
  task: string,
  config: CrowcoderConfig,
): Promise<SwarmResult[]> {
  const results = await Promise.allSettled(
    agents.map(async (agent): Promise<SwarmResult> => {
      const start = Date.now();
      try {
        const messages = [
          { role: 'system' as const, content: agent.prompt },
          { role: 'user' as const, content: task },
        ];
        let text = '';
        for await (const event of streamChat(config, messages, [])) {
          if (event.type === 'text' && event.content) text += event.content;
        }
        return { agent: agent.name, text, durationMs: Date.now() - start };
      } catch (err) {
        return {
          agent: agent.name,
          text: '',
          durationMs: Date.now() - start,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  // Promise.allSettled always resolves; un-pack the values.
  return results.map((r) => (r.status === 'fulfilled' ? r.value : {
    agent: 'unknown',
    text: '',
    durationMs: 0,
    error: `swarm task crashed: ${r.reason}`,
  }));
}

/**
 * Format swarm results for stdout — attribution headers + clear visual
 * separation between agents. The caller can pipe this into a follow-up
 * synthesis prompt if they want consensus or comparison.
 */
export function formatSwarmResults(results: SwarmResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    lines.push('');
    lines.push(`══════════════════════════════════════════════`);
    lines.push(`  ${r.agent}   (${(r.durationMs / 1000).toFixed(1)}s${r.error ? ', ERROR' : ''})`);
    lines.push(`──────────────────────────────────────────────`);
    if (r.error) {
      lines.push(`  error: ${r.error}`);
    } else {
      lines.push(r.text.trim() || '(no output)');
    }
  }
  return lines.join('\n');
}
