---
description: Cancel an active background Grok job
argument-hint: '[job-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Cancel a running Grok companion job.

Raw slash-command arguments:
`$ARGUMENTS`

Flow:

- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" cancel "$ARGUMENTS"
```
- Return the command stdout verbatim.
- If the command reports multiple active jobs, show that message as-is so the user can pick a job id.
