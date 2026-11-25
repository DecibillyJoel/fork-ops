import test from "node:test";
import assert from "node:assert/strict";
import { planRelease } from "../scripts/release-plan.mjs";

const input = {
  upstreamTag: "0.26.3",
  merged: false,
  releases: ["v0.26.2-fork.1", "v0.26.3-fork.1"],
  tags: ["v0.26.2-fork.1", "v0.26.3-fork.1"],
  currentVersion: "0.26.3",
  tagFormat: "v{version}",
};

test("a fresh merge plans a sync on the bumped base", () => {
  const plan = planRelease({ ...input, releases: ["v0.26.2-fork.1"], tags: ["v0.26.2-fork.1"] });
  assert.deepEqual(plan, { action: "sync", version: "0.26.4-fork.1", tag: "v0.26.4-fork.1" });
});

test("a merge with an existing release for the base skips", () => {
  const plan = planRelease({
    ...input,
    merged: true,
    releases: ["v0.26.2-fork.1", "v0.26.4-fork.1"],
    currentVersion: "0.26.4-fork.1",
  });
  assert.equal(plan.action, "skip");
  assert.equal(plan.version, "0.26.4-fork.1");
});

test("a merge without a release publishes the version the files hold", () => {
  const plan = planRelease({ ...input, merged: true, releases: [], currentVersion: "0.26.4-fork.2" });
  assert.deepEqual(plan, { action: "publish", version: "0.26.4-fork.2", tag: "v0.26.4-fork.2" });
});

test("a merged branch whose files hold no fork version publishes fork.1", () => {
  const plan = planRelease({ ...input, merged: true, releases: [], currentVersion: "0.26.4" });
  assert.deepEqual(plan, { action: "publish", version: "0.26.4-fork.1", tag: "v0.26.4-fork.1" });
});

test("an already-merged tag with an old-scheme release still publishes the migrated version", () => {
  const plan = planRelease({
    upstreamTag: "2.1.2",
    merged: true,
    releases: ["2.1.2-fork.1"],
    tags: ["2.1.2-fork.1"],
    currentVersion: "2.1.2-fork.1",
    tagFormat: "{version}",
  });
  assert.deepEqual(plan, { action: "publish", version: "2.1.3-fork.1", tag: "2.1.3-fork.1" });
});

test("an unparsed upstream tag throws before any work", () => {
  assert.throws(() => planRelease({ ...input, upstreamTag: "nightly-2026" }), /nightly-2026/);
});

test("a fourth numeric segment in the upstream tag throws", () => {
  assert.throws(() => planRelease({ ...input, upstreamTag: "1.2.3.4" }), /fourth|segment/i);
});

test("force publishes the next fork number over an existing release for the base", () => {
  const plan = planRelease({
    ...input,
    merged: true,
    releases: ["v0.26.4-fork.1"],
    tags: ["v0.26.4-fork.1"],
    currentVersion: "0.26.4-fork.1",
    force: true,
  });
  assert.deepEqual(plan, { action: "publish", version: "0.26.4-fork.2", tag: "v0.26.4-fork.2" });
});
