import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { expenseShares, expenses } from "../db/schema.js";
import { resolveSplit, SplitError, type SplitInput } from "../domain/split.js";
import { badRequest, notFound } from "../errors.js";
import { getGroup } from "./groups.js";

export interface NewExpense {
  description: string;
  amountCents: number;
  paidByMemberId: string;
  occurredAt?: Date;
  split: SplitInput;
}

export async function createExpense(
  db: Db,
  groupId: string,
  input: NewExpense,
  createdByUserId: string | null = null,
) {
  const group = await getGroup(db, groupId);
  const memberIds = new Set(group.members.map((m) => m.id));

  if (!memberIds.has(input.paidByMemberId)) {
    throw badRequest("INVALID_PAYER", "Quem pagou não é participante deste grupo");
  }

  let shares;
  try {
    shares = resolveSplit(input.amountCents, input.split);
  } catch (err) {
    if (err instanceof SplitError || err instanceof RangeError) {
      throw badRequest("INVALID_SPLIT", err.message);
    }
    throw err;
  }
  const outsiders = shares.filter((s) => !memberIds.has(s.memberId));
  if (outsiders.length) {
    throw badRequest("INVALID_SPLIT", "A divisão inclui alguém que não é participante do grupo");
  }

  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        groupId,
        description: input.description.trim(),
        amountCents: input.amountCents,
        splitType: input.split.type,
        paidByMemberId: input.paidByMemberId,
        createdByUserId,
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      })
      .returning();
    const savedShares = await tx
      .insert(expenseShares)
      .values(
        shares.map((s) => ({
          expenseId: expense.id,
          groupId,
          memberId: s.memberId,
          amountCents: s.amountCents,
          input: s.input === null ? null : String(s.input),
        })),
      )
      .returning();
    return { ...expense, shares: savedShares.map(toShareDto) };
  });
}

export async function listExpenses(db: Db, groupId: string) {
  await getGroup(db, groupId);
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.occurredAt), desc(expenses.createdAt));
  if (rows.length === 0) return [];

  const shares = await db
    .select()
    .from(expenseShares)
    .where(inArray(expenseShares.expenseId, rows.map((r) => r.id)));
  const byExpense = Map.groupBy(shares, (s) => s.expenseId);
  return rows.map((r) => ({ ...r, shares: (byExpense.get(r.id) ?? []).map(toShareDto) }));
}

export async function deleteExpense(db: Db, groupId: string, expenseId: string) {
  const [row] = await db
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId), isNull(expenses.deletedAt)))
    .returning({ id: expenses.id });
  if (!row) throw notFound("Despesa");
}

function toShareDto(s: typeof expenseShares.$inferSelect) {
  return {
    memberId: s.memberId,
    amountCents: s.amountCents,
    input: s.input === null ? null : Number(s.input),
  };
}
