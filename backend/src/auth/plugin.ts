import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/client.js";
import { AppError } from "../errors.js";
import { findMembership } from "../services/groups.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    /** Middleware: exige `Authorization: Bearer <token>` válido. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Middleware: exige que o usuário logado participe do grupo `:groupId`. */
    requireGroupMember: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** Participante do usuário logado no grupo da rota (após requireGroupMember). */
    member?: { id: string; groupId: string };
  }
}

const groupIdParam = z.object({ groupId: z.uuid() });

async function authPlugin(app: FastifyInstance, opts: { db: Db; config: AppConfig }) {
  await app.register(fastifyJwt, {
    secret: opts.config.jwtSecret,
    sign: { expiresIn: opts.config.jwtExpiresIn },
  });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Faça login no SplitGo para continuar");
    }
  });

  app.decorate("requireGroupMember", async (req: FastifyRequest) => {
    const { groupId } = groupIdParam.parse(req.params);
    const member = await findMembership(opts.db, groupId, req.user.sub);
    // 404 (e não 403) para não revelar a existência de grupos alheios.
    if (!member) throw new AppError(404, "NOT_FOUND", "Grupo não encontrado(a)");
    req.member = member;
  });
}

export default fp(authPlugin, { name: "splitgo-auth" });
