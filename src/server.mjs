import { createApp } from './api/app.mjs';

const memory = process.env.SPLITGO_STORAGE === 'memory';
let client;
let repository;
if (memory) {
  const { MemoryRepository } = await import('./persistence/memory.mjs');
  repository = new MemoryRepository();
  console.warn('SplitGo: modo memória; os dados serão perdidos ao reiniciar.');
} else {
  if (!process.env.DATABASE_URL) throw new Error('SplitGo: configure DATABASE_URL ou SPLITGO_STORAGE=memory.');
  const { default: pg } = await import('pg');
  const { PostgresRepository } = await import('./persistence/postgres.mjs');
  client = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await client.query('SELECT 1');
  repository = new PostgresRepository(client);
}
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('SplitGo: PORT inválida.');
const host = process.env.HOST ?? '127.0.0.1';
const server = createApp(repository).listen(port, host, () => console.log(`SplitGo: API em http://${host}:${server.address().port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(async () => { await client?.end(); process.exit(0); });
});
