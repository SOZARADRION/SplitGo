import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { expenseShares, expenses } from "../db/schema.js";
import { resolveSplit, SplitError, type ResolvedShare, type SplitInput } from "../domain/split.js";
import { badRequest, notFound } from "../errors.js";
import { getGroup } from "./groups.js";

export interface NewExpense {
  description: string;
  amountCents: number;
  paidByMemberId: string;
  occurredAt?: Date;
  split: SplitInput;
}

/** Valida pagador e divisão contra os participantes do grupo e devolve as partes em centavos. */
async function resolveExpenseShares(db: Db, groupId: string, input: NewExpense): Promise<ResolvedShare[]> {
  const group = await getGroup(db, groupId);
  const memberIds = new Set(group.members.map((m) => m.id));

  if (!memberIds.has(input.paidByMemberId)) {
    throw badRequest("INVALID_PAYER", "Quem pagou não é participante deste grupo");
  }

  let shares: ResolvedShare[];
  try {
    shares = resolveSplit(input.amountCents, input.split);
  } catch (err) {
    if (err instanceof SplitError || err instanceof RangeError) {
      throw badRequest("INVALID_SPLIT", err.message);
    }
    throw err;
  }
  if (shares.some((s) => !memberIds.has(s.memberId))) {
    throw badRequest("INVALID_SPLIT", "A divisão inclui alguém que não é participante do grupo");
  }
  return shares;
}

const shareRows = (expenseId: string, groupId: string, shares: ResolvedShare[]) =>
  shares.map((s) => ({
    expenseId,
    groupId,
    memberId: s.memberId,
    amountCents: s.amountCents,
    input: s.input === null ? null : String(s.input),
  }));

export async function createExpense(
  db: Db,
  groupId: string,
  input: NewExpense,
  createdByUserId: string | null = null,
) {
  const shares = await resolveExpenseShares(db, groupId, input);

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
    const saved = await tx.insert(expenseShares).values(shareRows(expense.id, groupId, shares)).returning();
    return { ...expense, shares: saved.map(toShareDto) };
  });
}

/**
 * Substitui todos os dados de uma despesa (descrição, valor, pagador, data e divisão).
 * Atômico: as partes antigas saem e as novas entram na mesma transação, e o
 * banco confere no COMMIT que elas somam o novo total.
 */
export async function updateExpense(db: Db, groupId: string, expenseId: string, input: NewExpense) {
  const shares = await resolveExpenseShares(db, groupId, input);

  return db.transaction(async (tx) => {
    const [expense] = await tx
      .update(expenses)
      .set({
        description: input.description.trim(),
        amountCents: input.amountCents,
        splitType: input.split.type,
        paidByMemberId: input.paidByMemberId,
        updatedAt: new Date(),
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId), isNull(expenses.deletedAt)))
      .returning();
    if (!expense) throw notFound("Despesa");

    await tx.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId));
    const saved = await tx.insert(expenseShares).values(shareRows(expenseId, groupId, shares)).returning();
    return { ...expense, shares: saved.map(toShareDto) };
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
