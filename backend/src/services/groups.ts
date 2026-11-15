import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { groups, members, users } from "../db/schema.js";
import { AppError, notFound } from "../errors.js";
import type { PublicUser } from "./auth.js";

export interface NewMember {
  name: string;
  email?: string | null;
}

const normalizeEmail = (email?: string | null) => (email ? email.trim().toLowerCase() : null);

/** Mapa e-mail → id de usuário para os e-mails que já têm conta no SplitGo. */
async function userIdsByEmail(db: Db, emails: string[]) {
  if (emails.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.email, emails));
  return new Map(rows.map((r) => [r.email, r.id]));
}

export async function findMembership(db: Db, groupId: string, userId: string) {
  const [row] = await db
    .select({ id: members.id, groupId: members.groupId })
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.userId, userId)));
  return row ?? null;
}

/** Cria o grupo; quem cria entra automaticamente como primeiro participante. */
export async function createGroup(
  db: Db,
  creator: PublicUser,
  input: { name: string; currency?: string; members: NewMember[] },
) {
  const others = input.members
    .map((m) => ({ name: m.name.trim(), email: normalizeEmail(m.email) }))
    .filter((m) => m.email !== creator.email); // o criador já entra abaixo

  const emails = others.map((m) => m.email).filter((e): e is string => !!e);
  if (new Set(emails).size !== emails.length) {
    throw new AppError(409, "DUPLICATE_EMAIL", "E-mail repetido entre os participantes");
  }
  const linked = await userIdsByEmail(db, emails);

  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(groups)
      .values({ name: input.name.trim(), currency: input.currency ?? "BRL" })
      .returning();
    const created = await tx
      .insert(members)
      .values([
        { groupId: group.id, name: creator.name, email: creator.email, userId: creator.id },
        ...others.map((m) => ({
          groupId: group.id,
          name: m.name,
          email: m.email,
          userId: m.email ? (linked.get(m.email) ?? null) : null,
        })),
      ])
      .returning();
    return { ...group, members: created };
  });
}

/** Grupos dos quais o usuário participa, mais recentes primeiro. */
export async function listGroupsForUser(db: Db, userId: string) {
  const mine = db
    .select({ groupId: members.groupId })
    .from(members)
    .where(eq(members.userId, userId));
  return db
    .select({
      id: groups.id,
      name: groups.name,
      currency: groups.currency,
      createdAt: groups.createdAt,
      memberCount: count(members.id),
    })
    .from(groups)
    .innerJoin(members, eq(members.groupId, groups.id))
    .where(inArray(groups.id, mine))
    .groupBy(groups.id)
    .orderBy(desc(groups.createdAt));
}

export async function getGroup(db: Db, groupId: string) {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group) throw notFound("Grupo");
  const list = await db
    .select()
    .from(members)
    .where(eq(members.groupId, groupId))
    .orderBy(asc(members.createdAt), asc(members.name));
  return { ...group, members: list };
}

export const MAX_MEMBERS_PER_GROUP = 100;

export async function addMember(db: Db, groupId: string, input: NewMember) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(members)
    .where(eq(members.groupId, groupId));
  if (total >= MAX_MEMBERS_PER_GROUP) {
    throw new AppError(400, "GROUP_LIMIT", `Limite de ${MAX_MEMBERS_PER_GROUP} participantes por grupo`);
  }
  const email = normalizeEmail(input.email);
  if (email) {
    const [dup] = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.groupId, groupId), eq(members.email, email)));
    if (dup) {
      throw new AppError(409, "DUPLICATE_EMAIL", "Já existe um participante com esse e-mail no grupo");
    }
  }
  const linked = email ? await userIdsByEmail(db, [email]) : new Map<string, string>();
  const [member] = await db
    .insert(members)
    .values({
      groupId,
      name: input.name.trim(),
      email,
      userId: email ? (linked.get(email) ?? null) : null,
    })
    .returning();
  return member;
}
