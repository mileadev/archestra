import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { probeGateway, validateGatewayUrl } from "./mcp-smoke.mjs";

let server;
let url;
const methods = [];

before(async () => {
  server = createServer(async (req, res) => {
    let payload = "";
    for await (const chunk of req) payload += chunk.toString();
    const body = JSON.parse(payload);
    methods.push(body.method);
    res.setHeader("content-type", "application/json");
    if (req.headers.authorization !== "Bearer test-token") {
      res.writeHead(401, { "www-authenticate": "Bearer" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    if (body.method === "initialize") {
      res.end(JSON.stringify({
        jsonrpc: "2.0", id: body.id,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: { tools: {} },
          serverInfo: { name: "test-gateway", version: "1" },
        },
      }));
      return;
    }
    if (body.method === "server/discover") {
      assert.equal(req.headers["mcp-protocol-version"], "2026-07-28");
      assert.equal(req.headers["mcp-method"], "server/discover");
      res.end(JSON.stringify({
        jsonrpc: "2.0", id: body.id,
        result: { serverInfo: { name: "test-gateway", version: "1" } },
      }));
      return;
    }
    if (body.method === "tools/list") {
      res.end(JSON.stringify({
        jsonrpc: "2.0", id: body.id,
        result: { tools: [{ name: "read_only", inputSchema: { type: "object" } }] },
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}/v1/mcp/test-gateway`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("requires loopback for plaintext HTTP and forbids credentials in URL", () => {
  assert.equal(validateGatewayUrl(url), url);
  assert.throws(() => validateGatewayUrl("http://gateway.example/v1/mcp/x"), /HTTPS/);
  assert.throws(() => validateGatewayUrl("https://user:secret@gateway.example/v1/mcp/x"), /HTTPS/);
  assert.throws(() => validateGatewayUrl("https://gateway.example/v1/mcp/x?token=abc"), /HTTPS/);
  assert.throws(() => validateGatewayUrl("https://gateway.example/admin"), /HTTPS/);
});

test("fails closed without a token", async () => {
  await assert.rejects(probeGateway(url, ""), /TOKEN/);
});

test("tests both MCP eras without calling a tool", async () => {
  methods.length = 0;
  const result = await probeGateway(url, "test-token", "both");
  assert.deepEqual(result, { legacy: 1, modern: 1 });
  assert.deepEqual(methods, [
    "tools/list", "initialize", "tools/list", "server/discover", "tools/list",
  ]);
  assert.equal(methods.includes("tools/call"), false);
});

test("invalid protocol fails locally", async () => {
  await assert.rejects(probeGateway(url, "test-token", "unrecognized"), /protocol/);
});

test("denies anonymous tool listing", async () => {
  const anonymous = createServer(async (_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [] },
    }));
  });
  await new Promise((resolve) => anonymous.listen(0, "127.0.0.1", resolve));
  try {
    const openUrl = `http://127.0.0.1:${anonymous.address().port}/v1/mcp/open`;
    await assert.rejects(probeGateway(openUrl, "test-token"), /not denied/);
  } finally {
    await new Promise((resolve) => anonymous.close(resolve));
  }
});
