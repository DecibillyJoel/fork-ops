import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.mjs";

const YAML_PATTERN = /^(\s*version:\s*)\S.*$/m;
const USAGE = "Usage: write-version.mjs <version>";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readJson(root, path) {
  let text;
  try {
    text = readFileSync(join(root, path), "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Cannot parse ${path} as JSON: ${error.message}`);
  }
}

function writeJson(root, path, value) {
  writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
}

function setJsonField(object, field, version, path) {
  const keys = field.split(".");
  let target = object;
  for (const key of keys.slice(0, -1)) {
    if (target === null || typeof target !== "object" || !(key in target)) {
      throw new Error(`Missing field ${field} in ${path}`);
    }
    target = target[key];
  }
  const last = keys[keys.length - 1];
  if (target === null || typeof target !== "object" || !(last in target)) {
    throw new Error(`Missing field ${field} in ${path}`);
  }
  target[last] = version;
}

function isYaml(path) {
  return /\.ya?ml$/i.test(path);
}

function setYamlVersion(root, path, version) {
  const full = join(root, path);
  let text;
  try {
    text = readFileSync(full, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${error.message}`);
  }
  if (!YAML_PATTERN.test(text)) {
    throw new Error(`No version line in ${path}`);
  }
  writeFileSync(full, text.replace(YAML_PATTERN, (_, prefix) => `${prefix}${version}`));
}

function applyEntry(root, entry, version, minAppVersion) {
  if (entry.addEntry === true) {
    if (typeof minAppVersion !== "string" || minAppVersion === "") {
      throw new Error(`minAppVersion is required to add an entry to ${entry.path}`);
    }
    const object = readJson(root, entry.path);
    object[version] = minAppVersion;
    writeJson(root, entry.path, object);
    return;
  }
  if (isYaml(entry.path)) {
    setYamlVersion(root, entry.path, version);
    return;
  }
  const object = readJson(root, entry.path);
  setJsonField(object, entry.field, version, entry.path);
  writeJson(root, entry.path, object);
}

export function writeVersion({ root = process.cwd(), config, version, minAppVersion } = {}) {
  if (typeof version !== "string" || version === "") {
    throw new Error(`version must be a non-empty string, got ${JSON.stringify(version)}`);
  }
  const fields = config?.versionFields ?? [];
  const changed = [];
  for (const entry of fields) {
    applyEntry(root, entry, version, minAppVersion);
    changed.push(entry.path);
  }
  return changed;
}

function manifestPath(config) {
  const entry = (config.versionFields ?? []).find((field) => field.path.split("/").pop() === "manifest.json");
  return entry === undefined ? "manifest.json" : entry.path;
}

function readMinAppVersion(root, config) {
  const value = readJson(root, manifestPath(config)).minAppVersion;
  return typeof value === "string" ? value : undefined;
}

function main(argv) {
  const [version] = argv;
  if (version === undefined) {
    fail(USAGE);
    return;
  }
  try {
    const config = loadConfig();
    const needsEntry = config.versionFields.some((entry) => entry.addEntry === true);
    const minAppVersion = needsEntry ? readMinAppVersion(process.cwd(), config) : undefined;
    const changed = writeVersion({ config, version, minAppVersion });
    for (const path of changed) {
      console.log(`wrote ${version} to ${path}`);
    }
  } catch (error) {
    fail(error.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
