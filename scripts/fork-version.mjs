import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { compareTags } from "./normalize-tag.mjs";

const BASE_PATTERN = /^\d+\.\d+\.\d+$/;
const USAGE = "Usage: fork-version.mjs <base> [current]";

function stripPrefix(tag) {
  return typeof tag === "string" ? tag.replace(/^[vV]/, "") : "";
}

function countFork(text, base) {
  const pattern = new RegExp(`^${base.replace(/\./g, "\\.")}-fork\\.(\\d+)$`);
  const match = pattern.exec(text);
  return match === null ? 0 : Number(match[1]);
}

export function nextForkVersion({ base, tags = [], current = "" } = {}) {
  if (typeof base !== "string" || !BASE_PATTERN.test(base)) {
    throw new Error(`base must be major.minor.patch, got ${JSON.stringify(base)}`);
  }

  let highest = countFork(stripPrefix(current), base);
  for (const tag of tags) {
    highest = Math.max(highest, countFork(stripPrefix(tag), base));
  }

  const version = `${base}-fork.${highest + 1}`;
  for (const tag of tags) {
    const order = compareTags(version, tag);
    if (order !== null && order <= 0) {
      throw new Error(`Result ${version} does not outrank ${tag}`);
    }
  }
  return version;
}

function readTags() {
  try {
    return execFileSync("git", ["tag", "-l"], { encoding: "utf8" })
      .split("\n")
      .filter((tag) => tag !== "");
  } catch (error) {
    throw new Error(`Cannot list tags: ${error.message}`);
  }
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function main(argv) {
  const [base, current = ""] = argv;
  if (base === undefined) {
    fail(USAGE);
    return;
  }
  try {
    console.log(nextForkVersion({ base, tags: readTags(), current }));
  } catch (error) {
    fail(error.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
