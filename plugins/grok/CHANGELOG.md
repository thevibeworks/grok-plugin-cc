# Changelog

## 0.1.0 - 2026-07-12

Initial release.

- `/grok:review` and `/grok:adversarial-review`: structured, read-only code
  reviews via Grok headless mode with `--json-schema` output and a
  `read_file,grep,list_dir` tool allowlist.
- `/grok:rescue` + `grok:grok-rescue` subagent: task delegation with
  read-leaning defaults, `--write` opt-in, `--resume`/`--fresh` session
  routing, and background execution.
- `/grok:transfer`: import the current Claude Code transcript into Grok via
  `grok import` and print the `grok --resume` handoff command.
- `/grok:status`, `/grok:result`, `/grok:cancel`: per-workspace job control.
- `/grok:setup`: prerequisite and auth checks.
- Session lifecycle hooks record the transcript path and clean up background
  jobs at session end.
