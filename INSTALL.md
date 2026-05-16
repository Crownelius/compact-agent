# Installing Crowcoder

Crowcoder is a universal AI coding CLI for the terminal. After install you get
a `crowcoder` command that drops you into an interactive REPL with 80+ slash
commands, multi-agent orchestration, a bundled [everything-claude-code][ecc]
skill library, and Hermes self-improving mode.

This guide covers installation, first-run setup, and the basics of pointing
Crowcoder at any OpenAI-compatible API.

## TL;DR

```bash
# from source today — single command after this:
git clone https://github.com/Crownelius/Crowcoder.git
cd Crowcoder
npm install
npx tsc
npm link            # puts `crowcoder` on your PATH globally
crowcoder           # first run launches the setup wizard
```

Inside the REPL, type `/walkthrough` and an agent will walk you through the
features. `/help` shows every command. `Ctrl+C` exits.

## Prerequisites

- **Node.js 18 or newer.** `node --version` to check. We test on 18, 20, 22, 24.
- **An API key for at least one provider.** OpenRouter is the easiest because
  one key works across hundreds of models (including free ones). See the
  [Providers](#providers) section below for alternatives.
- **A POSIX-like shell** (macOS, Linux, WSL, or Git Bash on Windows). PowerShell
  and CMD work too — Crowcoder spawns Git Bash for shell commands on Windows.

## Install from source (current default)

Crowcoder is not yet published to npm. Until it is, install from source:

```bash
git clone https://github.com/Crownelius/Crowcoder.git
cd Crowcoder
npm install
npx tsc                # compile TypeScript -> dist/
npm link               # creates a global `crowcoder` shim
```

`npm link` creates a symlink to this checkout in your global npm bin (which is
already on `PATH` for any sane Node install). After this, `crowcoder` works
from any directory.

To uninstall later: `npm unlink -g crowcoder` (removes the global shim;
the source tree stays).

### Without `npm link`

If you prefer not to touch your global bin:

```bash
# Always run from this directory:
node ./bin/crowcoder.js

# Or alias it for your shell:
alias crowcoder='node /full/path/to/Crowcoder/bin/crowcoder.js'
```

## Install from npm (when published)

Once Crowcoder is published, a single command:

```bash
npm install -g crowcoder
crowcoder
```

Same setup wizard, same UX as the from-source install. Watch the repo's
releases for the announcement.

## First-run setup

The first time you run `crowcoder`, the setup wizard fires. It asks for:

1. **Provider.** OpenRouter is the recommended default — one key, hundreds of
   models, including free tiers. Other options: OpenAI, GLM (ZhipuAI), Ollama,
   LM Studio, DeepSeek, or a custom OpenAI-compatible endpoint.
2. **Base URL.** Pre-filled per provider. Only override if you're using a
   custom endpoint or a proxy.
3. **API key.** Stored plaintext in `~/.crowcoder/config.json` — keep that
   file private (it's only readable by you on POSIX).
4. **Model.** Pre-filled with a sensible default; you can paste any model
   slug the provider supports. For OpenRouter free tier, try
   `inclusionai/ring-2.6-1t:free`.
5. **Permission mode.** `ask` (prompt before writes/shell), `auto` (auto-OK
   non-destructive ops), or `yolo` (approve everything — fastest, riskiest).
   Default is `ask`. You can change later with `/perm <mode>`.

Your config is saved to `~/.crowcoder/config.json` and Crowcoder drops into
the REPL.

To re-run the wizard later: type `/config` inside the REPL.

## Providers

Crowcoder talks to anything that speaks the OpenAI Chat Completions API.
Suggested setups:

| Provider | Base URL | Notes |
|---|---|---|
| **[OpenRouter][or]** | `https://openrouter.ai/api/v1` | One key, 300+ models, free tier available. Recommended for new users. |
| **OpenAI** | `https://api.openai.com/v1` | Standard. Pin a model like `gpt-4o`. |
| **DeepSeek** | `https://api.deepseek.com/v1` | Cheap, strong on code. |
| **GLM (ZhipuAI)** | `https://open.bigmodel.cn/api/paas/v4` | Chinese provider. |
| **Ollama** | `http://localhost:11434/v1` | Local models. No API key needed. |
| **LM Studio** | `http://localhost:1234/v1` | Local models. No API key needed. |
| **Custom** | you provide | Anything OpenAI-compatible. |

For Anthropic specifically: the native Anthropic API is **not** OpenAI-compatible.
Use them via OpenRouter (e.g. `anthropic/claude-sonnet-4`) or a translating
proxy.

## Verifying the install

After setup, try:

```
crowcoder
```

You should see the splash, banner, and a `❯ ` prompt. Then:

```
❯ /help
❯ /walkthrough          # agent-led tour
❯ /skills               # shows the 33 bundled ECC skills
❯ /audit                # local-only project audit
❯ /exit
```

If `crowcoder` isn't found after `npm link`, see [Troubleshooting](#troubleshooting).

## What gets installed

Crowcoder is local-first:

```
~/.crowcoder/
  config.json          API key, provider, model, permissions
  usage.json           token counts, cost estimates (local only)
  hooks.json           PreToolUse / PostToolUse hook config
  sessions/            saved conversations
  instincts/           learned patterns (`/learn`, `/instincts`)
  skills/              reusable skill templates (33 from ECC + your own)
  memory/              cross-session project context
  rules/               language-specific coding rules
  hooks/               your hook scripts (if any)
  ecc-state.json       ECC install state (auto-managed)
  ecc-commands/        bundled command prompts (/ecc-feature-development etc.)
  ecc-agents/          bundled agent prompts
  checkpoints/         git state checkpoints (`/checkpoint`)
```

The first launch auto-installs the bundled
[everything-claude-code][ecc] library: 33 skills, 16 agents, 9 workflow
commands, 7 language rule bundles, 5 native security hooks. Type `/ecc` to
see the install state.

## ECC: zero-configuration skill bundle

The first time you run Crowcoder, you'll see this line during startup:

```
ECC ready: 33 skills, 16 agents, 9 commands, 7 rule sets.
```

That's the bundled [everything-claude-code][ecc] library being installed into
`~/.crowcoder/`. It adds:

- High-quality prompts for `/tdd`, `/review`, `/security-review`, `/plan`,
  `/refactor`, `/build-fix` (these use the ECC version automatically when ECC
  is installed).
- Three ECC-only commands: `/ecc-feature-development`,
  `/ecc-add-language-rules`, `/ecc-database-migration`.
- Five default security hooks: block `git --no-verify`, warn on reading
  `.env`/`.key`/`.pem`, warn when an edit leaves `console.*` statements,
  suggest tmux for dev servers.

Refresh anytime with `/ecc-install`. Disable a specific hook by editing
`~/.crowcoder/hooks.json`.

## Updating

```bash
cd Crowcoder
git pull
npm install            # in case dependencies changed
npx tsc                # rebuild
```

The next `crowcoder` invocation picks up the new dist automatically.

## Uninstall

```bash
npm unlink -g crowcoder            # remove the global shim
rm -rf ~/.crowcoder                # remove all local state (config, sessions, etc.)
rm -rf /path/to/Crowcoder          # remove the source clone
```

If you set up hooks or wrote skills, back up `~/.crowcoder/skills/` and
`~/.crowcoder/hooks.json` first.

## Troubleshooting

### `crowcoder: command not found`

`npm link` didn't put the bin shim on PATH. Verify:

```bash
npm prefix -g          # this dir should be on PATH
ls "$(npm prefix -g)/bin/crowcoder*"   # POSIX
ls "$(npm prefix -g)/crowcoder*"       # Windows
```

If it's there but not on PATH, add `npm prefix -g`'s bin dir to your shell's
PATH. On Windows that's `%APPDATA%\npm` by default.

### `DEP0040 DeprecationWarning: punycode`

Cosmetic. Crowcoder's bin already includes a filter that drops this one
specific deprecation. If you still see it, you're running an older build —
`npx tsc` again and retry.

### "Unknown tool: X" errors in mid-session

This is a feature, not a bug. Some free models hallucinate tool names like
`web_search_exa`. The error tells the model what tools actually exist
(`bash, read_file, write_file, edit_file, grep, glob, list_dir, web_fetch,
web_search`) and the model self-corrects on the next iteration.

### Free-tier rate limits (429)

OpenRouter free tier is 20 requests/minute and 200 requests/day. The model
provider sometimes lower-bounds further. Crowcoder retries 429s up to 3
times with backoff. If you're hitting limits often, switch to a paid tier
or use a local Ollama model — both are configured via `/config`.

### Permission prompts are noisy

Set `/perm auto` for most cases, or `/perm yolo` to silence them entirely.
`yolo` means the agent can write any file and run any shell command without
asking — fine for sandboxes, dangerous for your main checkout.

### Where do I report bugs?

[github.com/Crownelius/Crowcoder/issues](https://github.com/Crownelius/Crowcoder/issues).
Include your Node version, OS, the slash command you ran, and the model.

## Next steps

- Run `/walkthrough` inside Crowcoder for an interactive tour.
- See [README.md](README.md) for the feature reference and slash-command list.
- Try `/mode hermes` for self-improving learning-loop mode (search past
  sessions, distill skills from experience, propose what's worth banking
  before finishing a task).

[ecc]: https://github.com/Crownelius/everything-claude-code
[or]: https://openrouter.ai
