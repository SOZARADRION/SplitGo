import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDb, type DbHandle } from "../src/db/client.js";
import { expenseShares, expenses, groups, members } from "../src/db/schema.js";

// Regras garantidas pelo próprio PostgreSQL, mesmo se a API tiver um bug.
let handle: DbHandle;
let groupId: string;
let ana: string;
let bia: string;

beforeAll(async () => {
  handle = await openDb();
  const [g] = await handle.db.insert(groups).values({ name: "Teste DB" }).returning();
  groupId = g.id;
  const ms = await handle.db
    .insert(members)
    .values([{ groupId, name: "Ana" }, { groupId, name: "Bia" }])
    .returning();
  [ana, bia] = ms.map((m) => m.id);
});
afterAll(() => handle.close());

async function insertExpense(amountCents: number, shares: [string, number][]) {
  return handle.db.transaction(async (tx) => {
    const [e] = await tx
      .insert(expenses)
      .values({ groupId, description: "x", amountCents, splitType: "EXACT", paidByMemberId: ana })
      .returning();
    if (shares.length) {
      await tx.insert(expenseShares).values(
        shares.map(([memberId, cents]) => ({ expenseId: e.id, groupId, memberId, amountCents: cents })),
      );
    }
    return e.id;
  });
}

describe("restrições do banco", () => {
  it("aceita partes que somam o total", async () => {
    await expect(insertExpense(1000, [[ana, 600], [bia, 400]])).resolves.toBeTypeOf("string");
  });

  it("recusa no COMMIT partes que não fecham com o total (e não grava nada)", async () => {
    const before = await handle.db.select().from(expenses);
    await expect(insertExpense(1000, [[ana, 600], [bia, 300]])).rejects.toThrow();
    await expect(insertExpense(1000, [])).rejects.toThrow();
    const after = await handle.db.select().from(expenses);
    expect(after).toHaveLength(before.length);
  });

  it("recusa alterar uma parte isoladamente e desbalancear a despesa", async () => {
    const id = await insertExpense(500, [[ana, 250], [bia, 250]]);
    await expect(
      handle.db.update(expenseShares).set({ amountCents: 100 }).where(eq(expenseShares.expenseId, id)),
    ).rejects.toThrow();
  });
});

describe("banco em disco (PGlite)", () => {
  it("cria as pastas que faltam na primeira execução", async () => {
    const { mkdtempSync, rmSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const base = mkdtempSync(join(tmpdir(), "splitgo-"));
    const dataDir = join(base, "data", "pglite"); // "data" ainda não existe
    try {
      const h = await openDb({ dataDir });
      await h.close();
      expect(existsSync(dataDir)).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }, 30_000); // criar banco em disco é lento com a suíte em paralelo
});
