# Archestra

Self-hostable AI platform with an LLM gateway, an MCP gateway, agent runtime, tool policy, authentication, and observability. Fork of [archestra-ai/archestra](https://github.com/archestra-ai/archestra).

## Local deployment

Docker quickstart (**single trusted development host only**):

```bash
bash deploy/local/up.sh
curl --fail http://127.0.0.1:9000/health
```

Open <http://127.0.0.1:3000> with `admin@example.com` and the generated password in `deploy/local/.env` (mode 0600). Change the password after initial sign-in. The example runs the upstream stable image `archestra/platform:1.4.9` (Docker Hub confirmed 2026-10-29); it does **not** contain this fork's changes. To run the patched checkout, build the repository's existing Dockerfile:

```bash
docker build --target unified -t archestra-fork:local -f platform/Dockerfile platform
# Set ARCHESTRA_IMAGE=archestra-fork:local in deploy/local/.env
bash deploy/local/up.sh
```

**Security:** This quickstart mounts the Docker socket and can control the host. Keep exposed ports on loopback. Use the Kubernetes deployment, dedicated nodes, ingress TLS, network policies, and scoped workload identities for shared or production installations.

## Providers

- **Ollama Local:** `http://host.docker.internal:11434/v1` (OpenAI-compatible) or `http://host.docker.internal:11434` (native); one provider key per reachable model node.
- **Ollama Cloud:** `https://ollama.com/v1` (OpenAI-compatible) or `https://ollama.com` (native). Requires a separate Ollama API key. Cloud inference may incur charges.
- **Amazon Bedrock:** configured provider credentials, temporary AWS IAM role or SigV4, region-specific model access and IAM resource scoping.
- **MCP:** authenticated per-user or shared gateway at `/v1/mcp/<gateway-slug>`, compatible with clients supporting Streamable HTTP; OAuth and bearer-token flows depend on the client.

See [local setup and validation](docs/LOCAL-DEPLOYMENT.md) and [harness compatibility](docs/MCP-HARNESS-COMPATIBILITY.md).

## Development and checks

Prerequisites and environment: [Developer Quickstart](docs/pages/contributing/developer-quickstart.md).

```bash
cd platform
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm type-check
pnpm test
```

Run read-only MCP wire and auth checks with `node platform/scripts/mcp-smoke.mjs` after setting `ARCHESTRA_MCP_URL` and `ARCHESTRA_MCP_TOKEN`.

## Documentation and license

[Deployment](docs/pages/admin/deployment/index.md) · [Ollama](docs/pages/llm-proxy/providers/ollama.md) · [Bedrock](docs/pages/llm-proxy/providers/bedrock.md) · [MCP gateway](docs/pages/mcp/gateway.md) · [Audit and optimization plan](docs/SECURITY-AUDIT-PLAN.md)

Dual AGPL/Enterprise licensing: [LICENSE.md](LICENSE.md), [LICENSE_AGPL](LICENSE_AGPL), [LICENSE_ENTERPRISE](LICENSE_ENTERPRISE). Retain upstream copyright and licensed components.
