import assert from "node:assert/strict";
import test from "node:test";
import { placeholders } from "../src/_sql-placeholders.js";

test("placeholders returns one placeholder per requested value", () => {
  assert.equal(placeholders(1), "?");
  assert.equal(placeholders(3), "?, ?, ?");
});

test("placeholders rejects non-positive counts", () => {
  assert.throws(() => placeholders(0), /placeholder count must be positive/);
});
