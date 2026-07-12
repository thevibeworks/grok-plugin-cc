import { spawnSync } from "node:child_process";
import process from "node:process";

const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024;

export function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
    maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    shell: false,
    windowsHide: true
  });
}

export function formatCommandFailure(result) {
  const stderr = String(result.stderr ?? "").trim();
  const stdout = String(result.stdout ?? "").trim();
  return stderr || stdout || `command exited with status ${result.status}`;
}

export function runCommandChecked(command, args, options = {}) {
  const result = runCommand(command, args, options);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}: ${formatCommandFailure(result)}`);
  }
  return result;
}

export function binaryAvailable(command, args = ["--version"], options = {}) {
  const result = runCommand(command, args, options);
  if (result.error || result.status !== 0) {
    return { available: false, version: null };
  }
  return {
    available: true,
    version: String(result.stdout ?? "").trim().split("\n")[0] || null
  };
}

export function terminateProcessTree(pid) {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }

  if (process.platform === "win32") {
    const result = runCommand("taskkill", ["/pid", String(pid), "/T", "/F"]);
    return result.status === 0;
  }

  let signalled = false;
  // Detached workers are process-group leaders; a negative pid signals the group.
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, "SIGTERM");
      signalled = true;
    } catch {
      // Group or process already gone.
    }
  }
  return signalled;
}
