import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresRepository } from '../src/persistence/postgres.mjs';
import { calculateBalances } from '../src/domain/accounting.ts';

test('PostgreSQL: persistência, constraints e rollback de rateio inválido', {
  skip: !process.env.TEST_DATABASE_URL && 'Configure TEST_DATABASE_URL para executar integração real.',
}, async () => {
  // Schema isolado: não apaga tabelas da aplicação nem usa o search_path padrão.
  const schema = `splitgo_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    const sql = await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8') + '\n' +
      await readFile(new URL('../prisma/constraints.sql', import.meta.url), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } finally { client.release(); }
    const repository = new PostgresRepository(pool);
    const group = await repository.createGroup({ name: 'Teste', members: [{ name: 'Ana' }, { name: 'Bruno' }] });
    const [a, b] = group.members;
    const expense = { description: 'Jantar', payerId: a.id, totalCents: 100n, splitMode: 'CUSTOM', shares: [{ memberId: b.id, amountCents: 100n }] };
    await repository.mutateGroup(group.id, () => ({ expense }));
    const snapshot = await repository.getGroup(group.id);
    assert.equal(snapshot.expenses[0].totalCents, 100n);
    assert.equal(calculateBalances(snapshot.members.map(m => m.id), snapshot.expenses).find(m => m.memberId === a.id).cents, 100n);
    // Ignora a validação HTTP para provar a proteção do próprio banco.
    await assert.rejects(repository.mutateGroup(group.id, () => ({ expense: { ...expense, shares: [{ memberId: b.id, amountCents: 99n }] } })), /shares must equal total/);
    assert.equal((await repository.getGroup(group.id)).expenses.length, 1);
    const outsider = await repository.createGroup({ name: 'Outro', members: [{ name: 'Carla' }] });
    await assert.rejects(repository.mutateGroup(group.id, () => ({ expense: { ...expense, payerId: outsider.members[0].id } })), { code: '23503' });
    assert.equal((await repository.getGroup(group.id)).expenses.length, 1);
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
