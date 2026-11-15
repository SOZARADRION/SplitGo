import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/client.js";
import { AppError } from "../errors.js";
import { getUserById, registerUser, verifyCredentials, type PublicUser } from "../services/auth.js";

// bcrypt só considera os primeiros 72 bytes da senha: acima disso, recusamos.
const password = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "A senha deve ter no máximo 72 bytes");

const registerBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  password,
});

const loginBody = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export async function authRoutes(app: FastifyInstance, opts: { db: Db; config: AppConfig }) {
  const { db, config } = opts;
  const rateLimit = { rateLimit: { max: config.authRateLimitPerMinute, timeWindow: "1 minute" } };

  const issueToken = (user: PublicUser) => ({
    token: app.jwt.sign({ sub: user.id }),
    tokenType: "Bearer" as const,
    expiresIn: config.jwtExpiresIn,
    user,
  });

  app.post("/auth/register", { config: rateLimit }, async (req, reply) => {
    const body = registerBody.parse(req.body);
    const user = await registerUser(db, body, config.bcryptRounds);
    reply.code(201);
    return issueToken(user);
  });

  app.post("/auth/login", { config: rateLimit }, async (req) => {
    const body = loginBody.parse(req.body);
    const user = await verifyCredentials(db, body);
    return issueToken(user);
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (req) => {
    const user = await getUserById(db, req.user.sub);
    // Token válido de uma conta que deixou de existir.
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Faça login no SplitGo para continuar");
    return user;
  });
}
