#!/usr/bin/env node
/**
 * Zero-dependency MCP gateway probe for authenticated Streamable HTTP.
 * Read-only: initialization, discovery, and tools/list; no tools/call.
 * No credentials or tool results are printed.
 *
 * ARCHESTRA_MCP_URL=https://gateway.example/v1/mcp/my-gateway
 * ARCHESTRA_MCP_TOKEN=... node platform/scripts/mcp-smoke.mjs
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const PROTOCOL_LEGACY = "2025-11-25";
const PROTOCOL_MODERN = "2026-07-28";
const MAX_RESPONSE_BYTES = 1_048_576;

export function validateGatewayUrl(raw) {
  const url = new URL(raw);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/v1\/mcp\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)
  ) {
    throw new Error(
      "Gateway URL must be an HTTPS /v1/mcp/<gateway> endpoint (HTTP only for loopback), without credentials or query",
    );
  }
  return url.toString();
}

async function boundedText(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const parts = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        throw new Error("MCP response exceeds 1 MiB");
      }
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function jsonRpcResponse(payload, contentType) {
  if (contentType.includes("text/event-stream")) {
    // SSE data may contain multiple JSON-RPC messages. Select the last result.
    const events = payload
      .split(/\r?\n\r?\n/)
      .map((event) =>
        event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n"),
      )
      .filter((data) => data && data !== "[DONE]");
    if (!events.length) throw new Error("MCP returned empty SSE response");
    return JSON.parse(events[events.length - 1]);
  }
  return JSON.parse(payload);
}

async function sendMcp(url, token, method, params, opts = {}) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(opts.sessionId ? { "mcp-session-id": opts.sessionId } : {}),
    ...(opts.protocol
      ? { "mcp-protocol-version": opts.protocol }
      : {}),
    ...(opts.protocol === PROTOCOL_MODERN
      ? { "mcp-method": method }
      : {}),
  };
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method,
    ...(params ? { params } : {}),
  };
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // Do not display the upstream response body; it may contain private data.
    return { status: response.status, result: undefined, sessionId: undefined };
  }
  const wire = await boundedText(response);
  const result = jsonRpcResponse(wire, response.headers.get("content-type") ?? "");
  if (result.error) throw new Error(`MCP ${method} returned JSON-RPC error ${result.error.code}`);
  if (result.id !== 1 || !result.result) {
    throw new Error(`MCP ${method} missing correlated result`);
  }
  return {
    status: response.status,
    result: result.result,
    sessionId: response.headers.get("mcp-session-id") ?? undefined,
  };
}

export async function probeGateway(rawUrl, token, protocol = "both") {
  const url = validateGatewayUrl(rawUrl);
  if (!token) throw new Error("ARCHESTRA_MCP_TOKEN must be set");
  if (!["legacy", "modern", "both"].includes(protocol)) {
    throw new Error("protocol must be legacy, modern, or both");
  }
  const anonymous = await sendMcp(url, null, "tools/list");
  if (anonymous.status !== 401 && anonymous.status !== 403) {
    throw new Error("Unauthenticated tools/list was not denied");
  }
  const results = {};
  if (protocol !== "modern") {
    const init = await sendMcp(url, token, "initialize", {
      protocolVersion: PROTOCOL_LEGACY,
      capabilities: {},
      clientInfo: { name: "archestra-readonly-smoke", version: "1.0.0" },
    });
    if (init.status !== 200 || !init.result.protocolVersion) {
      throw new Error(`Legacy MCP initialization failed (HTTP ${init.status})`);
    }
    const list = await sendMcp(url, token, "tools/list", {}, {
      sessionId: init.sessionId,
      protocol: init.result.protocolVersion,
    });
    if (list.status !== 200 || !Array.isArray(list.result?.tools)) {
      throw new Error(`Legacy MCP tools/list failed (HTTP ${list.status})`);
    }
    results.legacy = list.result.tools.length;
  }
  if (protocol !== "legacy") {
    const meta = {
      "io.modelcontextprotocol/protocolVersion": PROTOCOL_MODERN,
      "io.modelcontextprotocol/clientInfo": {
        name: "archestra-readonly-smoke",
        version: "1.0.0",
      },
      "io.modelcontextprotocol/clientCapabilities": {},
    };
    const discover = await sendMcp(url, token, "server/discover", {
      _meta: meta,
    }, { protocol: PROTOCOL_MODERN });
    if (discover.status !== 200) {
      throw new Error(`Modern MCP discovery failed (HTTP ${discover.status})`);
    }
    const list = await sendMcp(url, token, "tools/list", {
      _meta: meta,
    }, { protocol: PROTOCOL_MODERN });
    if (list.status !== 200 || !Array.isArray(list.result?.tools)) {
      throw new Error(`Modern MCP tools/list failed (HTTP ${list.status})`);
    }
    results.modern = list.result.tools.length;
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await probeGateway(
      process.env.ARCHESTRA_MCP_URL ?? "",
      process.env.ARCHESTRA_MCP_TOKEN ?? "",
      process.env.ARCHESTRA_MCP_PROTOCOL ?? "both",
    );
    console.log(`MCP gateway authenticated and unauthorized requests denied: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "MCP smoke failed");
    process.exitCode = 1;
  }
}
