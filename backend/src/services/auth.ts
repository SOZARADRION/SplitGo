import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { members, users } from "../db/schema.js";
import { AppError } from "../errors.js";

export type PublicUser = { id: string; name: string; email: string; createdAt: Date };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const toPublic = (u: typeof users.$inferSelect): PublicUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  createdAt: u.createdAt,
});

/** Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar contas. */
const DUMMY_HASH = bcrypt.hashSync("splitgo-dummy-password", 10);

const invalidCredentials = () =>
  new AppError(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos");

export async function registerUser(
  db: Db,
  input: { name: string; email: string; password: string },
  bcryptRounds: number,
): Promise<PublicUser> {
  const email = normalizeEmail(input.email);
  const passwordHash = await bcrypt.hash(input.password, bcryptRounds);

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({ name: input.name.trim(), email, passwordHash })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (inserted.length === 0) {
      throw new AppError(409, "EMAIL_TAKEN", "Já existe uma conta SplitGo com esse e-mail");
    }
    const user = inserted[0];

    // Convites pendentes: participantes já adicionados a grupos com este e-mail
    // passam a pertencer à nova conta.
    await tx
      .update(members)
      .set({ userId: user.id })
      .where(and(eq(members.email, email), isNull(members.userId)));

    return toPublic(user);
  });
}

export async function verifyCredentials(
  db: Db,
  input: { email: string; password: string },
): Promise<PublicUser> {
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(input.email)));
  if (!user) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw invalidCredentials();
  }
  if (!(await bcrypt.compare(input.password, user.passwordHash))) throw invalidCredentials();
  return toPublic(user);
}

export async function getUserById(db: Db, id: string): Promise<PublicUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ? toPublic(user) : null;
}
