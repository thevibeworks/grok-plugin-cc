---
description: Import the current Claude Code session into Grok and print a resume command
argument-hint: '[--source <path-to-claude-jsonl>]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Transfer the current Claude Code conversation into a Grok session.

Raw slash-command arguments:
`$ARGUMENTS`

Flow:

- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" transfer "$ARGUMENTS"
```
- Return the command stdout verbatim. It includes the Grok session ID and the `grok --resume <id>` command.
- The plugin's `SessionStart` hook supplies the current transcript path automatically; `--source` is a manual override for importing a different transcript. The source must live under `~/.claude/projects`.
- Do not launch `grok --resume` yourself; it opens an interactive TUI.
