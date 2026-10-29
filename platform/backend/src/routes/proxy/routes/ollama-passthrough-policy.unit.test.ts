import { describe, expect, test } from "vitest";
import { isAllowedOllamaPassthroughRequest as allowed } from "./ollama-passthrough-policy";

const PREFIXES = ["/v1/ollama", "/v1/ollama-native"] as const;
const AGENT = "da0e7287-c7dd-46a6-a0bf-69e6412d7a9c";

describe("Ollama catch-all admission", () => {
  for (const prefix of PREFIXES) {
    test.each([
      ["GET", "/models"],
      ["GET", "/api/tags"],
      ["GET", "/api/ps"],
      ["GET", "/api/version"],
      ["POST", "/api/show"],
    ])(`${prefix} permits %s %s`, (method, path) => {
      expect(allowed(method, `${prefix}${path}`, prefix)).toBe(true);
      expect(allowed(method, `${prefix}/${AGENT}${path}?a=1`, prefix)).toBe(
        true,
      );
    });

    test.each([
      ["POST", "/api/pull"],
      ["DELETE", "/api/delete"],
      ["POST", "/api/create"],
      ["POST", "/api/push"],
      ["POST", "/api/copy"],
      ["POST", "/api/chat"],
      ["POST", "/chat/completions"],
      ["POST", "/embeddings"],
      ["POST", "/api/generate"],
      ["POST", "/api/embed"],
      ["PUT", "/api/blobs/sha256:abc"],
      ["POST", "/api/stop"],
      ["POST", "/v1/responses"],
      ["GET", "/api/delete"],
      ["POST", "/api/%64elete"],
      ["POST", "/api//delete"],
      ["POST", "/api/../api/delete"],
      ["GET", "/"],
    ])(`${prefix} rejects %s %s`, (method, path) => {
      expect(allowed(method, `${prefix}${path}`, prefix)).toBe(false);
      expect(allowed(method, `${prefix}/${AGENT}${path}`, prefix)).toBe(false);
    });

    test("rejects other prefixes and malformed UUIDs", () => {
      expect(allowed("GET", "/v1/other/models", prefix)).toBe(false);
      expect(allowed("GET", `${prefix}/not-an-agent/api/tags`, prefix)).toBe(
        false,
      );
      expect(allowed("GET", `${prefix}/${AGENT}%2fapi/tags`, prefix)).toBe(
        false,
      );
    });
  }
});
