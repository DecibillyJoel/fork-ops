import test from "node:test";
import assert from "node:assert/strict";
import { parseTag, compareTags, bumpPatch, formatTag } from "../scripts/normalize-tag.mjs";

test("parses the measured tag shapes", () => {
  assert.equal(parseTag("2.1.2-fork.1"), "2.1.2-fork.1");
  assert.equal(parseTag("v0.26.3-fork.1"), "0.26.3-fork.1");
  assert.equal(parseTag("v.06"), "0.6.0");
  assert.equal(parseTag(".05"), "0.5.0");
  assert.equal(parseTag("v0.4"), "0.4.0");
  assert.equal(parseTag("2.1.2.1"), "2.1.2");
});

test("refuses a tag with no leading digit", () => {
  assert.equal(parseTag("nightly-2026"), null);
  assert.equal(parseTag(""), null);
});

test("orders fork releases numerically and above plain releases", () => {
  assert.equal(compareTags("0.1.3-fork.1", "0.1.3-fork.2"), -1);
  assert.equal(compareTags("0.1.3-fork.9", "0.1.3-fork.10"), -1);
  assert.equal(compareTags("2.1.3-fork.1", "2.1.2"), 1);
  assert.equal(compareTags("v.06", "0.6.1-fork.1"), -1);
});

test("raises the patch and drops a prerelease", () => {
  assert.equal(bumpPatch("0.6.0"), "0.6.1");
  assert.equal(bumpPatch("0.26.3"), "0.26.4");
  assert.equal(bumpPatch("1.2.3-beta.4"), "1.2.4");
});

test("formats a tag from the template", () => {
  assert.equal(formatTag("v{version}", "0.6.1-fork.1"), "v0.6.1-fork.1");
  assert.equal(formatTag("{version}", "2.1.3-fork.1"), "2.1.3-fork.1");
});
