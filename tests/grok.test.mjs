import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";

import {
  REVIEW_TOOL_ALLOWLIST,
  TASK_READ_DISALLOWED_TOOLS,
  buildHeadlessArgs,
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
  const args = buildHeadlessArgs({ prompt: "investigate", mode: "task-read" });
  assert.equal(pairValue(args, "--sandbox"), "read-only");
  assert.equal(pairValue(args, "--disallowed-tools"), TASK_READ_DISALLOWED_TOOLS);
  assert.equal(pairValue(args, "--output-format"), "streaming-json");
});

test("task-write mode uses the workspace sandbox", () => {
  const args = buildHeadlessArgs({ prompt: "fix it", mode: "task-write", model: "grok-4", effort: "high" });
  assert.equal(pairValue(args, "--sandbox"), "workspace");
  assert.equal(pairValue(args, "-m"), "grok-4");
  assert.equal(pairValue(args, "--effort"), "high");
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
