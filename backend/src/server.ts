import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/client.js";

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0"; // 0.0.0.0 → acessível pelo celular na mesma rede

const config = loadConfig();

// Em produção o disco do servidor costuma ser temporário (no Render, apagado a
// cada deploy): sem DATABASE_URL os dados sumiriam em silêncio.
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL é obrigatória em produção (PostgreSQL gerenciado)");
}

const { db, close } = await openDb({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.PGLITE_DIR ?? "./data/pglite",
});

const app = await buildApp(db, config, { logger: true });

const shutdown = async () => {
  await app.close();
  await close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port, host });
