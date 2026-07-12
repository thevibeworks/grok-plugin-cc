import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";

import { createTempDir } from "./helpers.mjs";

let tempDir;
let state;

before(async () => {
  tempDir = createTempDir();
  process.env.CLAUDE_PLUGIN_DATA = tempDir;
  state = await import("../plugins/grok/scripts/lib/state.mjs");
});

after(() => {
  delete process.env.CLAUDE_PLUGIN_DATA;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("state dir lands under CLAUDE_PLUGIN_DATA", () => {
  const dir = state.resolveStateDir(tempDir);
  assert.ok(dir.startsWith(tempDir), `${dir} should be under ${tempDir}`);
});

test("upsertJob inserts then patches a job", () => {
  state.upsertJob(tempDir, { id: "job-1", title: "First", status: "running" });
  state.upsertJob(tempDir, { id: "job-1", status: "completed" });

  const jobs = state.listJobs(tempDir);
  const job = jobs.find((entry) => entry.id === "job-1");
  assert.equal(job.status, "completed");
  assert.equal(job.title, "First");
  assert.ok(job.createdAt);
  assert.ok(job.updatedAt);
});

test("job files round-trip and prune with state", () => {
  state.upsertJob(tempDir, { id: "job-2", title: "Second", status: "completed" });
  const jobFile = state.writeJobFile(tempDir, "job-2", { id: "job-2", payload: { answer: 42 } });
  assert.deepEqual(state.readJobFile(jobFile).payload, { answer: 42 });

  state.saveState(tempDir, { config: {}, jobs: state.listJobs(tempDir).filter((job) => job.id !== "job-2") });
  assert.equal(fs.existsSync(jobFile), false, "pruned job file should be removed");
});

test("corrupt state file degrades to defaults", () => {
  fs.writeFileSync(state.resolveStateFile(tempDir), "{not json");
  const loaded = state.loadState(tempDir);
  assert.deepEqual(loaded.jobs, []);
});
