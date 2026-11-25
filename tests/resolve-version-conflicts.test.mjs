import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConflicts } from "../scripts/resolve-version-conflicts.mjs";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });

const addFiles = (root, files, side) => {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), `${body} ${side}\n`);
  }
};

const conflictRepo = (extra = {}) => {
  const root = mkdtempSync(join(tmpdir(), "fork-ops-merge-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "t@example.com");
  git(root, "config", "user.name", "t");
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ version: "0.1.2", minAppVersion: "1.7.2", author: "fork" }, null, "\t"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.1.2", name: "x" }, null, "\t"));
  git(root, "add", "-A");
  git(root, "commit", "-m", "base");
  git(root, "checkout", "-b", "upstream");
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ version: "0.1.3", minAppVersion: "1.7.2", author: "fork" }, null, "\t"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.1.3", name: "x" }, null, "\t"));
  addFiles(root, extra, "upstream");
  git(root, "add", "-A");
  git(root, "commit", "-am", "upstream bump");
  git(root, "checkout", "main");
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ version: "0.1.2", minAppVersion: "1.7.2", author: "fork-edited" }, null, "\t"));
  addFiles(root, extra, "fork");
  git(root, "add", "-A");
  git(root, "commit", "-am", "fork edit");
  try {
    git(root, "merge", "--no-commit", "--no-ff", "upstream");
  } catch {
    /* the merge leaves the tree conflicted on purpose */
  }
  return root;
};

test("resolves the version files and leaves fork-only fields intact", () => {
  const root = conflictRepo();
  const config = {
    versionFields: [
      { path: "manifest.json", field: "version" },
      { path: "package.json", field: "version" },
    ],
    lockfile: "none",
  };
  const version = resolveConflicts({ root, config, base: "0.1.3" });

  assert.match(version, /^0\.1\.3-fork\.\d+$/);
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  assert.equal(manifest.version, version);
  assert.equal(manifest.author, "fork-edited");
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, version);
});

test("refuses a conflicted path outside the allowlist", () => {
  const root = conflictRepo({ "src/index.ts": "source" });
  const config = { versionFields: [{ path: "manifest.json", field: "version" }], lockfile: "none" };
  assert.throws(() => resolveConflicts({ root, config, base: "0.1.3" }), /src\//);
});
