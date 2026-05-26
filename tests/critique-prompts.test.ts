/**
 * Coverage for F5+ DeCRIM 3-stage critique prompts in src/query.ts.
 *
 * The 3 prompts encode the DeCRIM (Decompose-Critique-Refine)
 * structure from arxiv 2410.06458. Each stage has a specific
 * leverage point:
 *
 *   decompose — Forces explicit enumeration of requirements from
 *               the ORIGINAL task before any self-judgment. Without
 *               this, weak models confirm their own confidence.
 *
 *   critique  — Per-item PASS/FAIL with concrete evidence demanded.
 *               "I implemented it" doesn't count; "I ran X and saw
 *               Y" does.
 *
 *   refine    — Only the FAIL items get redone, plus weak-PASS
 *               re-verifications.
 *
 * These tests pin the prompts to their essential characteristics so
 * a careless tweak doesn't quietly turn the gate back into the
 * generic-critique flavor from v1.34.0.
 */
import { describe, it, expect } from 'vitest';
import { critiquePromptFor } from '../src/query.js';

describe('critiquePromptFor', () => {
  describe('decompose stage', () => {
    const prompt = critiquePromptFor('decompose');

    it('mentions the original task as the source of truth', () => {
      expect(prompt.toLowerCase()).toContain('original task');
    });

    it('asks for a numbered list of requirements', () => {
      expect(prompt.toLowerCase()).toMatch(/numbered/);
      expect(prompt.toLowerCase()).toContain('list');
    });

    it('demands quotes from the task, not paraphrase', () => {
      expect(prompt.toLowerCase()).toContain('quote');
      expect(prompt.toLowerCase()).toContain('do not paraphrase');
    });

    it('asks how the requirement is verifiable', () => {
      expect(prompt.toLowerCase()).toMatch(/verif/);
    });

    it('does not yet ask the model to judge — only to enumerate', () => {
      // The judgment step comes in stage 2. Stage 1 should not
      // contain PASS/FAIL framing.
      expect(prompt).not.toMatch(/\bPASS\b/);
      expect(prompt).not.toMatch(/\bFAIL\b/);
    });
  });

  describe('critique stage', () => {
    const prompt = critiquePromptFor('critique');

    it('demands PASS or FAIL per item', () => {
      expect(prompt).toContain('PASS');
      expect(prompt).toContain('FAIL');
    });

    it('demands concrete evidence', () => {
      expect(prompt.toLowerCase()).toContain('evidence');
      expect(prompt.toLowerCase()).toMatch(/file path|command output|test/);
    });

    it('explicitly rejects "I implemented it" as evidence', () => {
      expect(prompt.toLowerCase()).toContain('"i implemented it"');
      expect(prompt.toLowerCase()).toMatch(/not evidence/);
    });

    it('encourages honesty over false confidence', () => {
      // The "social cost" framing is empirically important for weak
      // models — they default to self-confirmation otherwise.
      expect(prompt.toLowerCase()).toMatch(/honest|honestly/);
    });

    it('says when uncertain, mark FAIL', () => {
      expect(prompt.toLowerCase()).toMatch(/uncertain.*fail|when in doubt|if you are uncertain/);
    });
  });

  describe('refine stage', () => {
    const prompt = critiquePromptFor('refine');

    it('only targets FAIL items + weak-evidence PASSes', () => {
      expect(prompt.toLowerCase()).toContain('fail');
      expect(prompt.toLowerCase()).toMatch(/weak|reflection/);
    });

    it('does not re-do every item — only the failing ones', () => {
      // Critical anti-pattern guard: if this prompt drifts to "redo
      // everything", it becomes Reflexion (known to hurt weak
      // models). DeCRIM only refines failures.
      const lower = prompt.toLowerCase();
      expect(lower).toMatch(/each fail|fail item|failing/);
      expect(lower).not.toContain('redo everything');
      expect(lower).not.toContain('rewrite all');
    });

    it('allows exit when everything is genuinely PASS', () => {
      expect(prompt.toLowerCase()).toMatch(/summar/);
      expect(prompt.toLowerCase()).toContain('stop');
    });
  });

  describe('stage discipline (regression guards)', () => {
    it('decompose does not leak into critique', () => {
      // Stage 1 prompt should NOT include the verdict step
      const decompose = critiquePromptFor('decompose');
      expect(decompose).not.toMatch(/\bPASS \|\| FAIL\b/);
    });

    it('all 3 prompts are non-empty and distinct', () => {
      const a = critiquePromptFor('decompose');
      const b = critiquePromptFor('critique');
      const c = critiquePromptFor('refine');
      expect(a.length).toBeGreaterThan(100);
      expect(b.length).toBeGreaterThan(100);
      expect(c.length).toBeGreaterThan(50);
      expect(a).not.toBe(b);
      expect(b).not.toBe(c);
      expect(a).not.toBe(c);
    });
  });
});
