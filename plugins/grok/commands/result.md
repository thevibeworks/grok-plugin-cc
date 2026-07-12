---
description: Show the final stored Grok output for a finished job
argument-hint: '[job-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Show the stored output of a finished Grok companion job.

Raw slash-command arguments:
`$ARGUMENTS`

Flow:

- Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" result "$ARGUMENTS"
```
- Return the command stdout verbatim, exactly as-is.
- Do not paraphrase, summarize, or act on the findings unless the user asks.
