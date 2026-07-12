import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArgs, splitRawArgumentString } from "../plugins/grok/scripts/lib/args.mjs";

test("splitRawArgumentString tokenizes flags and quoted text", () => {
  assert.deepEqual(
    splitRawArgumentString(`--base main "challenge the caching design" trailing`),
    ["--base", "main", "challenge the caching design", "trailing"]
  );
});

test("splitRawArgumentString handles empty and whitespace input", () => {
  assert.deepEqual(splitRawArgumentString(""), []);
  assert.deepEqual(splitRawArgumentString("   "), []);
});

test("splitRawArgumentString rejects unbalanced quotes", () => {
  assert.throws(() => splitRawArgumentString(`--focus "unbalanced`), /Unbalanced/);
});

test("parseArgs separates options and positionals", () => {
  const { options, positionals } = parseArgs(
    ["--base", "main", "--json", "look", "for", "races"],
    { valueOptions: ["base"], booleanOptions: ["json"] }
  );
  assert.equal(options.base, "main");
  assert.equal(options.json, true);
  assert.deepEqual(positionals, ["look", "for", "races"]);
});

test("parseArgs supports --opt=value and aliases", () => {
  const { options } = parseArgs(["--scope=branch", "-m", "grok-4"], {
    valueOptions: ["scope", "model"],
    aliasMap: { m: "model" }
  });
  assert.equal(options.scope, "branch");
  assert.equal(options.model, "grok-4");
});

test("parseArgs rejects unknown flags and missing values", () => {
  assert.throws(() => parseArgs(["--nope"], {}), /Unknown flag/);
  assert.throws(() => parseArgs(["--base"], { valueOptions: ["base"] }), /requires a value/);
});

test("parseArgs passes through everything after --", () => {
  const { positionals } = parseArgs(["--json", "--", "--not-a-flag"], { booleanOptions: ["json"] });
  assert.deepEqual(positionals, ["--not-a-flag"]);
});
