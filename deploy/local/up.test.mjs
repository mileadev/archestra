import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod, copyFile, mkdtemp, mkdir, readFile, rm, stat, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("local starter generates and preserves a private admin password without running real Docker", async () => {
  const root = await mkdtemp(join(tmpdir(), "archestra-local-"));
  const fixture = dirname(fileURLToPath(import.meta.url));
  try {
    const bin = join(root, "bin");
    const deploy = join(root, "deploy");
    await mkdir(bin);
    await mkdir(deploy);
    await copyFile(join(fixture, "up.sh"), join(deploy, "up.sh"));
    await copyFile(join(fixture, ".env.example"), join(deploy, ".env.example"));
    await copyFile(join(fixture, "compose.yaml"), join(deploy, "compose.yaml"));
    const dockerStub = join(bin, "docker");
    await writeFile(dockerStub, "#!/bin/sh\n[ \"$1\" = compose ] || exit 42\n", { mode: 0o700 });
    await chmod(dockerStub, 0o700);
    const run = () => spawnSync("bash", [join(deploy, "up.sh")], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    const initial = run();
    assert.equal(initial.status, 0, initial.stderr);
    const envPath = join(deploy, ".env");
    const created = await readFile(envPath, "utf8");
    const key = /(?:^|\n)ARCHESTRA_AUTH_ADMIN_PASSWORD=([0-9a-f]{48})(?:\n|$)/.exec(created);
    assert(key, "admin password must have 192 bits of random hex data");
    assert.equal((await stat(envPath)).mode & 0o777, 0o600);
    assert.equal(run().status, 0);
    assert.equal(await readFile(envPath, "utf8"), created, "restart must preserve the password");

    await writeFile(envPath, "ARCHESTRA_AUTH_ADMIN_PASSWORD=weak\n");
    const weak = run();
    assert.notEqual(weak.status, 0);
    assert.match(weak.stderr, /at least 16 characters/);

    await writeFile(envPath, "ARCHESTRA_AUTH_ADMIN_PASSWORD=\nOLLAMA_MODEL=test\n");
    assert.equal(run().status, 0);
    const repaired = await readFile(envPath, "utf8");
    assert.equal((repaired.match(/^ARCHESTRA_AUTH_ADMIN_PASSWORD=/gm) ?? []).length, 1);
    assert.match(repaired, /OLLAMA_MODEL=test/);
    assert.match(repaired, /ARCHESTRA_AUTH_ADMIN_PASSWORD=[0-9a-f]{48}/);
    assert.notEqual(repaired, created);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
