import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createSigner } from "fast-jwt";
import { createTestApp, registerUser } from "./helpers.js";

let app: FastifyInstance;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ app, close } = await createTestApp());
});
afterAll(() => close());

describe("POST /api/auth/register", () => {
  it("cria a conta, devolve token e nunca expõe o hash da senha", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "  Ana Souza ", email: "Ana@SplitGo.test", password: "senha-segura-123" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.tokenType).toBe("Bearer");
    expect(body.token.split(".")).toHaveLength(3);
    expect(body.user).toMatchObject({ name: "Ana Souza", email: "ana@splitgo.test" });
    expect(JSON.stringify(body)).not.toMatch(/password|hash/i);
  });

  it("recusa e-mail já cadastrado (sem diferenciar maiúsculas)", async () => {
    await registerUser(app, { email: "dup@splitgo.test" });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { name: "Outro", email: "DUP@splitgo.test", password: "senha-segura-123" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("EMAIL_TAKEN");
  });

  it("valida nome, e-mail e senha", async () => {
    const cases = [
      { name: "", email: "a@b.com", password: "senha-segura-123" },
      { name: "X", email: "nao-e-email", password: "senha-segura-123" },
      { name: "X", email: "a@b.com", password: "curta" },
      { name: "X", email: "a@b.com", password: "á".repeat(40) }, // 80 bytes > 72
    ];
    for (const payload of cases) {
      const res = await app.inject({ method: "POST", url: "/api/auth/register", payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });
});

describe("POST /api/auth/login", () => {
  it("autentica com e-mail em qualquer caixa", async () => {
    await registerUser(app, { email: "login@splitgo.test", password: "minha-senha-1" });
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "LOGIN@splitgo.test", password: "minha-senha-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("login@splitgo.test");
  });

  it("senha errada e e-mail inexistente dão a mesma resposta genérica", async () => {
    await registerUser(app, { email: "existe@splitgo.test", password: "minha-senha-1" });
    const wrong = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "existe@splitgo.test", password: "errada-123" },
    });
    const missing = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "naoexiste@splitgo.test", password: "errada-123" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.json()).toEqual(missing.json());
  });
});

describe("GET /api/auth/me", () => {
  it("retorna o usuário do token", async () => {
    const user = await registerUser(app, { name: "Bia" });
    const res = await app.inject({ method: "GET", url: "/api/auth/me", headers: user.headers });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: user.id, name: "Bia", email: user.email });
  });

  it("recusa ausência de token, token malformado e token de outro segredo", async () => {
    const user = await registerUser(app);
    const forged = createSigner({ key: "outro-segredo-qualquer-com-32-caracteres!" })({ sub: user.id });
    const variants = [
      undefined,
      "Bearer",
      "Bearer abc.def.ghi",
      `Bearer ${forged}`,
      `Basic ${user.token}`,
    ];
    for (const authorization of variants) {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: authorization ? { authorization } : {},
      });
      expect(res.statusCode, String(authorization)).toBe(401);
      expect(res.json().error).toBe("UNAUTHORIZED");
    }
  });

  it("recusa token expirado", async () => {
    const user = await registerUser(app);
    const expired = createSigner({ key: "test-secret-com-pelo-menos-32-caracteres!!" })({
      sub: user.id,
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${expired}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("limite de tentativas", () => {
  it("bloqueia excesso de logins por IP com 429", async () => {
    const limited = await createTestApp({ authRateLimitPerMinute: 3 });
    try {
      const attempt = () =>
        limited.app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "x@splitgo.test", password: "qualquer-1" },
        });
      for (let i = 0; i < 3; i++) expect((await attempt()).statusCode).toBe(401);
      const blocked = await attempt();
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error).toBe("TOO_MANY_REQUESTS");
    } finally {
      await limited.close();
    }
  });
});
