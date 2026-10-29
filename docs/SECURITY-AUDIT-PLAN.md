# Security audit and optimization plan

**Scope:** `mileadev/archestra`, indexed `main` tree on 2026-10-29 (`eaad3af83ec040b5fd4703d7b1336fb836927e3a`): 11,346 tree entries, 10,513 blobs, approximately 479.5 MB of blob contents.

**Status:** This is an actionable audit plan and targeted source review, **not** a completed source-by-source audit or a penetration-test attestation. GitHub connector access was available, but an executable repository checkout, pnpm install, container runtime, and real cloud credentials were not available in the execution environment.

## Confirmed implementation surfaces

| Area | Existing code | Assessment |
| --- | --- | --- |
| Ollama | `platform/backend/src/routes/proxy/{adapters,routes}/ollama*.ts`, model fetchers | Native and OpenAI-compatible implementations exist; audit passthrough and cloud API differences |
| Bedrock | `platform/backend/src/clients/bedrock-*.ts`, adapters, model fetchers | IAM/SigV4 and API-key modes exist; test IAM least privilege and regional discovery |
| MCP | `platform/backend/src/routes/mcp-gateway/`, `platform/frontend/src/app/connection/` | Already exposes authenticated MCP gateway; verify protocol/version/client compatibility |
| Deployment | `platform/Dockerfile`, `platform/helm`, quickstart | Docker socket gives broad host control; document risk and bound network ports |
| CI | `.github/workflows/` | Multiple pipelines present; passing status requires fresh execution |

## Prioritized security review

1. **P0: Ollama proxy escape and API breadth.** Catch-all formerly forwarded Ollama native management endpoints and native inference beyond instrumented chat. Restrict access to explicit discovery endpoints; deny pull/create/delete/push/copy/blob and uninstrumented generation. Add allow/deny and encoded-path regressions. Review the organization option that permits unauthenticated proxy calls.
2. **P0: Secrets and credential boundaries.** Inspect token forwarding on every adapter and MCP OAuth redirection; reject credential leakage across provider origins, custom upstreams, logs, and tool result surfaces. Run secret scanning including Git history; rotate confirmed exposed credentials.
3. **P0: Tool execution isolation.** Review Docker socket mounting, agent sandbox permissions, Dagger/KinD, privileged pods, egress, SSRF on remote MCP URLs and provider base URLs, and arbitrary command execution. Produce a diagram showing all trust boundaries and host escape conditions.
4. **P1: AuthZ and isolation.** Construct negative tests for gateway tenant isolation, tool assignment, token scope, cross-organization session resumption, OAuth audience/issuer/redirect handling, and API-origin checks.
5. **P1: Supply chain.** Inventory pnpm, Rust, Go, Docker build stages, vendored dependencies, externally cloned tools, Actions pinned to immutable SHAs, SBOMs, signatures, and known advisories. Verify advisories against primary disclosures before filing CVEs.
6. **P1: Provider correctness.** Local Ollama/native API, multiple Ollama nodes, cloud model discovery, streaming cancellation, tool-call result association, Bedrock regional credentials, quota enforcement, retries, rate limiting, and incomplete usage accounting.
7. **P1: MCP wire compatibility.** Test protocol negotiation, Streamable HTTP, older SSE compatibility, JSON-RPC malformed envelopes, authentication error metadata, header stripping, sessions, reconnects, tool schema and response limits.
8. **P2: Operations.** Database migration forward/backward compatibility, backup/restore, liveness/readiness, graceful shutdown, backpressure, request body limits, OTel redaction, ingress/TLS and failure injection.
9. **P2: Documentation.** Compact root README, one local quickstart, per-provider deployment instructions, machine-checkable compatibility matrix, licenses and upstream attribution.
10. **P2: Performance.** Profile hot paths, N+1 queries, token accounting, model discovery fanout, connection pool pressure, cache invalidation, UI bundles, and p50/p95/p99 under realistic concurrent workloads.

## Implemented audit instrumentation

- `platform/scripts/source-audit.mjs` enumerates **every tracked file**, hashes file content into a reproducible aggregate manifest, counts source versus binary files and records only file/line/rule for heuristic code-risk candidates. It does not emit matched source text or secrets, execute tracked source, or follow symlinks outside the checkout.
- `platform/scripts/source-audit.test.mjs` covers source-location redaction, tracked symlinks, exhaustive inventory on a controlled fixture, and non-disclosure of the matched string.
- `.github/workflows/local-provider-mcp-regression.yml` runs this audit and uploads a 14-day read-only JSON artifact for manual triage. No regex hit is automatically a vulnerability finding. Expert source/sink tracing and exploitability verification remain necessary.
- The same workflow runs authenticated MCP legacy/modern protocol negative tests, Ollama discovery and proxy regression checks, and validates the local Compose manifest without starting privileged containers.
- The fork's dependency gate uses `pnpm audit --audit-level high` in place of GitHub's unsupported Dependency Review API; upstream retains the native dependency-review action.

## Audit workflow and gates

- Generate complete file inventory and risk-weighted code ownership map; do not treat sampled files as exhaustive coverage.
- Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm type-check`, `pnpm test`, integration tests, and targeted E2E suites with a pinned toolchain; report exact failures.
- Run secret scanning, dependency advisories, Semgrep/CodeQL, container scans and SBOM checks with versioned outputs. Classify confirmed findings separately from potential exposures.
- Local integration matrix: native Ollama, OpenAI-compatible Ollama, separate cloud credentials, Bedrock temporary IAM, provider failure, MCP OAuth/token transports, at least five current harness versions; capture request/response evidence with sensitive fields redacted.
- Close each finding with file/line, triggering input, impact, fix, regression test, and validation artifact. Record remaining residual risk.
- Merge only with clean CI and review for auth, provider and deployment changes. Keep production backup/rollback plan; avoid force pushes or disabling protected branches.

## Change-log for this branch

- Add explicit Ollama passthrough endpoint policy and regression tests.
- Apply policy to OpenAI-compatible and native Ollama catch-all proxy handlers.
- Replace root README and add deployment guide.
- Add local Docker Compose configuration and source-build path for this fork.
- Add a read-only full tracked-file inventory and redacted risk-candidate report generator.
- Add direct Ollama Cloud API key requirement and redirect denial during model discovery.
- Fix OpenAI-compatible Ollama catch-all upstream root to avoid duplicate /v1 prefixes.
- Add test-only MCP protocol/auth smoke and per-client capability matrix.
- Add focused GitHub CI regression and fork-compatible dependency audit.

**Remaining limitations:** The automated inventory covers every Git-tracked file for the listed regex patterns, **not** complete semantic source auditing. The full manual audit, independent exploit validation, production Docker bring-up/restore, actual Ollama Cloud or Bedrock API calls, and every-client interoperability certification still require code review and runtime access to real endpoints and credentials. Source coverage must not be conflated with security assurance. CI evidence is recorded by its own GitHub Actions jobs.
