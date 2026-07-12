import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import {
  collectReviewContext,
  resolveReviewTarget
} from "../plugins/grok/scripts/lib/git.mjs";
import { createTempDir, createTempGitRepo } from "./helpers.mjs";

let tempDir;
let repoDir;
let git;

before(() => {
  tempDir = createTempDir();
  ({ repoDir, git } = createTempGitRepo(tempDir));
});

after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("resolveReviewTarget picks working tree when dirty", () => {
  fs.writeFileSync(path.join(repoDir, "app.js"), "console.log('changed');\n");
  const target = resolveReviewTarget(repoDir, {});
  assert.equal(target.mode, "working-tree");
});

test("collectReviewContext inlines a small working-tree diff", () => {
  const target = resolveReviewTarget(repoDir, { scope: "working-tree" });
  const context = collectReviewContext(repoDir, target);
  assert.equal(context.inputMode, "inline-diff");
  assert.match(context.content, /Unstaged Diff/);
  assert.match(context.content, /console\.log\('changed'\)/);
  assert.deepEqual(context.changedFiles, ["app.js"]);
});

test("collectReviewContext includes untracked file bodies", () => {
  fs.writeFileSync(path.join(repoDir, "notes.txt"), "untracked content\n");
  const target = resolveReviewTarget(repoDir, { scope: "working-tree" });
  const context = collectReviewContext(repoDir, target);
  assert.match(context.content, /untracked content/);
  fs.rmSync(path.join(repoDir, "notes.txt"));
});

test("collectReviewContext falls back to summary for oversized diffs", () => {
  const target = resolveReviewTarget(repoDir, { scope: "working-tree" });
  const context = collectReviewContext(repoDir, target, { maxInlineDiffBytes: 8 });
  assert.equal(context.inputMode, "self-collect");
  assert.match(context.collectionGuidance, /read_file/);
  assert.doesNotMatch(context.content, /console\.log\('changed'\)/);
});

test("branch review target uses explicit base and collects commit log", () => {
  git(["checkout", "--quiet", "-b", "feature"]);
  git(["stash", "--quiet"]);
  fs.writeFileSync(path.join(repoDir, "feature.js"), "export const on = true;\n");
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "add feature flag"]);

  const target = resolveReviewTarget(repoDir, { base: "main" });
  assert.equal(target.mode, "branch");
  assert.equal(target.baseRef, "main");

  const context = collectReviewContext(repoDir, target);
  assert.equal(context.inputMode, "inline-diff");
  assert.match(context.content, /add feature flag/);
  assert.match(context.content, /feature\.js/);
});

test("resolveReviewTarget rejects unknown scopes", () => {
  assert.throws(() => resolveReviewTarget(repoDir, { scope: "staged-only" }), /Unsupported review scope/);
});
