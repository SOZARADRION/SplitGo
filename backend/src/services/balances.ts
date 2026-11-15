import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { expenseShares, expenses, settlements } from "../db/schema.js";
import { computeBalances } from "../domain/balances.js";
import { simplifyDebts } from "../domain/settle.js";
import { badRequest } from "../errors.js";
import { getGroup } from "./groups.js";

/** Extrato do grupo: saldo individual + transferências sugeridas (simplificadas). */
export async function getGroupSummary(db: Db, groupId: string) {
  const group = await getGroup(db, groupId);

  const expenseRows = await db
    .select({ id: expenses.id, paidBy: expenses.paidByMemberId, amountCents: expenses.amountCents })
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), isNull(expenses.deletedAt)));

  const shareRows = await db
    .select({
      expenseId: expenseShares.expenseId,
      memberId: expenseShares.memberId,
      amountCents: expenseShares.amountCents,
    })
    .from(expenseShares)
    .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
    .where(and(eq(expenseShares.groupId, groupId), isNull(expenses.deletedAt)));

  const settlementRows = await db
    .select({
      fromMemberId: settlements.fromMemberId,
      toMemberId: settlements.toMemberId,
      amountCents: settlements.amountCents,
    })
    .from(settlements)
    .where(eq(settlements.groupId, groupId));

  const sharesByExpense = Map.groupBy(shareRows, (s) => s.expenseId);
  const balances = computeBalances(
    group.members.map((m) => m.id),
    expenseRows.map((e) => ({
      paidByMemberId: e.paidBy,
      amountCents: e.amountCents,
      shares: sharesByExpense.get(e.id) ?? [],
    })),
    settlementRows,
  );

  const names = new Map(group.members.map((m) => [m.id, m.name]));
  const transfers = simplifyDebts(new Map(balances.map((b) => [b.memberId, b.balanceCents])));

  return {
    groupId: group.id,
    groupName: group.name,
    currency: group.currency,
    totalSpentCents: expenseRows.reduce((s, e) => s + e.amountCents, 0),
    members: balances.map((b) => ({ ...b, name: names.get(b.memberId) ?? "?" })),
    transfers: transfers.map((t) => ({
      ...t,
      fromName: names.get(t.fromMemberId) ?? "?",
      toName: names.get(t.toMemberId) ?? "?",
    })),
  };
}

export async function createSettlement(
  db: Db,
  groupId: string,
  input: { fromMemberId: string; toMemberId: string; amountCents: number; paidAt?: Date },
  createdByUserId: string | null = null,
) {
  const group = await getGroup(db, groupId);
  const ids = new Set(group.members.map((m) => m.id));
  if (!ids.has(input.fromMemberId) || !ids.has(input.toMemberId)) {
    throw badRequest("INVALID_MEMBER", "Pagador e recebedor precisam ser participantes do grupo");
  }
  if (input.fromMemberId === input.toMemberId) {
    throw badRequest("INVALID_SETTLEMENT", "Pagador e recebedor devem ser pessoas diferentes");
  }
  const [row] = await db
    .insert(settlements)
    .values({
      groupId,
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      amountCents: input.amountCents,
      createdByUserId,
      ...(input.paidAt ? { paidAt: input.paidAt } : {}),
    })
    .returning();
  return row;
}
