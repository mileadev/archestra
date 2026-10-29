# Archestra

Self-hostable AI platform with an LLM gateway, MCP gateway, agent runtime, security controls, and observability. This repository is a fork of [archestra-ai/archestra](https://github.com/archestra-ai/archestra).

## Quickstart

Prerequisites: Docker Engine, sufficient disk space, and network access for initial image pulls.

```bash
docker run --name archestra --restart unless-stopped \
  -p 127.0.0.1:9000:9000 -p 127.0.0.1:3000:3000 \
  -e ARCHESTRA_QUICKSTART=true \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v archestra-postgres-data:/var/lib/postgresql/data \
  -v archestra-app-data:/app/data \
  archestra/platform:<pin-a-tested-release>
```

Replace `<pin-a-tested-release>` with a verified release tag. The upstream `latest` tag can point to a release candidate. Open http://localhost:3000 after startup. The Docker socket grants the container extensive host control: use the quickstart only on a trusted, dedicated development host. Do not publish these ports to a public network.

## Providers and MCP

- **Local Ollama:** Native `/api/chat` or OpenAI-compatible `/v1`, with model discovery and tool calling.
- **Ollama Cloud:** Configure separately as a credentialed Ollama provider; availability and request compatibility depend on its published API. Do not reuse the local provider's unauthenticated settings.
- **Amazon Bedrock:** API key, SigV4, or scoped workload IAM identity; specify the region and permitted models.
- **MCP:** Expose authorized gateways over Streamable HTTP, with OAuth or scoped tokens. Connect clients from the platform's **Connect** page.

See [Local provider and MCP deployment](docs/LOCAL-DEPLOYMENT.md) for setup, tests, and security limitations.

## Development

```bash
cd platform
corepack enable
pnpm install --frozen-lockfile
pnpm preflight
pnpm lint
pnpm type-check
pnpm test
```

For source development and advanced testing, follow [Developer Quickstart](docs/pages/contributing/developer-quickstart.md). Source builds require the additional Rust, container, and infrastructure dependencies described there.

## Documentation

- [Deployment](docs/pages/admin/deployment/index.md)
- [Ollama](docs/pages/llm-proxy/providers/ollama.md)
- [Bedrock](docs/pages/llm-proxy/providers/bedrock.md)
- [MCP gateway](docs/pages/mcp/gateway.md)
- [Security and audit plan](docs/SECURITY-AUDIT-PLAN.md)

## License

See [LICENSE.md](LICENSE.md), [LICENSE_AGPL](LICENSE_AGPL), and [LICENSE_ENTERPRISE](LICENSE_ENTERPRISE). Some components are enterprise-licensed; verify scope before distribution or modification.
