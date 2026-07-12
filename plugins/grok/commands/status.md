---
description: Show running and recent Grok jobs for the current repository
argument-hint: '[job-id] [--all]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Show Grok companion job status.

Raw slash-command arguments:
`$ARGUMENTS`

Flow:

- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" status "$ARGUMENTS"
```
- Return the command stdout verbatim. Do not paraphrase or summarize.
- Do not fetch results, cancel jobs, or take any follow-up action unless the user asks.
