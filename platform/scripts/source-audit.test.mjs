import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assessSource, inventoryRepository } from "./source-audit.mjs";

test("flags locations and rule IDs without exposing source text", () => {
  const secret = "really-sensitive-private-string";
  const result = assessSource([
    "const x = true;",
    `eval(userInput); // ${secret}`,
    "const y = 3;",
  ].join("\n"));
  assert.equal(result.lines, 3);
  assert.deepEqual(result.candidates, [{ line: 2, rule: "dynamic_evaluation" }]);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("audits every tracked file including symlinks without traversing them", async () => {
  const root = await mkdtemp(join(tmpdir(), "archestra-audit-"));
  try {
    execFileSync("git", ["init", "-q", root]);
    await mkdir(join(root, "code"));
    await writeFile(join(root, "code", "main.ts"), "eval(untrusted);\n");
    await writeFile(join(root, "code", "test.unit.test.ts"), "eval(fake);\n");
    await writeFile(join(root, "binary.dat"), Buffer.from([0, 1, 2]));
    await symlink("code", join(root, "code-link"));
    execFileSync("git", ["-C", root, "add", "."]);
    const report = await inventoryRepository(root);
    assert.deepEqual(report.inventory.failures, []);
    assert.equal(report.inventory.totalTrackedFiles, 4);
    assert.equal(report.inventory.scannedSourceFiles, 2);
    assert.equal(report.inventory.otherOrBinaryFiles, 2);
    assert.equal(report.inventory.manifestSha256.length, 64);
    assert.equal(report.candidates.length, 2);
    assert(report.candidates.some((item) =>
      item.file === "code/main.ts" && item.category === "application"
    ));
    assert(report.candidates.some((item) =>
      item.file === "code/test.unit.test.ts" && item.category === "test_or_fixture"
    ));
    assert(report.candidates.every((item) => !("matchedSource" in item)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
