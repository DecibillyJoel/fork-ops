import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../scripts/config.mjs";

const base = {
  upstream: "owner/repo",
  tagFormat: "v{version}",
  versionFields: [{ path: "package.json", field: "version" }],
  lockfile: "package-lock.json",
  install: "npm ci",
  test: "",
  build: "",
  pack: "",
  assets: [],
  nodeVersion: "22",
};

test("accepts a complete config and defaults the empty keys", () => {
  const config = validateConfig({ ...base, install: undefined });
  assert.equal(config.install, "");
  assert.equal(config.lockfile, "package-lock.json");
});

test("accepts an empty versionFields list and lockfile none", () => {
  const config = validateConfig({ ...base, versionFields: [], lockfile: "none" });
  assert.deepEqual(config.versionFields, []);
});

test("rejects an upstream without owner and repo", () => {
  assert.throws(() => validateConfig({ ...base, upstream: "repo" }), /upstream/);
});

test("rejects a tagFormat without exactly one {version}", () => {
  assert.throws(() => validateConfig({ ...base, tagFormat: "v{version}-{version}" }), /tagFormat/);
  assert.throws(() => validateConfig({ ...base, tagFormat: "v1" }), /tagFormat/);
});

test("rejects a lockfile outside the allowed set", () => {
  assert.throws(() => validateConfig({ ...base, lockfile: "yarn.lock" }), /lockfile/);
});

test("rejects a versionField with both field and addEntry", () => {
  assert.throws(
    () => validateConfig({ ...base, versionFields: [{ path: "a.json", field: "version", addEntry: true }] }),
    /versionFields/,
  );
});
