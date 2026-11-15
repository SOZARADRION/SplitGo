import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import { z, ZodError } from "zod";
import authPlugin from "./auth/plugin.js";
import type { AppConfig } from "./config.js";
import type { Db } from "./db/client.js";
import { AppError } from "./errors.js";
import { authRoutes } from "./routes/auth.js";
import { groupRoutes } from "./routes/groups.js";

z.config(z.locales.ptBR()); // mensagens de validação em português

export async function buildApp(db: Db, config: AppConfig, opts: FastifyServerOptions = {}) {
  const app = Fastify({ bodyLimit: 64 * 1024, ...opts }); // 64 KB por requisição

  await app.register(cors, { origin: true });
  // global: false → o limite vale só nas rotas que pedem (login/cadastro).
  await app.register(rateLimit, { global: false });
  await app.register(authPlugin, { db, config });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: "Dados inválidos",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) {
      return reply.code(429).send({
        error: "TOO_MANY_REQUESTS",
        message: "Muitas tentativas. Aguarde um minuto e tente novamente.",
      });
    }
    if (status === 413) {
      return reply.code(413).send({ error: "PAYLOAD_TOO_LARGE", message: "Requisição grande demais (máx. 64 KB)" });
    }
    if (status && status >= 400 && status < 500) {
      // Erros do próprio Fastify (JSON malformado, corpo grande demais, etc.)
      return reply.code(status).send({ error: "BAD_REQUEST", message: (err as Error).message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: "INTERNAL_ERROR", message: "Erro interno" });
  });

  app.get("/health", async () => ({ service: "SplitGo API", status: "ok" }));

  await app.register(
    async (api) => {
      await api.register(authRoutes, { db, config });
      await api.register(groupRoutes, { db });
    },
    { prefix: "/api" },
  );

  return app;
}
