import { and, desc, eq, inArray, isNull, sql, sum } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { expenseShares, expenses, members, settlements } from "../db/schema.js";
import { computeBalances } from "../domain/balances.js";
import { simplifyDebts } from "../domain/settle.js";
import { badRequest, notFound } from "../errors.js";
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
    .where(and(eq(settlements.groupId, groupId), isNull(settlements.deletedAt)));

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

/** Pagamentos registrados no grupo (não desfeitos), mais recentes primeiro. */
export async function listSettlements(db: Db, groupId: string) {
  return db
    .select({
      id: settlements.id,
      fromMemberId: settlements.fromMemberId,
      toMemberId: settlements.toMemberId,
      amountCents: settlements.amountCents,
      paidAt: settlements.paidAt,
      createdByUserId: settlements.createdByUserId,
    })
    .from(settlements)
    .where(and(eq(settlements.groupId, groupId), isNull(settlements.deletedAt)))
    .orderBy(desc(settlements.paidAt), desc(settlements.createdAt));
}

/** Desfaz um pagamento registrado por engano (exclusão lógica). */
export async function deleteSettlement(db: Db, groupId: string, settlementId: string) {
  const [row] = await db
    .update(settlements)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(settlements.id, settlementId), eq(settlements.groupId, groupId), isNull(settlements.deletedAt)),
    )
    .returning({ id: settlements.id });
  if (!row) throw notFound("Pagamento");
}

/**
 * Saldo do usuário em cada grupo de que participa (> 0 recebe, < 0 deve),
 * calculado com 4 consultas agregadas, sem abrir grupo por grupo.
 */
export async function myBalancesByGroup(db: Db, userId: string): Promise<Map<string, number>> {
  const mine = await db
    .select({ memberId: members.id, groupId: members.groupId })
    .from(members)
    .where(eq(members.userId, userId));
  if (mine.length === 0) return new Map();
  const ids = mine.map((m) => m.memberId);
  const total = (col: Parameters<typeof sum>[0]) => sql<string>`coalesce(${sum(col)}, 0)`;

  const [paid, owed, sent, received] = await Promise.all([
    db
      .select({ memberId: expenses.paidByMemberId, cents: total(expenses.amountCents) })
      .from(expenses)
      .where(and(inArray(expenses.paidByMemberId, ids), isNull(expenses.deletedAt)))
      .groupBy(expenses.paidByMemberId),
    db
      .select({ memberId: expenseShares.memberId, cents: total(expenseShares.amountCents) })
      .from(expenseShares)
      .innerJoin(expenses, eq(expenses.id, expenseShares.expenseId))
      .where(and(inArray(expenseShares.memberId, ids), isNull(expenses.deletedAt)))
      .groupBy(expenseShares.memberId),
    db
      .select({ memberId: settlements.fromMemberId, cents: total(settlements.amountCents) })
      .from(settlements)
      .where(and(inArray(settlements.fromMemberId, ids), isNull(settlements.deletedAt)))
      .groupBy(settlements.fromMemberId),
    db
      .select({ memberId: settlements.toMemberId, cents: total(settlements.amountCents) })
      .from(settlements)
      .where(and(inArray(settlements.toMemberId, ids), isNull(settlements.deletedAt)))
      .groupBy(settlements.toMemberId),
  ]);

  const net = new Map<string, number>(ids.map((id) => [id, 0]));
  const add = (rows: { memberId: string; cents: string }[], sign: 1 | -1) => {
    for (const r of rows) net.set(r.memberId, (net.get(r.memberId) ?? 0) + sign * Number(r.cents));
  };
  add(paid, 1);
  add(owed, -1);
  add(sent, 1);
  add(received, -1);

  return new Map(mine.map((m) => [m.groupId, net.get(m.memberId) ?? 0]));
}
