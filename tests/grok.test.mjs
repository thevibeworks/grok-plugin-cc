import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";

import {
  REVIEW_TOOL_ALLOWLIST,
  TASK_READ_DISALLOWED_TOOLS,
  buildHeadlessArgs,
  sandboxEnforcerAvailable,
  importClaudeSession,
  runGrokHeadless
} from "../plugins/grok/scripts/lib/grok.mjs";
import { createFakeGrok, createTempDir } from "./helpers.mjs";

let tempDir;
let fake;
let savedPath;

before(() => {
  tempDir = createTempDir();
  fake = createFakeGrok(tempDir);
  savedPath = process.env.PATH;
  process.env.PATH = fake.env.PATH;
  process.env.FAKE_GROK_CALLS_FILE = fake.env.FAKE_GROK_CALLS_FILE;
});

after(() => {
  process.env.PATH = savedPath;
  delete process.env.FAKE_GROK_CALLS_FILE;
  delete process.env.FAKE_GROK_JSON_OUTPUT;
  delete process.env.FAKE_GROK_STREAM_OUTPUT;
  delete process.env.FAKE_GROK_EXIT_CODE;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function pairValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}

test("review mode enforces the read-only tool allowlist", () => {
  const args = buildHeadlessArgs({ prompt: "review this", mode: "review", jsonSchema: { type: "object" } });
  assert.equal(pairValue(args, "--tools"), REVIEW_TOOL_ALLOWLIST);
  assert.equal(pairValue(args, "--output-format"), "json");
  assert.ok(args.includes("--json-schema"));
  assert.ok(args.includes("--always-approve"));
  assert.ok(!args.includes("--sandbox"), "review must rely on the allowlist, not the sandbox");
});

test("task-read mode combines sandbox and write-tool denylist", () => {
  const args = buildHeadlessArgs({ prompt: "investigate", mode: "task-read", sandboxEnforced: true });
  assert.equal(pairValue(args, "--sandbox"), "read-only");
  assert.equal(pairValue(args, "--disallowed-tools"), TASK_READ_DISALLOWED_TOOLS);
  assert.equal(pairValue(args, "--output-format"), "streaming-json");
});

test("task-write mode uses the workspace sandbox", () => {
  const args = buildHeadlessArgs({
    prompt: "fix it", mode: "task-write", model: "grok-4", effort: "high", sandboxEnforced: true
  });
  assert.equal(pairValue(args, "--sandbox"), "workspace");
  assert.equal(pairValue(args, "-m"), "grok-4");
  assert.equal(pairValue(args, "--effort"), "high");
});

// Without a kernel enforcer grok refuses to start rather than warning, so a
// flag we cannot back up is a flag we must not send. #1.
test("task-read drops the sandbox when the enforcer is missing, and keeps the deny list", () => {
  const args = buildHeadlessArgs({ prompt: "investigate", mode: "task-read", sandboxEnforced: false });
  assert.ok(!args.includes("--sandbox"), "an unenforceable sandbox flag must not be sent");
  assert.equal(pairValue(args, "--disallowed-tools"), TASK_READ_DISALLOWED_TOOLS,
    "the tool-level guard is what still stops writes");
});

test("task-write refuses rather than running unsandboxed", () => {
  assert.throws(
    () => buildHeadlessArgs({ prompt: "fix it", mode: "task-write", sandboxEnforced: false }),
    /needs a workspace sandbox.*bubblewrap/s,
    "the workspace sandbox is the only guard on writes; degrading it silently is worse than failing"
  );
});

// Passing a profile that differs from the session's saved one is a hard error,
// and omitting it on resume is always accepted. So never re-assert it.
test("resuming does not re-assert a sandbox profile", () => {
  for (const mode of ["task-read", "task-write"]) {
    const args = buildHeadlessArgs({
      prompt: "continue", mode, resumeSessionId: "abc123", sandboxEnforced: true
    });
    assert.ok(!args.includes("--sandbox"), `${mode} must not re-send --sandbox on resume`);
  }
});

test("the enforcer probe honours GROK_COMPANION_SANDBOX", () => {
  const saved = process.env.GROK_COMPANION_SANDBOX;
  try {
    process.env.GROK_COMPANION_SANDBOX = "off";
    assert.equal(sandboxEnforcerAvailable("darwin"), false);
    process.env.GROK_COMPANION_SANDBOX = "on";
    assert.equal(sandboxEnforcerAvailable("linux"), true);
    delete process.env.GROK_COMPANION_SANDBOX;
    assert.equal(sandboxEnforcerAvailable("darwin"), true, "only Linux needs a package");
  } finally {
    if (saved === undefined) delete process.env.GROK_COMPANION_SANDBOX;
    else process.env.GROK_COMPANION_SANDBOX = saved;
  }
});

test("resume flag precedes the prompt", () => {
  const args = buildHeadlessArgs({ prompt: "continue", mode: "task-read", resumeSessionId: "abc123" });
  assert.ok(args.indexOf("--resume") < args.indexOf("-p"));
  assert.equal(pairValue(args, "--resume"), "abc123");
});

test("unknown mode is rejected", () => {
  assert.throws(() => buildHeadlessArgs({ prompt: "x", mode: "yolo-everything" }), /Unknown grok run mode/);
});

test("runGrokHeadless parses streaming output", async () => {
  const result = await runGrokHeadless(tempDir, { prompt: "hello", mode: "task-read" });
  assert.equal(result.status, 0);
  assert.equal(result.text, "fake stream response");
  assert.equal(result.sessionId, "fake-session-stream");
  assert.equal(result.error, null);
});

test("runGrokHeadless parses structured output in schema mode", async () => {
  const result = await runGrokHeadless(tempDir, {
    prompt: "review",
    mode: "review",
    jsonSchema: { type: "object" }
  });
  assert.equal(result.status, 0);
  assert.equal(result.sessionId, "fake-session-json");
  assert.equal(result.structuredOutput.verdict, "approve");
});

test("runGrokHeadless surfaces error objects from grok", async () => {
  process.env.FAKE_GROK_JSON_OUTPUT = JSON.stringify({ type: "error", message: "Couldn't start session" });
  process.env.FAKE_GROK_EXIT_CODE = "1";
  const result = await runGrokHeadless(tempDir, {
    prompt: "review",
    mode: "review",
    jsonSchema: { type: "object" }
  });
  delete process.env.FAKE_GROK_JSON_OUTPUT;
  delete process.env.FAKE_GROK_EXIT_CODE;
  assert.notEqual(result.status, 0);
  assert.match(result.error.message, /Couldn't start session/);
});

test("importClaudeSession resolves imported record", async () => {
  const record = await importClaudeSession(tempDir, "/fake/path/session.jsonl");
  assert.equal(record.outcome, "imported");
  assert.equal(record.sessionId, "fake-imported-session");
});

test("importClaudeSession rejects skipped imports", async () => {
  process.env.FAKE_GROK_IMPORT_OUTPUT = JSON.stringify({
    sessionId: "x",
    outcome: "skipped",
    error: "Empty session"
  });
  await assert.rejects(() => importClaudeSession(tempDir, "/fake/empty.jsonl"), /Empty session/);
  delete process.env.FAKE_GROK_IMPORT_OUTPUT;
});
