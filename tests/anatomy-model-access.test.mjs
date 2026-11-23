import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

async function loadProxy() {
  const source = readFileSync(new URL("../proxy.js", import.meta.url), "utf8")
    .replace(/^import .*?;\s*$/gm, "")
    .replace(/^export const config/m, "const config")
    .replace(/^export async function proxy/m, "async function proxy");
  const NextResponse = {
    next: () => ({ kind: "next" }),
    redirect: (url, status) => ({ kind: "redirect", url: String(url), status }),
  };
  let sessionCalls = 0;
  const verifySession = async () => { sessionCalls++; return null; };
  const SESSION_COOKIE = "atlas_session";
  const factory = new Function("NextResponse", "verifySession", "SESSION_COOKIE", source + "\nreturn {proxy, config};");
  return { ...factory(NextResponse, verifySession, SESSION_COOKIE), getSessionCalls: () => sessionCalls };
}

function request(pathname, hostname = "www.atlasfit.com.br") {
  const url = new URL(pathname, "https://" + hostname);
  return { nextUrl: { pathname: url.pathname, hostname }, url: url.toString(), cookies: { get: () => undefined } };
}

test("normal pages remain session-protected", async () => {
  const { proxy, getSessionCalls } = await loadProxy();
  const result = await proxy(request("/personal/fichas"));
  assert.equal(result.kind, "redirect");
  assert.equal(new URL(result.url).pathname, "/login");
  assert.equal(getSessionCalls(), 1);
});

test("unrelated assets under models do not bypass authentication", async () => {
  const { proxy } = await loadProxy();
  const result = await proxy(request("/models/private/file.glb"));
  assert.equal(result.kind, "redirect");
});

test("WebAssembly permitted by CSP without JavaScript unsafe-eval", () => {
  const config = readFileSync(new URL("../next.config.js", import.meta.url), "utf8");
  const match = config.match(/script-src ([^;]+);/);
  assert.ok(match, "script-src directive must exist");
  assert.match(match[1], /'wasm-unsafe-eval'/);
  assert.doesNotMatch(match[1], /(?:^|\s)'unsafe-eval'(?:\s|$)/);
});
