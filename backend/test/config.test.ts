import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createTestApp } from "./helpers.js";

const SECRET = "x".repeat(40);

describe("configuração de produção", () => {
  it("exige JWT_SECRET forte em produção", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: "production", JWT_SECRET: "curto" })).toThrow(/JWT_SECRET/);
    expect(loadConfig({ NODE_ENV: "production", JWT_SECRET: SECRET }).jwtSecret).toBe(SECRET);
  });

  it("lê TRUST_PROXY e CORS_ORIGINS", () => {
    const c = loadConfig({ JWT_SECRET: SECRET, TRUST_PROXY: "1", CORS_ORIGINS: "https://a.com, https://b.com" });
    expect(c.trustProxyHops).toBe(1);
    expect(c.corsOrigins).toEqual(["https://a.com", "https://b.com"]);
    expect(loadConfig({ JWT_SECRET: SECRET }).corsOrigins).toBe(true);
    expect(() => loadConfig({ JWT_SECRET: SECRET, TRUST_PROXY: "sim" })).toThrow(/TRUST_PROXY/);
  });

  it("atrás de proxy, o limite de login vale por cliente e não pode ser burlado forjando o IP", async () => {
    const t = await createTestApp({ trustProxyHops: 1, authRateLimitPerMinute: 2 });
    try {
      // O proxy (127.0.0.1 no teste) acrescenta o IP real ao final do X-Forwarded-For.
      const login = (clientChain: string) =>
        t.app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { "x-forwarded-for": clientChain },
          payload: { email: "x@splitgo.test", password: "qualquer-1" },
        });
      expect((await login("203.0.113.7")).statusCode).toBe(401);
      expect((await login("203.0.113.7")).statusCode).toBe(401);
      expect((await login("203.0.113.7")).statusCode).toBe(429);
      // Forjar um IP à esquerda não ajuda: conta o IP visto pelo proxy (o último).
      expect((await login("1.2.3.4, 203.0.113.7")).statusCode).toBe(429);
      // Outro cliente tem a própria cota.
      expect((await login("198.51.100.9")).statusCode).toBe(401);
    } finally {
      await t.close();
    }
  }, 30_000); // cada login falho roda um bcrypt de propósito

  it("CORS restrito responde só às origens permitidas", async () => {
    const t = await createTestApp({ corsOrigins: ["https://app.splitgo.test"] });
    try {
      const ok = await t.app.inject({ method: "GET", url: "/health", headers: { origin: "https://app.splitgo.test" } });
      expect(ok.headers["access-control-allow-origin"]).toBe("https://app.splitgo.test");
      const other = await t.app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.test" } });
      expect(other.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await t.close();
    }
  });
});
