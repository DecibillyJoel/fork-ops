// Resolves merge conflicts in the version files, then sets the fork version.
//
// Only the configured versionFields paths and the configured lockfile are
// touched. Each one is merged three ways: the base stage, the fork side and
// the upstream side. The fork side wins a real conflict, so fork-only fields
// (author, repository URLs) survive and upstream dependency bumps still land.
//
// A conflicted path outside that allowlist stops the run with exit code 3.
// A merged manifest.json without minAppVersion stops the run with exit code 1.
//
// Prints the resolved version on success.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.mjs";
import { nextForkVersion } from "./fork-version.mjs";
import { writeVersion } from "./write-version.mjs";

const USAGE = "Usage: resolve-version-conflicts.mjs <base-version>";

const readStage = (root, stage, file) => {
  try {
    return JSON.parse(
      execFileSync("git", ["show", `:${stage}:${file}`], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return undefined;
  }
};

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const mergeJson = (base, ours, theirs) => {
  if (same(ours, theirs)) return ours;
  if (same(base, theirs)) return ours;
  if (same(base, ours)) return theirs;
  if (isObject(base) && isObject(ours) && isObject(theirs)) {
    const merged = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
      merged[key] = mergeJson(base[key], ours[key], theirs[key]);
    }
    return merged;
  }
  return ours;
};

function coded(message, exitCode) {
  const error = new Error(message);
  error.exitCode = exitCode;
  return error;
}

function allowlist(config) {
  const paths = (config?.versionFields ?? []).map((entry) => entry.path);
  const lockfile = config?.lockfile;
  if (typeof lockfile === "string" && lockfile !== "" && lockfile !== "none") {
    paths.push(lockfile);
  }
  return paths;
}

function readLines(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");
}

function readJson(root, path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function manifestPath(config) {
  const entry = (config?.versionFields ?? []).find((field) => field.path.split("/").pop() === "manifest.json");
  return entry === undefined ? "manifest.json" : entry.path;
}

export function resolveConflicts({ root = process.cwd(), config, base } = {}) {
  const allowed = allowlist(config);

  for (const path of readLines(root, ["diff", "--name-only", "--diff-filter=U"])) {
    if (!allowed.includes(path)) {
      throw coded(`Conflicted path outside the allowlist: ${path}`, 3);
    }
  }

  const mergedFiles = {};

  for (const path of allowed) {
    const ancestor = readStage(root, 1, path);
    const ours = readStage(root, 2, path);
    const theirs = readStage(root, 3, path);

    if (ancestor === undefined && ours === undefined && theirs === undefined) continue;

    mergedFiles[path] = mergeJson(ancestor, ours ?? {}, theirs ?? {});
  }

  for (const [path, merged] of Object.entries(mergedFiles)) {
    writeFileSync(join(root, path), JSON.stringify(merged, null, "\t"));
  }

  const manifest = readJson(root, manifestPath(config));
  const minAppVersion = manifest.minAppVersion;

  if (typeof minAppVersion !== "string") {
    throw coded("The merged manifest.json has no minAppVersion.", 1);
  }

  const version = nextForkVersion({
    base,
    tags: readLines(root, ["tag", "-l"]),
    current: typeof manifest.version === "string" ? manifest.version : "",
  });

  writeVersion({ root, config, version, minAppVersion });

  return version;
}

function fail(message, exitCode = 1) {
  console.error(message);
  process.exitCode = exitCode;
}

function main(argv) {
  const [base] = argv;
  if (base === undefined) {
    fail(USAGE, 2);
    return;
  }
  try {
    const config = loadConfig();
    console.log(resolveConflicts({ config, base }));
  } catch (error) {
    fail(error.message, error.exitCode ?? 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
