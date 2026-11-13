import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEqually, calculateBalances, simplifyDebts } from '../src/domain/accounting.ts';

test('divisão preserva cada centavo e tem desempate estável', () => {
  assert.deepEqual(splitEqually(100n, ['c', 'b', 'a']), [
    { memberId: 'a', amountCents: 34n },
    { memberId: 'b', amountCents: 33n },
    { memberId: 'c', amountCents: 33n },
  ]);
});

test('despesa e quitação conservam saldo; pagador pode estar fora da divisão', () => {
  const expenses = [{ payerId: 'a', totalCents: 100n, shares: [{ memberId: 'b', amountCents: 100n }] }];
  const balances = calculateBalances(['a', 'b'], expenses);
  const result = simplifyDebts(balances);
  assert.deepEqual(result.transfers, [{ fromMemberId: 'b', toMemberId: 'a', amountCents: 100n }]);
  assert.ok(calculateBalances(['a', 'b'], expenses, result.transfers).every(b => b.cents === 0n));
});

test('busca exata supera pareamento guloso e não altera entrada', () => {
  const input = [-8n, -7n, -5n, 5n, 7n, 8n].map((cents, i) => ({ memberId: String(i), cents }));
  const original = structuredClone(input);
  const result = simplifyDebts(input);
  assert.equal(result.optimal, true);
  assert.equal(result.transfers.length, 3);
  assert.deepEqual(input, original);
});

test('zero, inconsistências e divisões inválidas', () => {
  assert.deepEqual(simplifyDebts([]), { transfers: [], optimal: true });
  assert.throws(() => simplifyDebts([{ memberId: 'a', cents: 1n }]));
  assert.throws(() => splitEqually(10n, ['a', 'a']));
  assert.throws(() => calculateBalances(['a'], [{ payerId: 'a', totalCents: 10n, shares: [{ memberId: 'a', amountCents: 9n }] }]));
  assert.throws(() => calculateBalances(['a'], [{ payerId: 'b', totalCents: 10n, shares: [{ memberId: 'a', amountCents: 10n }] }]));
});

test('fallback explícito quita grupos maiores', () => {
  const input = Array.from({ length: 14 }, (_, i) => ({ memberId: String(i), cents: i < 7 ? -10n : 10n }));
  const result = simplifyDebts(input);
  assert.equal(result.optimal, false);
  const final = new Map(input.map(b => [b.memberId, b.cents]));
  for (const t of result.transfers) {
    final.set(t.fromMemberId, final.get(t.fromMemberId) + t.amountCents);
    final.set(t.toMemberId, final.get(t.toMemberId) - t.amountCents);
  }
  assert.ok([...final.values()].every(value => value === 0n));
});

test('vários grupos pequenos: solução quita todos os saldos', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const cents = Array.from({ length: 7 }, (_, i) => BigInt((seed * (i + 3) * 17) % 41 - 20));
    cents.push(-cents.reduce((sum, v) => sum + v, 0n));
    const input = cents.map((value, i) => ({ memberId: String(i), cents: value }));
    const { transfers, optimal } = simplifyDebts(input);
    const final = [...cents];
    for (const t of transfers) {
      assert.ok(t.amountCents > 0n);
      final[Number(t.fromMemberId)] += t.amountCents;
      final[Number(t.toMemberId)] -= t.amountCents;
    }
    assert.ok(optimal && final.every(v => v === 0n));
  }
});
