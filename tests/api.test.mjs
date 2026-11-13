import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/api/app.mjs';
import { MemoryRepository } from '../src/persistence/memory.mjs';

async function fixture(t) {
  const server = createApp(new MemoryRepository()).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return async (method, path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
}

test('HTTP: grupo, participante, divisão igual/customizada e extrato simplificado', async t => {
  const request = await fixture(t);
  const created = await request('POST', '/groups', { name: 'Viagem', members: [{ name: 'Ana' }, { name: 'Bruno' }] });
  assert.equal(created.status, 201);
  const group = created.body;
  const added = await request('POST', `/groups/${group.id}/members`, { name: 'Carla', email: 'carla@example.com' });
  assert.equal(added.status, 201);
  const [a, b] = group.members;
  const c = added.body;
  const expense = await request('POST', `/groups/${group.id}/expenses`, {
    description: 'Jantar', totalCents: '12000', payerId: a.id, splitMode: 'EQUAL', memberIds: [a.id, b.id, c.id],
  });
  assert.equal(expense.status, 201);
  assert.equal(expense.body.shares.length, 3);
  const custom = await request('POST', `/groups/${group.id}/expenses`, {
    description: 'Táxi', totalCents: '3000', payerId: b.id, splitMode: 'CUSTOM',
    shares: [{ memberId: a.id, amountCents: '1000' }, { memberId: c.id, amountCents: '2000' }],
  });
  assert.equal(custom.status, 201);
  const summary = await request('GET', `/groups/${group.id}/summary`);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.totalExpenseCents, '15000');
  const ana = summary.body.members.find(m => m.id === a.id);
  assert.equal(ana.paidCents, '12000');
  assert.equal(ana.owedCents, '5000');
  assert.equal(ana.balanceCents, '7000');
  assert.equal(summary.body.members.find(m => m.id === b.id).balanceCents, '-1000');
  assert.equal(summary.body.members.find(m => m.id === c.id).balanceCents, '-6000');
  assert.equal(summary.body.optimal, true);
  assert.equal(summary.body.transfers.length, 2);
});

test('HTTP: rejeita dados inválidos sem gravar despesas parciais', async t => {
  const request = await fixture(t);
  const { body: group } = await request('POST', '/groups', { name: 'Casa', members: [{ name: 'Ana' }] });
  const a = group.members[0].id;
  const base = { description: 'Conta', totalCents: '100', payerId: a, splitMode: 'CUSTOM', shares: [{ memberId: a, amountCents: '100' }] };
  for (const payload of [
    { ...base, totalCents: 100 },
    { ...base, totalCents: '1.00' },
    { ...base, totalCents: '-100' },
    { ...base, totalCents: '9223372036854775808' },
    { ...base, payerId: randomUUID() },
    { ...base, shares: [{ memberId: a, amountCents: '99' }] },
    { ...base, shares: [{ memberId: a, amountCents: '50' }, { memberId: a, amountCents: '50' }] },
    { ...base, shares: [{ memberId: randomUUID(), amountCents: '100' }] },
    { description: 'Conta', totalCents: '100', payerId: a, splitMode: 'EQUAL', memberIds: [a, a] },
  ]) assert.equal((await request('POST', `/groups/${group.id}/expenses`, payload)).status, 422);
  assert.equal((await request('GET', `/groups/${group.id}`)).body.expenses.length, 0);
  assert.equal((await request('GET', `/groups/${randomUUID()}/summary`)).status, 404);
  assert.equal((await request('GET', '/groups/not-an-id')).status, 422);
  assert.equal((await request('GET', '/missing')).status, 404);
});

test('HTTP: e-mails normalizados e únicos por grupo; extrato vazio', async t => {
  const request = await fixture(t);
  const { body: group } = await request('POST', '/groups', { name: 'Casa', members: [{ name: 'Ana', email: 'Ana@example.com' }] });
  assert.equal(group.members[0].email, 'ana@example.com');
  assert.equal((await request('POST', `/groups/${group.id}/members`, { name: 'Outra', email: 'ANA@example.com' })).status, 409);
  const summary = await request('GET', `/groups/${group.id}/summary`);
  assert.equal(summary.body.members[0].balanceCents, '0');
  assert.deepEqual(summary.body.transfers, []);
  assert.equal((await request('POST', '/groups', { name: 'Casa', members: [{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'A@example.com' }] })).status, 409);
});
