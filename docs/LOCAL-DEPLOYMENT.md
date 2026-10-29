# Local deployment: Ollama, Bedrock, and MCP

This guide is for the `mileadev/archestra` fork. It extends Archestra's existing provider adapters; it does not add a replacement inference gateway.

## 1. Start Archestra

Use the pinned-image quickstart in the repository README. Its embedded container runtime uses the Docker socket and must be treated as host-privileged. Keep ports bound to `127.0.0.1`. If remote clients need access, configure an HTTPS reverse proxy with authentication and a controlled public origin; do not expose an unauthenticated Docker API, Ollama, or backend.

For source development, see `docs/pages/contributing/developer-quickstart.md`.

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

These values are configuration examples, not a standalone Docker Compose environment. Pass them to the application container or set the provider Base URL in the UI. Do not bind Ollama to every host interface unless separately protected by firewall and authentication.

## 3. Ollama Cloud

Create a **separate** Ollama provider and configure its current official endpoint and API key in the provider settings. Check whether the selected cloud model supports the Ollama-native or OpenAI-compatible API, streaming, tool calling, embeddings, and model listing before enabling each feature.

Do not assume local-only operations such as `/api/show`, `/api/pull`, or `/api/ps` exist in Ollama Cloud. If cloud model discovery lacks a compatible endpoint, it requires a dedicated fetcher and tests rather than masquerading as a local server. Never place a cloud credential in the README, .env.example, source, or a GitHub Action log.

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

Test with a compliant MCP client: initialize/discover, list tools, call an authorized read-only tool, reject an unauthorized call, verify refresh/reconnect, then verify an expired token is denied. Use per-client compatibility evidence, not an unsupported claim of universal harness support.

## 6. Security and acceptance

- Allow only selected MCP tools; use per-user delegation rather than shared powerful credentials.
- Disable unauthenticated LLM-proxy access, constrain egress, and isolate tool execution.
- Ollama native catch-all permits read-only model discovery; use dedicated instrumented inference routes. Administrative model-management endpoints are intentionally blocked.
- Treat prompt/tool outputs as untrusted, with approval for destructive actions.
- Check image provenance, scan dependencies, redact secrets from traces, use encrypted backups, and validate recovery.
- No paid cloud call is required for local Ollama smoke tests. Bedrock and Ollama Cloud can incur usage charges.

Validation matrix: local Ollama native and OpenAI-compatible chat; tool calls; stream abort; credentials rejected; Bedrock temporary IAM; cloud endpoint health; MCP tool listing/calls; unauthorized requests; cold restart; volume recovery; and concurrent clients.
