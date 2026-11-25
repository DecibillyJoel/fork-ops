import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeVersion } from "../scripts/write-version.mjs";

const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), "fork-ops-write-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
};

test("writes JSON fields, a YAML field, and a versions entry", () => {
  const root = repo({
    "manifest.json": JSON.stringify({ version: "0.1.2", minAppVersion: "1.7.2" }),
    "package.json": JSON.stringify({ version: "0.1.2" }),
    "versions.json": JSON.stringify({ "0.1.1": "1.5.0", "0.1.2": "1.7.2" }),
    ".hermes-plugin/plugin.yaml": "name: x\nversion: 0.1.2\ndescription: y\n",
    ".claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ version: "0.1.2" }] }),
  });
  const config = {
    versionFields: [
      { path: "manifest.json", field: "version" },
      { path: "package.json", field: "version" },
      { path: "versions.json", addEntry: true },
      { path: ".hermes-plugin/plugin.yaml", field: "version" },
      { path: ".claude-plugin/marketplace.json", field: "plugins.0.version" },
    ],
  };
  const changed = writeVersion({ root, config, version: "0.1.3-fork.1", minAppVersion: "1.7.2" });

  assert.deepEqual(changed, config.versionFields.map((f) => f.path));
  const versions = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
  assert.deepEqual(versions, { "0.1.1": "1.5.0", "0.1.2": "1.7.2", "0.1.3-fork.1": "1.7.2" });
  assert.match(readFileSync(join(root, ".hermes-plugin/plugin.yaml"), "utf8"), /^version: 0\.1\.3-fork\.1$/m);
  assert.doesNotMatch(readFileSync(join(root, ".hermes-plugin/plugin.yaml"), "utf8"), /desc.*version/);
  assert.equal(JSON.parse(readFileSync(join(root, ".claude-plugin/marketplace.json"), "utf8")).plugins[0].version, "0.1.3-fork.1");
});

test("an empty versionFields list writes nothing", () => {
  const root = repo({ "README.md": "x\n" });
  assert.deepEqual(writeVersion({ root, config: { versionFields: [] }, version: "0.6.1-fork.1" }), []);
});

test("a missing declared field throws and names the path", () => {
  const root = repo({ "package.json": JSON.stringify({ name: "x" }) });
  assert.throws(
    () => writeVersion({ root, config: { versionFields: [{ path: "package.json", field: "version" }] }, version: "1.0.1-fork.1" }),
    /package\.json/,
  );
});

test("an addEntry field without a minAppVersion throws", () => {
  const root = repo({ "versions.json": JSON.stringify({}), "manifest.json": JSON.stringify({ version: "1.0.0" }) });
  assert.throws(
    () => writeVersion({ root, config: { versionFields: [{ path: "versions.json", addEntry: true }] }, version: "1.0.1-fork.1" }),
    /minAppVersion/,
  );
});

test("a YAML file with no version line throws", () => {
  const root = repo({ "plugin.yaml": "name: x\n" });
  assert.throws(
    () => writeVersion({ root, config: { versionFields: [{ path: "plugin.yaml", field: "version" }] }, version: "1.0.1-fork.1" }),
    /plugin\.yaml/,
  );
});
