import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseTag, compareTags, bumpPatch, formatTag } from "./normalize-tag.mjs";
import { nextForkVersion } from "./fork-version.mjs";

const FOUR_SEGMENTS = /^\d+\.\d+\.\d+\.\d+/;

function parseUpstream(tag) {
  const text = typeof tag === "string" ? tag.replace(/^[vV]/, "") : "";
  if (FOUR_SEGMENTS.test(text)) {
    throw new Error(`Upstream tag has a fourth numeric segment: ${tag}`);
  }
  const parsed = parseTag(tag);
  if (parsed === null) {
    throw new Error(`Cannot parse upstream tag: ${tag}`);
  }
  return parsed;
}

function forkVersions(releases, base) {
  const pattern = new RegExp(`^${base.replace(/\./g, "\\.")}-fork\\.(\\d+)$`);
  const matched = [];
  for (const release of releases) {
    const version = parseTag(release);
    if (version !== null && pattern.test(version)) {
      matched.push(version);
    }
  }
  return matched;
}

function highest(versions) {
  return versions.reduce((best, version) => (compareTags(version, best) > 0 ? version : best));
}

function plan(tagFormat, action, version) {
  return { action, version, tag: formatTag(tagFormat, version) };
}

export function planRelease({
  upstreamTag,
  merged = false,
  releases = [],
  tags = [],
  currentVersion = "",
  tagFormat = "v{version}",
} = {}) {
  const upstream = parseUpstream(upstreamTag);
  const base = bumpPatch(upstream);

  if (!merged) {
    return plan(tagFormat, "sync", nextForkVersion({ base, tags }));
  }

  const seen = [...forkVersions(releases, base), ...forkVersions(releases, upstream)];
  if (seen.length > 0) {
    return plan(tagFormat, "skip", highest(seen));
  }

  const held = forkVersions([currentVersion], base);
  if (held.length > 0) {
    return plan(tagFormat, "publish", held[0]);
  }
  return plan(tagFormat, "publish", `${base}-fork.1`);
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function main() {
  let text;
  try {
    text = readFileSync(0, "utf8");
  } catch (error) {
    fail(`Cannot read stdin: ${error.message}`);
    return;
  }
  let input;
  try {
    input = JSON.parse(text);
  } catch (error) {
    fail(`Cannot parse stdin as JSON: ${error.message}`);
    return;
  }
  try {
    console.log(JSON.stringify(planRelease(input)));
  } catch (error) {
    fail(error.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
