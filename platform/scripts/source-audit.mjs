#!/usr/bin/env node
/**
 * Non-executing, read-only inventory and heuristic risk triage for every tracked
 * repository file. Findings are review candidates, not proven vulnerabilities.
 * Prints locations and pattern IDs only; never writes matched source/secrets.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rs", ".go",
  ".py", ".sh", ".bash", ".yaml", ".yml", ".json", ".toml",
  ".sql", ".dockerfile",
]);
const RISK_PATTERNS = [
  ["dynamic_evaluation", /\b(?:eval|new Function)\s*\(/],
  ["shell_execution", /\b(?:execSync|execFileSync|spawnSync|Command::new|subprocess\.Popen|os\.system)\s*\(/],
  ["tls_verification_disabled", /\b(?:rejectUnauthorized\s*:\s*false|verify\s*=\s*False|insecureSkipVerify\s*:\s*true)\b/i],
  ["insecure_host_binding", /\b(?:0\.0\.0\.0|hostNetwork\s*:\s*true)\b/],
  ["privileged_container", /\b(?:privileged\s*:\s*true|allowPrivilegeEscalation\s*:\s*true)\b/],
  ["permissive_chmod", /\b(?:chmod\s+777|chmodSync\s*\([^,]+,\s*0o?777)\b/],
  ["dynamic_import_or_require", /\b(?:import\s*\(|require\s*\()\s*[^'"\x60\s]/],
];

export function assessSource(text) {
  const candidates = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const [rule, matcher] of RISK_PATTERNS) {
      if (matcher.test(lines[i])) candidates.push({ line: i + 1, rule });
    }
  }
  return { lines: lines.length, candidates };
}

export async function inventoryRepository(root) {
  const names = execFileSync("git", ["-C", root, "ls-files", "-z"], {
    maxBuffer: 32 * 1024 * 1024,
  }).toString("utf8").split("\0").filter(Boolean);
  let bytes = 0;
  let sourceFiles = 0;
  let binaryOrNonCodeFiles = 0;
  let lines = 0;
  const candidates = [];
  const failures = [];
  const sha = createHash("sha256");

  for (const name of names) {
    try {
      const filePath = join(root, name);
      const stat = await lstat(filePath);
      const buffer = stat.isSymbolicLink()
        ? Buffer.from(await readlink(filePath))
        : stat.isDirectory()
          ? Buffer.from("gitlink")
          : await readFile(filePath);
      bytes += buffer.length;
      sha.update(name);
      sha.update("\0");
      sha.update(createHash("sha256").update(buffer).digest());
      const ext = extname(name).toLowerCase();
      const isCode = CODE_EXTENSIONS.has(ext) ||
        /(^|\/)(Dockerfile|Makefile|Containerfile|Tiltfile)$/.test(name);
      if (!isCode || !stat.isFile() || buffer.includes(0)) {
        binaryOrNonCodeFiles++;
        continue;
      }
      sourceFiles++;
      const result = assessSource(buffer.toString("utf8"));
      lines += result.lines;
      for (const candidate of result.candidates) {
        candidates.push({
          file: name,
          line: candidate.line,
          rule: candidate.rule,
          category: /(^|\/)(test|tests|fixtures|e2e-tests|mcp-catalog|vendor)\//.test(name) ||
            /\.(?:test|spec|fixture)\./.test(name) ? "test_or_fixture" : "application",
        });
      }
    } catch (error) {
      failures.push({ file: name, code: error?.code ?? "IO_ERROR" });
    }
  }

  return {
    schemaVersion: 1,
    purpose: "heuristic-review-queue",
    disclaimer: "Not a vulnerability finding, proof of absence, or complete semantic audit.",
    inventory: {
      totalTrackedFiles: names.length,
      scannedSourceFiles: sourceFiles,
      otherOrBinaryFiles: binaryOrNonCodeFiles,
      scannedSourceLines: lines,
      totalBytesRead: bytes,
      manifestSha256: sha.digest("hex"),
      failures,
    },
    candidates,
  };
}

const mainPath = process.argv[1];
if (mainPath && import.meta.url === pathToFileURL(resolve(mainPath)).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  try {
    const report = await inventoryRepository(root);
    const outputPath = process.env.ARCHESTRA_SOURCE_AUDIT_OUTPUT ||
      join(root, ".artifacts", "source-audit.json");
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", {
      mode: 0o600,
    });
    console.log(JSON.stringify({
      fileCount: report.inventory.totalTrackedFiles,
      sourceFileCount: report.inventory.scannedSourceFiles,
      candidates: report.candidates.length,
      unreadable: report.inventory.failures.length,
      output: outputPath,
    }));
    if (report.inventory.failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Audit inventory failed");
    process.exitCode = 1;
  }
}
