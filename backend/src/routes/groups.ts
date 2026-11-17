import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { AppError } from "../errors.js";
import { getUserById } from "../services/auth.js";
import {
  createSettlement,
  deleteSettlement,
  getGroupSummary,
  listSettlements,
  myBalancesByGroup,
} from "../services/balances.js";
import { createExpense, deleteExpense, listExpenses, updateExpense } from "../services/expenses.js";
import { addMember, createGroup, getGroup, listGroupsForUser } from "../services/groups.js";

// ---------- Esquemas de entrada ----------

/** Limite de R$ 10 milhões por lançamento: folga ampla e longe do teto de INTEGER. */
const MAX_CENTS = 1_000_000_000;
const cents = z.number().int().positive().max(MAX_CENTS);
const id = z.uuid();

const memberInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254).nullish(),
});

const createGroupBody = z.object({
  name: z.string().trim().min(1).max(100),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "Use um código ISO 4217, ex.: BRL")
    .optional(),
  members: z.array(memberInput).max(99).default([]), // + criador = 100
});

const splitInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EQUAL"), memberIds: z.array(id).min(1) }),
  z.object({
    type: z.literal("EXACT"),
    shares: z.array(z.object({ memberId: id, amountCents: z.number().int().min(0) })).min(1),
  }),
  z.object({
    type: z.literal("PERCENT"),
    shares: z.array(z.object({ memberId: id, percent: z.number().min(0).max(100) })).min(1),
  }),
  z.object({
    type: z.literal("SHARES"),
    shares: z.array(z.object({ memberId: id, weight: z.number().int().min(0).max(1000) })).min(1),
  }),
]);

const createExpenseBody = z.object({
  description: z.string().trim().min(1).max(140),
  amountCents: cents,
  paidByMemberId: id,
  occurredAt: z.coerce.date().optional(),
  split: splitInput,
});

const createSettlementBody = z.object({
  fromMemberId: id,
  toMemberId: id,
  amountCents: cents,
  paidAt: z.coerce.date().optional(),
});

const groupParams = z.object({ groupId: id });
const expenseParams = z.object({ groupId: id, expenseId: id });
const settlementParams = z.object({ groupId: id, settlementId: id });

// ---------- Rotas (todas exigem login) ----------

export async function groupRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;
  app.addHook("onRequest", app.authenticate);

  app.get("/groups", async (req) => {
    const [list, balances] = await Promise.all([
      listGroupsForUser(db, req.user.sub),
      myBalancesByGroup(db, req.user.sub),
    ]);
    return list.map((g) => ({ ...g, myBalanceCents: balances.get(g.id) ?? 0 }));
  });

  app.post("/groups", async (req, reply) => {
    const body = createGroupBody.parse(req.body);
    const user = await getUserById(db, req.user.sub);
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Faça login no SplitGo para continuar");
    reply.code(201);
    return createGroup(db, user, body);
  });

  // Daqui em diante, só participantes do grupo têm acesso.
  await app.register(async (scoped) => {
    scoped.addHook("preHandler", app.requireGroupMember);

    scoped.get("/groups/:groupId", async (req) => {
      const { groupId } = groupParams.parse(req.params);
      return getGroup(db, groupId);
    });

    scoped.post("/groups/:groupId/members", async (req, reply) => {
      const { groupId } = groupParams.parse(req.params);
      const body = memberInput.parse(req.body);
      reply.code(201);
      return addMember(db, groupId, body);
    });

    scoped.post("/groups/:groupId/expenses", async (req, reply) => {
      const { groupId } = groupParams.parse(req.params);
      const body = createExpenseBody.parse(req.body);
      reply.code(201);
      return createExpense(db, groupId, body, req.user.sub);
    });

    scoped.get("/groups/:groupId/expenses", async (req) => {
      const { groupId } = groupParams.parse(req.params);
      return listExpenses(db, groupId);
    });

    scoped.put("/groups/:groupId/expenses/:expenseId", async (req) => {
      const { groupId, expenseId } = expenseParams.parse(req.params);
      const body = createExpenseBody.parse(req.body);
      return updateExpense(db, groupId, expenseId, body);
    });

    scoped.delete("/groups/:groupId/expenses/:expenseId", async (req, reply) => {
      const { groupId, expenseId } = expenseParams.parse(req.params);
      await deleteExpense(db, groupId, expenseId);
      reply.code(204);
    });

    scoped.post("/groups/:groupId/settlements", async (req, reply) => {
      const { groupId } = groupParams.parse(req.params);
      const body = createSettlementBody.parse(req.body);
      reply.code(201);
      return createSettlement(db, groupId, body, req.user.sub);
    });

    scoped.get("/groups/:groupId/settlements", async (req) => {
      const { groupId } = groupParams.parse(req.params);
      return listSettlements(db, groupId);
    });

    scoped.delete("/groups/:groupId/settlements/:settlementId", async (req, reply) => {
      const { groupId, settlementId } = settlementParams.parse(req.params);
      await deleteSettlement(db, groupId, settlementId);
      reply.code(204);
    });

    scoped.get("/groups/:groupId/summary", async (req) => {
      const { groupId } = groupParams.parse(req.params);
      return getGroupSummary(db, groupId);
    });
  });
}
