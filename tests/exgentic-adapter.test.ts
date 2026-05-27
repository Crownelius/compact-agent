import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import pkg from '../package.json' with { type: 'json' };

describe('Exgentic adapter packaging', () => {
  const adapterDir = join(process.cwd(), 'resources', 'exgentic', 'ventipus_agent');
  const agentPath = join(adapterDir, 'agent.py');
  const utilsPath = join(adapterDir, 'utils.py');
  const setupPath = join(adapterDir, 'setup.sh');
  const requirementsPath = join(adapterDir, 'requirements.txt');

  it('ships an Exgentic custom agent package', () => {
    expect(existsSync(agentPath)).toBe(true);
    expect(existsSync(utilsPath)).toBe(true);
    expect(existsSync(setupPath)).toBe(true);
    expect(existsSync(requirementsPath)).toBe(true);

    const agent = readFileSync(agentPath, 'utf-8');
    expect(agent).toContain('class VentipusAgent(Agent)');
    expect(agent).toContain('class VentipusAgentInstance(AgentInstance)');
    expect(agent).toContain('slug_name: ClassVar[str] = "ventipus_agent"');
    expect(agent).toContain('def react(self, observation: Observation | None) -> Action | None');
    expect(agent).toContain('VENTIPUS_EXGENTIC_COMMAND');
    expect(agent).toContain('--benchmark-trace-dir');
    expect(agent).toContain('summary.json');
    expect(agent).toContain('{"name":"<action name>","arguments":{}}');
    expect(agent).toContain('def _profile_for_exgentic');
    expect(agent).toContain('/benchmark {profile} Exgentic task');
    expect(agent).toContain('## Available action names');
    expect(agent).toContain('## Folded session state');
    expect(agent).toContain('fold_exgentic_history');
    expect(agent).toContain('return "appworld"');
    expect(agent).toContain('return "browsecomp"');
    expect(agent).toContain('return "tau2"');
  });

  it('prints the packaged Exgentic agent directory from the CLI wrapper', () => {
    const out = execFileSync('node', ['bin/ventipus.js', '--print-exgentic-agent'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }).trim();
    expect(normalize(out)).toBe(normalize(adapterDir));
  });

  it('prints CLI help and version without entering first-time setup', () => {
    const help = execFileSync('node', ['bin/ventipus.js', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    expect(help).toContain('Usage:');
    expect(help).toContain('ventipus [options]');
    expect(help).toContain('--prompt <text>');
    expect(help).toContain('--doctor');
    expect(help).not.toContain('First-time Setup');

    const version = execFileSync('node', ['bin/ventipus.js', '--version'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }).trim();
    expect(version).toBe(pkg.version);
  });

  it('ships and prints an Open Agent Leaderboard agent card', () => {
    const cardPath = join(process.cwd(), 'resources', 'open_agent_leaderboard', 'ventipus-agent-card.md');
    expect(existsSync(cardPath)).toBe(true);
    const card = readFileSync(cardPath, 'utf-8');
    expect(card).toContain('name: Ventipus');
    expect(card).toContain('## Architecture');
    expect(card).toContain('## Memory');
    expect(card).toContain('## Evaluation Results');
    expect(card).toContain('submissionReady:false');
    expect(card).toContain('ventipus --print-exgentic-agent');

    const out = execFileSync('node', ['bin/ventipus.js', '--print-open-agent-card'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }).trim();
    expect(normalize(out)).toBe(normalize(cardPath));
  });

  it('accepts common harness CLI flags before the Exgentic utility flag', () => {
    const out = execFileSync('node', [
      'bin/ventipus.js',
      '--model',
      'openrouter/free',
      '--max-turns=3',
      '--output-format',
      'text',
      '--benchmark-trace-dir',
      'artifacts',
      '--print-exgentic-agent',
    ], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }).trim();
    expect(normalize(out)).toBe(normalize(adapterDir));
  });

  it('parses ventipus action JSON from stdout', () => {
    const samples = [
      'notes\n{"name":"finish","arguments":{"answer":"42"}}',
      '```json\n{"action":"message","arguments":{"content":"done"}}\n```',
      'ventipus-exgentic action JSON: {"action":{"name":"click","arguments":{"x":1}}}',
    ];
    const script = [
      `import json, sys`,
      `sys.path.insert(0, ${JSON.stringify(adapterDir)})`,
      `import utils`,
      `samples = ${JSON.stringify(samples)}`,
      `payloads = [utils.extract_action_payload(sample) for sample in samples]`,
      `print(json.dumps([{"name": p.name, "arguments": p.arguments} for p in payloads], sort_keys=True))`,
    ].join('\n');
    const out = execFileSync('python', ['-c', script], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
      },
    }).trim();
    const parsed = JSON.parse(out);
    expect(parsed).toEqual([
      { name: 'finish', arguments: { answer: '42' } },
      { name: 'message', arguments: { content: 'done' } },
      { name: 'click', arguments: { x: 1 } },
    ]);
  });

  it('folds noisy Exgentic history into a compact task ledger', () => {
    const history = [
      { role: 'observation', content: { user: 'Ava', order_id: 'ord-1', status: 'pending' } },
      {
        role: 'ventipus',
        returncode: 0,
        stdout: 'large harmless model transcript '.repeat(100),
        stderr: '',
      },
      {
        role: 'selected_action',
        content: [{ name: 'lookup_order', arguments: { order_id: 'ord-1', verbose: true } }],
      },
      {
        role: 'ventipus',
        returncode: 1,
        stdout: 'unknown action selected',
        stderr: 'schema mismatch for action',
      },
    ];
    const script = [
      `import json, sys`,
      `sys.path.insert(0, ${JSON.stringify(adapterDir)})`,
      `import utils`,
      `history = json.loads(${JSON.stringify(JSON.stringify(history))})`,
      `folded = utils.fold_exgentic_history(history, profile="tau2", item_limit=220)`,
      `print(json.dumps(folded, sort_keys=True))`,
    ].join('\n');
    const out = execFileSync('python', ['-c', script], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
      },
    }).trim();
    const folded = JSON.parse(out);
    expect(folded.format).toBe('ventipus-exgentic-folded-history-v1');
    expect(folded.profile).toBe('tau2');
    expect(folded.latest_observation.summary).toContain('ord-1');
    expect(folded.latest_action.actions[0].name).toBe('lookup_order');
    expect(folded.latest_action.actions[0].argument_keys).toEqual(['order_id', 'verbose']);
    expect(folded.action_counts.lookup_order).toBe(1);
    expect(folded.diagnostics[0].evidence).toContain('schema mismatch');
    expect(JSON.stringify(folded)).not.toContain('large harmless model transcript large harmless model transcript large harmless model transcript');
  });

  it('compiles the Python adapter files without writing __pycache__ into resources', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventipus-exgentic-pycompile-'));
    try {
      const script = [
        'import py_compile',
        `py_compile.compile(${JSON.stringify(agentPath)}, cfile=${JSON.stringify(join(dir, 'agent.pyc'))}, doraise=True)`,
        `py_compile.compile(${JSON.stringify(utilsPath)}, cfile=${JSON.stringify(join(dir, 'utils.pyc'))}, doraise=True)`,
      ].join('\n');
      execFileSync('python', ['-c', script], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
