import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { PLUGIN_ROOT, REPO_ROOT } from "./helpers.mjs";

const EXPECTED_COMMANDS = [
  "adversarial-review",
  "cancel",
  "rescue",
  "result",
  "review",
  "setup",
  "status",
  "transfer"
];

function parseFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${filePath} must start with YAML frontmatter`);
  const fields = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator > 0 && !line.startsWith(" ") && !line.startsWith("-")) {
      fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return { fields, body: content.slice(match[0].length) };
}

test("all expected commands exist with description frontmatter", () => {
  for (const command of EXPECTED_COMMANDS) {
    const filePath = path.join(PLUGIN_ROOT, "commands", `${command}.md`);
    assert.ok(fs.existsSync(filePath), `missing command: ${command}`);
    const { fields } = parseFrontmatter(filePath);
    assert.ok(fields.description, `${command}.md needs a description`);
  }
});

test("companion-invoking commands reference the companion script", () => {
  for (const command of EXPECTED_COMMANDS) {
    const { body } = parseFrontmatter(path.join(PLUGIN_ROOT, "commands", `${command}.md`));
    assert.match(body, /grok-companion\.mjs/, `${command}.md should invoke the companion script`);
  }
});

test("plugin.json and marketplace.json agree on name and version", () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, ".claude-plugin", "marketplace.json"), "utf8")
  );

  const entry = marketplace.plugins.find((candidate) => candidate.name === plugin.name);
  assert.ok(entry, "marketplace must list the grok plugin");
  assert.equal(entry.version, plugin.version);
  assert.equal(entry.source, "./plugins/grok");
  assert.equal(marketplace.metadata.version, plugin.version);
});

test("hooks.json wires SessionStart and SessionEnd to the lifecycle hook", () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "hooks", "hooks.json"), "utf8"));
  for (const event of ["SessionStart", "SessionEnd"]) {
    const entries = hooks.hooks[event];
    assert.ok(Array.isArray(entries) && entries.length > 0, `missing ${event} hook`);
    assert.match(entries[0].hooks[0].command, /session-lifecycle-hook\.mjs/);
  }
});

test("review schema is valid JSON with the expected contract", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "schemas", "review-output.schema.json"), "utf8")
  );
  assert.deepEqual(schema.required, ["verdict", "summary", "findings", "next_steps"]);
  assert.deepEqual(schema.properties.verdict.enum, ["approve", "needs-attention"]);
});

test("prompt templates carry the placeholders the companion interpolates", () => {
  for (const name of ["review", "adversarial-review"]) {
    const template = fs.readFileSync(path.join(PLUGIN_ROOT, "prompts", `${name}.md`), "utf8");
    for (const placeholder of ["{{TARGET_LABEL}}", "{{USER_FOCUS}}", "{{REVIEW_COLLECTION_GUIDANCE}}", "{{REVIEW_INPUT}}"]) {
      assert.ok(template.includes(placeholder), `${name}.md missing ${placeholder}`);
    }
  }
});

test("rescue agent exists and forwards to the companion task runtime", () => {
  const agent = fs.readFileSync(path.join(PLUGIN_ROOT, "agents", "grok-rescue.md"), "utf8");
  assert.match(agent, /name: grok-rescue/);
  assert.match(agent, /grok-companion\.mjs" task/);
});
