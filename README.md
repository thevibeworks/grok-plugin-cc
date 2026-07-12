# Grok plugin for Claude Code

Use xAI's [Grok CLI](https://x.ai/cli) from inside Claude Code for code reviews or to delegate tasks to Grok.

This is the Grok counterpart to OpenAI's [codex-plugin-cc](https://github.com/openai/codex-plugin-cc): same workflow, same command shapes, driven by the Grok CLI's headless mode instead of the Codex app server.

> Unofficial community plugin by [thevibeworks](https://github.com/thevibeworks). Not affiliated with xAI or Anthropic.

## What You Get

- `/grok:review` for a read-only Grok code review of your working tree or branch
- `/grok:adversarial-review` for a steerable challenge review that attacks the design, not just the code
- `/grok:rescue`, `/grok:transfer`, `/grok:status`, `/grok:result`, and `/grok:cancel` to delegate work, hand off sessions, and manage background jobs

## Requirements

- **Grok CLI** (`grok`) signed in with an xAI account, or an `XAI_API_KEY` from [console.x.ai](https://console.x.ai)
- **Node.js 18.18 or later**

Usage contributes to your Grok usage limits.

## Install

Add the marketplace in Claude Code:

```bash
/plugin marketplace add thevibeworks/grok-plugin-cc
```

Install the plugin:

```bash
/plugin install grok@grok-cc
```

Reload plugins, then check prerequisites:

```bash
/grok:setup
```

If the Grok CLI is missing, install it yourself with:

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
# or
npm install -g @xai-official/grok
```

If Grok is installed but not signed in:

```bash
!grok login                # browser OAuth
!grok login --device-auth  # headless machines / containers
```

One simple first run:

```bash
/grok:review
/grok:status
/grok:result
```

## Usage

### `/grok:review`

Runs a Grok code review on your current work.

- `--base <ref>` reviews your branch against a base branch
- `--scope working-tree|branch` forces the target instead of auto-detection
- `--wait` / `--background` choose the execution mode up front
- optional trailing text focuses the review (e.g. `/grok:review pay special attention to error handling`)

```bash
/grok:review
/grok:review --base main
/grok:review --background
```

The review is read-only by construction: Grok runs with a tool allowlist of `read_file`, `grep`, and `list_dir` — no shell, no write tools, no subagents. Findings come back as structured JSON (severity, file, lines, confidence, recommendation) and are rendered verbatim.

### `/grok:adversarial-review`

Same targeting as `/grok:review`, but the prompt instructs Grok to break confidence in the change: attack trust boundaries, data-loss paths, race conditions, rollback safety, and hidden assumptions.

```bash
/grok:adversarial-review
/grok:adversarial-review --base main challenge whether this caching design survives concurrent writers
/grok:adversarial-review --background look for race conditions
```

### `/grok:rescue`

Hands a task to Grok through the `grok:grok-rescue` subagent.

```bash
/grok:rescue investigate why the tests started failing
/grok:rescue fix the failing test with the smallest safe patch
/grok:rescue --resume apply the top fix from the last run
/grok:rescue --model grok-4 --effort high investigate the flaky integration test
/grok:rescue --background investigate the regression
```

- Default rescues run read-leaning: Grok keeps its shell for running tests and git, but loses the direct file-edit tools and runs under Grok's `read-only` OS sandbox where the kernel supports it.
- `--write` switches to a write-capable run under Grok's `workspace` sandbox.
- `--resume` continues the latest rescue session for this repo; `--fresh` forces a new one. Without either flag the plugin offers to continue when a resumable session exists.
- Model and reasoning effort default to Grok's own choices; pass `--model` / `--effort` to override.

You can also just ask: "Ask Grok to redesign the database connection to be more resilient."

### `/grok:transfer`

Imports the current Claude Code conversation into Grok (via `grok import`) and prints a `grok --resume <session-id>` command so you can continue the same context in the Grok TUI.

```bash
/grok:transfer
/grok:transfer --source ~/.claude/projects/<project>/<session-id>.jsonl
```

The plugin's `SessionStart` hook supplies the current transcript path automatically; `--source` is a manual override. Sources must live under `~/.claude/projects`.

### `/grok:status`, `/grok:result`, `/grok:cancel`

Job control for background work:

```bash
/grok:status              # running and recent jobs for this repo
/grok:status task-abc123  # one job in detail
/grok:result              # stored output of the latest finished job
/grok:result task-abc123
/grok:cancel task-abc123
```

Results include the Grok session ID, so any finished or cancelled run can be reopened directly in Grok with `grok --resume <session-id>`.

## Security Model

Three different enforcement layers, applied per command:

| Command            | Enforcement                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `review` / `adversarial-review` | Tool allowlist (`read_file,grep,list_dir`): no shell, no writes, no subagents. Holds everywhere, including containers. |
| `rescue` (default) | Grok `read-only` OS sandbox + file-edit tools removed. Shell stays available for tests/git. |
| `rescue --write`   | Grok `workspace` sandbox, auto-approved tools. |

Caveat worth knowing: Grok's OS sandbox uses Landlock (Linux) / Seatbelt (macOS). In containers without Landlock the sandbox silently degrades, which means a default rescue's shell could still write files. The review commands do not have this problem — their allowlist removes the shell entirely. If you need hard guarantees for rescues, run them in a disposable environment.

## Grok Integration

The plugin wraps the Grok CLI's [headless mode](https://x.ai/cli) (`grok -p` with `--output-format json|streaming-json`). It uses the global `grok` binary and your existing `~/.grok` configuration and login. Reviews use `--json-schema` for validated structured output; task delegation records the Grok session ID so follow-ups can `--resume` it.

Model and effort defaults come from your own Grok config (`~/.grok/config.toml`).

## FAQ

**Do I need a separate Grok account?** No. The plugin uses your local Grok CLI authentication — browser login or `XAI_API_KEY`.

**Does it use a separate runtime?** No. It shells out to the same `grok` binary you use directly, with the same config, credentials, and repository checkout.

**Where does job state live?** Under Claude's plugin data directory (or the OS temp dir as fallback), scoped per workspace. `SessionEnd` cleans up still-running jobs started by that Claude session.

## Development

```bash
npm test   # node --test, no dependencies
```

The test suite covers the argument parser, job state store, git context collection, grok invocation flags (including the review allowlist), rendering, and an end-to-end companion run against a fake `grok` binary.

## Credits

Architecture and command UX closely follow OpenAI's [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) (Apache-2.0). See [NOTICE](NOTICE).

## License

Apache-2.0
