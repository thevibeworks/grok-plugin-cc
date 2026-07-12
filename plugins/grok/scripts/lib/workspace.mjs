import path from "node:path";

import { runCommand } from "./process.mjs";

export function resolveWorkspaceRoot(cwd) {
  const resolved = path.resolve(cwd ?? process.cwd());
  const result = runCommand("git", ["rev-parse", "--show-toplevel"], { cwd: resolved });
  if (!result.error && result.status === 0) {
    const top = String(result.stdout ?? "").trim();
    if (top) {
      return top;
    }
  }
  return resolved;
}
