import semver from "semver";
import { pathToFileURL } from "node:url";

const COERCE_OPTIONS = { includePrerelease: true, loose: true };
const USAGE = "Usage: normalize-tag.mjs <tag> | --base <tag> | --format <template> <version>";

function prepare(tag) {
  const stripped = tag.replace(/^[vV]/, "");
  const text = stripped.startsWith(".") ? `0${stripped}` : stripped;
  return /^\d/.test(text) ? text : null;
}

export function parseTag(tag) {
  if (typeof tag !== "string") {
    return null;
  }
  const text = prepare(tag);
  if (text === null) {
    return null;
  }
  return semver.coerce(text, COERCE_OPTIONS)?.version ?? null;
}

export function compareTags(a, b) {
  const left = parseTag(a);
  const right = parseTag(b);
  if (left === null || right === null) {
    return null;
  }
  return semver.compare(left, right);
}

export function bumpPatch(version) {
  const parsed = semver.parse(version);
  if (parsed === null) {
    throw new Error(`Cannot parse version: ${version}`);
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

export function formatTag(tagFormat, version) {
  return tagFormat.replace("{version}", version);
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function main(argv) {
  const [first, ...rest] = argv;

  if (first === "--base") {
    const tag = rest[0];
    const parsed = parseTag(tag);
    if (parsed === null) {
      fail(`Cannot parse tag: ${tag}`);
      return;
    }
    console.log(bumpPatch(parsed));
    return;
  }

  if (first === "--format") {
    const [template, version] = rest;
    if (template === undefined || version === undefined) {
      fail(USAGE);
      return;
    }
    const parsed = parseTag(version);
    if (parsed === null) {
      fail(`Cannot parse tag: ${version}`);
      return;
    }
    console.log(formatTag(template, parsed));
    return;
  }

  if (first === undefined) {
    fail(USAGE);
    return;
  }

  const parsed = parseTag(first);
  if (parsed === null) {
    fail(`Cannot parse tag: ${first}`);
    return;
  }
  console.log(parsed);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
