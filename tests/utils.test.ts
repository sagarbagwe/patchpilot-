import assert from "node:assert/strict";
import test from "node:test";
import { parseRepository } from "../lib/utils";

test("parseRepository accepts a GitHub URL", () => {
  assert.deepEqual(parseRepository("https://github.com/acme/payments-api.git"), {
    owner: "acme",
    repo: "payments-api",
    slug: "acme/payments-api",
  });
});

test("parseRepository accepts owner/repository", () => {
  assert.equal(parseRepository("vercel/ai").slug, "vercel/ai");
});

test("parseRepository rejects nested or malformed paths", () => {
  assert.throws(() => parseRepository("acme/team/payments"));
  assert.throws(() => parseRepository("only-an-owner"));
  assert.throws(() => parseRepository("acme/payments api"));
});
