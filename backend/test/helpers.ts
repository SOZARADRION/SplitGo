import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { openDb, type DbHandle } from "../src/db/client.js";

export const testConfig: AppConfig = {
  jwtSecret: "test-secret-com-pelo-menos-32-caracteres!!",
  jwtExpiresIn: "1h",
  bcryptRounds: 4, // rápido nos testes; produção usa 12
  authRateLimitPerMinute: 1000,
};

/** App com PostgreSQL real (PGlite) em memória e as mesmas migrações de produção. */
export async function createTestApp(config: Partial<AppConfig> = {}) {
  const handle: DbHandle = await openDb();
  const app = await buildApp(handle.db, { ...testConfig, ...config });
  return {
    app,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

let seq = 0;

export interface TestUser {
  id: string;
  name: string;
  email: string;
  token: string;
  headers: { authorization: string };
}

export async function registerUser(
  app: FastifyInstance,
  data: { name?: string; email?: string; password?: string } = {},
): Promise<TestUser> {
  seq += 1;
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      name: data.name ?? `Usuário ${seq}`,
      email: data.email ?? `usuario${seq}@splitgo.test`,
      password: data.password ?? "senha-segura-123",
    },
  });
  expect(res.statusCode, res.body).toBe(201);
  const body = res.json();
  return { ...body.user, token: body.token, headers: { authorization: `Bearer ${body.token}` } };
}
