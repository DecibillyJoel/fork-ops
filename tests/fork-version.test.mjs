import test from "node:test";
import assert from "node:assert/strict";
import { nextForkVersion } from "../scripts/fork-version.mjs";

test("gives N = 1 for a base with no tag", () => {
  assert.equal(nextForkVersion({ base: "2.1.3", tags: ["2.1.2", "2.1.2-fork.1"] }), "2.1.3-fork.1");
});

test("counts only the matching base", () => {
  const tags = ["0.26.2-fork.1", "0.26.3-fork.1", "0.26.4-fork.1", "0.26.4-fork.2"];
  assert.equal(nextForkVersion({ base: "0.26.4", tags }), "0.26.4-fork.3");
});

test("treats a current file version on the same base as taken", () => {
  assert.equal(nextForkVersion({ base: "0.1.3", tags: [], current: "0.1.3-fork.3" }), "0.1.3-fork.4");
});

test("ignores prefixed tags and a different base", () => {
  assert.equal(nextForkVersion({ base: "0.6.1", tags: ["v0.6.1-fork.1", "v.06-fork.1"] }), "0.6.1-fork.2");
});

test("refuses a base that is not major.minor.patch", () => {
  assert.throws(() => nextForkVersion({ base: "0.6", tags: [] }), /base/);
  assert.throws(() => nextForkVersion({ base: "0.6.1-fork.1", tags: [] }), /base/);
});

test("refuses a result that does not outrank an existing tag", () => {
  assert.throws(
    () => nextForkVersion({ base: "0.6.1", tags: ["6.0.0-fork.1"] }),
    /does not outrank/,
  );
});
