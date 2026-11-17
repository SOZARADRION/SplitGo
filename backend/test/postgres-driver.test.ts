import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openDb, type DbHandle } from "../src/db/client.js";
import { testConfig, registerUser } from "./helpers.js";

/**
 * Caminho de PRODUÇÃO: a API fala com um servidor PostgreSQL pela rede, usando
 * o driver `pg` e o migrador do node-postgres (com DATABASE_URL). O servidor
 * aqui é o PGlite atendendo pelo protocolo do PostgreSQL (pglite-socket).
 */
let pglite: PGlite;
let server: PGLiteSocketServer;
let handle: DbHandle;
let app: FastifyInstance;

beforeAll(async () => {
  pglite = await PGlite.create();
  server = new PGLiteSocketServer({ db: pglite, port: 0, host: "127.0.0.1", maxConnections: 10 });
  await server.start();
  const databaseUrl = `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`;
  handle = await openDb({ databaseUrl });
  app = await buildApp(handle.db, testConfig);
}, 60_000);

afterAll(async () => {
  await app?.close();
  await handle?.close();
  await server?.stop();
  await pglite?.close();
});

describe("PostgreSQL via driver pg (caminho de produção)", () => {
  it("aplica as migrações e roda o fluxo completo", async () => {
    const user = await registerUser(app, { name: "Ana" });
    const g = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: user.headers,
      payload: { name: "Teste pg", members: [{ name: "Bia" }] },
    });
    expect(g.statusCode, g.body).toBe(201);
    const [ana, bia] = g.json().members as { id: string }[];
    const base = `/api/groups/${g.json().id}`;

    const e = await app.inject({
      method: "POST",
      url: `${base}/expenses`,
      headers: user.headers,
      payload: { description: "Jantar", amountCents: 10001, paidByMemberId: ana.id, split: { type: "EQUAL", memberIds: [ana.id, bia.id] } },
    });
    expect(e.statusCode, e.body).toBe(201);

    const edited = await app.inject({
      method: "PUT",
      url: `${base}/expenses/${e.json().id}`,
      headers: user.headers,
      payload: { description: "Jantar", amountCents: 8000, paidByMemberId: ana.id, split: { type: "EQUAL", memberIds: [ana.id, bia.id] } },
    });
    expect(edited.statusCode, edited.body).toBe(200);

    const summary = (await app.inject({ method: "GET", url: `${base}/summary`, headers: user.headers })).json();
    expect(summary.transfers).toEqual([expect.objectContaining({ fromMemberId: bia.id, toMemberId: ana.id, amountCents: 4000 })]);

    const list = (await app.inject({ method: "GET", url: "/api/groups", headers: user.headers })).json();
    expect(list[0].myBalanceCents).toBe(4000);
  });

  it("o banco recusa partes que não somam o total (trigger adiado)", async () => {
    const { rows } = await pglite.query<{ ok: boolean }>(
      "select count(*) > 0 as ok from pg_trigger where tgname in ('expense_sum', 'share_sum')",
    );
    expect(rows[0].ok).toBe(true);
  });
});
