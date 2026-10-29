# Local deployment: Ollama, Bedrock, and MCP

This guide is for the `mileadev/archestra` fork. It extends Archestra's existing provider adapters; it does not add a replacement inference gateway.

## 1. Start Archestra

From the repository root:

```bash
cp deploy/local/.env.example deploy/local/.env
docker compose --env-file deploy/local/.env -f deploy/local/compose.yaml up -d
```

The example defaults to upstream stable `archestra/platform:1.4.9`, **without this fork's code changes**. To deploy the modified fork, first run:

```bash
docker build --target unified -t archestra-fork:local -f platform/Dockerfile platform
```

Set `ARCHESTRA_IMAGE=archestra-fork:local` in `deploy/local/.env`, then run the Compose command above. The build requires large native toolchain/image downloads and has not been executed in this environment.

This quickstart mounts the Docker socket and must be treated as host-privileged. Keep ports on `127.0.0.1`. Do not publish the Docker API, Ollama daemon, or backend unauthenticated. For a shared/production service use the existing [Helm chart](pages/admin/deployment/helm.md) and protected Kubernetes workloads rather than the single-host quickstart.

For source development use `docs/pages/contributing/developer-quickstart.md`.

Verify:

```bash
curl --fail --silent http://127.0.0.1:9000/health
```

A healthy response only checks startup, not provider or MCP functionality.

## 2. Local Ollama (on the Docker host)

Install Ollama independently and pull a model with tool-calling support. Verify the model responds directly before configuring Archestra.

- Docker Desktop on macOS or Windows: OpenAI-compatible base `http://host.docker.internal:11434/v1`, native base `http://host.docker.internal:11434`.
- Linux: ensure `host.docker.internal` is configured with a host-gateway mapping, or use a securely reachable host address. Do not assume Docker containers can reach `localhost` on the host.
- Remote model nodes: use `http://<trusted-host>:11434/v1` only over a trusted, firewalled network or tunnel. Prefer authenticated TLS for cross-host traffic.

In **Model Providers → Add API Key**, create one `Ollama` provider per endpoint. Select **OpenAI-compatible** for Model Router and **Native** when using Ollama-specific options (`num_ctx`, `think`, etc.). Configure the base URL for the selected transport and run **Test & Create**.

Environment defaults for the backend, when appropriate:

```dotenv
ARCHESTRA_OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
ARCHESTRA_OLLAMA_NATIVE_BASE_URL=http://host.docker.internal:11434
```

These defaults are already passed by `deploy/local/compose.yaml`. Add more Ollama nodes as separate providers with distinct Base URLs in **Model Providers**; use an authenticated TLS reverse proxy or a secured private network between hosts. On Linux, host-gateway resolution alone is insufficient if Ollama only listens on the host loopback socket. Firewall any host-network listener so it is inaccessible to untrusted clients.

## 3. Ollama Cloud

Direct hosted inference is supported by Ollama at the following published endpoints (2026-10-29):

| Transport | Provider Base URL | Underlying inference API |
| --- | --- | --- |
| OpenAI-compatible | `https://ollama.com/v1` | `POST /v1/chat/completions` |
| Native Ollama | `https://ollama.com` | `POST /api/chat` |

Create a **separate** Ollama provider with one of these Base URLs and an Ollama **API key** in **Model Providers → Add API Key**. Do not re-use an unauthenticated local provider configuration. Archestra's Ollama model discovery now explicitly requires a nonempty key for direct cloud hosts, rejects HTTP redirects for credentialed model requests, and attempts `GET /v1/models` followed by bounded optional `POST /api/show` metadata enrichment.

Use model IDs from the hosted model list (e.g. `gemma4:31b` at the time of writing), not the `:cloud` alias used by a signed-in local Ollama installation. Verify per-model tool, streaming and embeddings capabilities before assigning it to an agent; not all cloud models implement every API feature. Model-management endpoints such as pull/create/delete are intentionally blocked by Archestra's catch-all. API usage can incur charges.

Official sources: [Ollama API introduction](https://github.com/ollama/ollama/blob/main/docs/api/introduction.mdx), [authentication](https://github.com/ollama/ollama/blob/main/docs/api/authentication.mdx), and [cloud models](https://github.com/ollama/ollama/blob/main/docs/cloud.mdx). Never store keys in tracked files, shell command arguments, or GitHub Actions logs.

## 4. Amazon Bedrock

Use **Model Providers → Add API Key → Amazon Bedrock**. Prefer temporary IAM credentials or a workload role over static access keys. For a local host, use a properly scoped AWS profile or temporary session with the AWS credential chain. Configure the region that actually provides your target models. The built-in service-account flow requires:

```dotenv
ARCHESTRA_BEDROCK_IAM_AUTH_ENABLED=true
ARCHESTRA_BEDROCK_REGION=us-east-1
ARCHESTRA_BEDROCK_BASE_URL=https://bedrock-runtime.us-east-1.amazonaws.com
ARCHESTRA_BEDROCK_ALLOWED_PROVIDERS=anthropic,amazon
```

The region is an example, not a universal default. Validate IAM access, model entitlement, inference profile and region, streaming, and prompt caching separately. Use only needed IAM actions (`bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`; model listing if required), scoped to model and inference-profile resources. For the provider's exact supported modes see `docs/pages/llm-proxy/providers/bedrock.md`.

## 5. MCP gateway and harnesses

Archestra **already exposes an MCP server endpoint**, not just an MCP client. Create a personal or shared MCP gateway and assign permitted tools. The endpoint shown on the **Connect** page is the authority; its typical shape is:

```text
https://<your-reverse-proxy>/v1/mcp/<gateway-slug>
```

For local-only tests the backend is on `http://127.0.0.1:9000`. Choose OAuth (recommended for interactive clients), or a narrowly scoped token (for non-interactive clients). OAuth clients require a correct external HTTPS issuer, redirect flow, and public-origin configuration.

For Claude Code, Codex, Cursor, Claude Desktop, VS Code/GitHub Copilot, Gemini CLI, OpenCode, Pi, or other clients, **verify client-specific Streamable HTTP support**, authorization handling and configuration syntax with the installed client version. The generic contract is:

```json
{
  "mcpServers": {
    "archestra": {
      "url": "https://example.invalid/v1/mcp/my-gateway",
      "headers": {
        "Authorization": "Bearer ${ARCHESTRA_MCP_TOKEN}"
      }
    }
  }
}
```

This is an *illustrative configuration schema*, not a drop-in configuration for every harness. Never save a real token in a checked-in config or command history. Clients that only support stdio need a dedicated audited stdio-to-HTTP bridge; do not pretend a remote URL works in all clients. Use the UI-generated configuration where available.

First, run the read-only protocol/auth smoke test using a gateway-scoped token (set `ARCHESTRA_MCP_URL` and `ARCHESTRA_MCP_TOKEN` in the environment without logging the token):

```bash
node platform/scripts/mcp-smoke.mjs
```

The probe tests both `2025-11-25` and `2026-07-28` protocol paths, list operations, and anonymous rejection without executing tools. Then verify one **authorized read-only** tool call and one denied tool call in each actual harness. See [MCP harness compatibility](MCP-HARNESS-COMPATIBILITY.md); do not claim universal client compatibility based solely on protocol compliance.

## 6. Security and acceptance

- Allow only selected MCP tools; use per-user delegation rather than shared powerful credentials.
- Disable unauthenticated LLM-proxy access, constrain egress, and isolate tool execution.
- Ollama native catch-all permits read-only model discovery; use dedicated instrumented inference routes. Administrative model-management endpoints are intentionally blocked.
- Treat prompt/tool outputs as untrusted, with approval for destructive actions.
- Check image provenance, scan dependencies, redact secrets from traces, use encrypted backups, and validate recovery.
- No paid cloud call is required for local Ollama smoke tests. Bedrock and Ollama Cloud can incur usage charges.

Validation matrix: local Ollama native and OpenAI-compatible chat; tool calls; stream abort; credentials rejected; Bedrock temporary IAM; cloud endpoint health; MCP tool listing/calls; unauthorized requests; cold restart; volume recovery; and concurrent clients.

**Rollback:** pin and retain the previously working image tag/digest, back up both named volumes and all encryption keys before upgrades, and revert the Compose image reference if a migration is backward-compatible. If not, restore volumes and keys together from a consistent pre-upgrade snapshot. Never use `docker compose down -v` in a rollback; it deletes persistent data.

**Evidence required:** CI results are not equivalent to live provider checks. Document Ollama model/host versions, Bedrock model+region/role, the tested MCP harness versions and exact status, plus redacted request logs.
