---
description: Check whether the Grok CLI is installed and authenticated for the Grok companion
argument-hint: ''
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(npm:*), Bash(curl:*), AskUserQuestion
---

Check the Grok companion prerequisites.

Raw slash-command arguments:
`$ARGUMENTS`

Flow:

1. Run:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" setup "$ARGUMENTS"
```
2. Return the command stdout verbatim.
3. If the report says the Grok CLI is missing and npm is available, use `AskUserQuestion` once to offer installing it with `npm install -g @xai-official/grok`. Only install after the user confirms.
4. If the report says Grok is installed but not signed in, tell the user to run `!grok login` (or `!grok login --device-auth` on machines without a browser), or to export `XAI_API_KEY` from console.x.ai.
5. Do not run `grok login` yourself; it is interactive.
