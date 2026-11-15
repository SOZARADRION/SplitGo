import { sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const splitTypeEnum = pgEnum("split_type", ["EQUAL", "EXACT", "PERCENT", "SHARES"]);

/** Conta de usuário do SplitGo. E-mail sempre salvo em minúsculas. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique("users_email_uq"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("BRL"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Participante do grupo. Pode existir sem conta (user_id nulo): quando alguém
 * se cadastra com o mesmo e-mail, o participante é vinculado à nova conta.
 */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Permite FKs compostas garantindo que o membro pertence ao MESMO grupo.
    unique("members_id_group_uq").on(t.id, t.groupId),
    unique("members_group_email_uq").on(t.groupId, t.email),
    unique("members_group_user_uq").on(t.groupId, t.userId),
    index("members_group_idx").on(t.groupId),
    index("members_user_idx").on(t.userId),
    index("members_email_idx").on(t.email),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    splitType: splitTypeEnum("split_type").notNull(),
    paidByMemberId: uuid("paid_by_member_id").notNull(),
    /** quem lançou (auditoria) */
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("expenses_amount_pos", sql`${t.amountCents} > 0`),
    unique("expenses_id_group_uq").on(t.id, t.groupId),
    foreignKey({
      name: "expenses_payer_same_group_fk",
      columns: [t.paidByMemberId, t.groupId],
      foreignColumns: [members.id, members.groupId],
    }),
    index("expenses_group_occurred_idx").on(t.groupId, t.occurredAt),
  ],
);

/** Parte de cada membro numa despesa. Soma(amount_cents) = expenses.amount_cents. */
export const expenseShares = pgTable(
  "expense_shares",
  {
    expenseId: uuid("expense_id").notNull(),
    groupId: uuid("group_id").notNull(),
    memberId: uuid("member_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** % ou peso informado (PERCENT/SHARES), para reeditar a despesa */
    input: numeric("input", { precision: 9, scale: 2 }),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.memberId] }),
    check("expense_shares_amount_nonneg", sql`${t.amountCents} >= 0`),
    // Despesa e membro precisam ser do mesmo grupo (group_id compartilhado).
    foreignKey({
      name: "expense_shares_expense_fk",
      columns: [t.expenseId, t.groupId],
      foreignColumns: [expenses.id, expenses.groupId],
    }).onDelete("cascade"),
    foreignKey({
      name: "expense_shares_member_same_group_fk",
      columns: [t.memberId, t.groupId],
      foreignColumns: [members.id, members.groupId],
    }),
    index("expense_shares_member_idx").on(t.memberId),
  ],
);

/** Pagamento real entre membros ("Caio pagou R$ 145 para Ana"). */
export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromMemberId: uuid("from_member_id").notNull(),
    toMemberId: uuid("to_member_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** quem registrou o acerto (auditoria) */
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("settlements_amount_pos", sql`${t.amountCents} > 0`),
    check("settlements_distinct_members", sql`${t.fromMemberId} <> ${t.toMemberId}`),
    foreignKey({
      name: "settlements_from_same_group_fk",
      columns: [t.fromMemberId, t.groupId],
      foreignColumns: [members.id, members.groupId],
    }),
    foreignKey({
      name: "settlements_to_same_group_fk",
      columns: [t.toMemberId, t.groupId],
      foreignColumns: [members.id, members.groupId],
    }),
    index("settlements_group_idx").on(t.groupId),
  ],
);
