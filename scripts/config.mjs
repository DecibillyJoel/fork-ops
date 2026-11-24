import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_PATH = ".github/fork-release.json";

const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "none"];
const STRING_KEYS = ["install", "test", "build", "pack", "nodeVersion"];
const UPSTREAM_PATTERN = /^[\w.-]+\/[\w.-]+$/;

function fail(message) {
  throw new Error(message);
}

function checkTagFormat(tagFormat) {
  const placeholders = tagFormat.split("{version}").length - 1;
  const braces = (tagFormat.match(/[{}]/g) ?? []).length;
  if (placeholders !== 1 || braces !== 2) {
    fail(`tagFormat must contain exactly one {version} and no other braces, got ${JSON.stringify(tagFormat)}`);
  }
}

function checkVersionFields(versionFields) {
  if (!Array.isArray(versionFields)) {
    fail("versionFields must be an array");
  }
  return versionFields.map((entry, index) => {
    const name = `versionFields[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`${name} must be an object`);
    }
    if (typeof entry.path !== "string" || entry.path === "") {
      fail(`${name}.path must be a non-empty string`);
    }
    const hasField = "field" in entry;
    const hasAddEntry = "addEntry" in entry;
    if (hasField === hasAddEntry) {
      fail(`${name} must have exactly one of field and addEntry`);
    }
    if (hasField) {
      if (typeof entry.field !== "string" || entry.field === "") {
        fail(`${name}.field must be a non-empty string`);
      }
      return { path: entry.path, field: entry.field };
    }
    if (entry.addEntry !== true) {
      fail(`${name}.addEntry must be true when it is present`);
    }
    return { path: entry.path, addEntry: true };
  });
}

function checkAssets(assets) {
  if (!Array.isArray(assets) || !assets.every((asset) => typeof asset === "string")) {
    fail("assets must be an array of strings");
  }
}

export function validateConfig(raw) {
  const source = raw ?? {};
  const config = {
    upstream: source.upstream ?? "",
    tagFormat: source.tagFormat ?? "",
    versionFields: source.versionFields ?? [],
    lockfile: source.lockfile ?? "",
    install: source.install ?? "",
    test: source.test ?? "",
    build: source.build ?? "",
    pack: source.pack ?? "",
    assets: source.assets ?? [],
    nodeVersion: source.nodeVersion ?? "",
  };

  if (typeof config.upstream !== "string" || !UPSTREAM_PATTERN.test(config.upstream)) {
    fail(`upstream must be "owner/repo", got ${JSON.stringify(config.upstream)}`);
  }
  if (typeof config.tagFormat !== "string") {
    fail(`tagFormat must be a string, got ${JSON.stringify(config.tagFormat)}`);
  }
  checkTagFormat(config.tagFormat);
  if (!LOCKFILES.includes(config.lockfile)) {
    fail(`lockfile must be one of ${LOCKFILES.join(", ")}, got ${JSON.stringify(config.lockfile)}`);
  }
  config.versionFields = checkVersionFields(config.versionFields);
  checkAssets(config.assets);
  for (const key of STRING_KEYS) {
    if (typeof config[key] !== "string") {
      fail(`${key} must be a string, got ${JSON.stringify(config[key])}`);
    }
  }

  return config;
}

export function loadConfig(root = process.cwd()) {
  const path = join(root, CONFIG_PATH);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      fail(`No ${CONFIG_PATH} in ${root}`);
    }
    throw error;
  }
  return validateConfig(JSON.parse(text));
}
