import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyDebts } from '../src/domain/accounting.ts';

// Oráculo independente: enumera quitações de um saldo contra saldos opostos.
function minimumCount(values) {
  const a = values.filter(v => v !== 0n);
  if (!a.length) return 0;
  let best = Infinity;
  for (let j = 1; j < a.length; j++) {
    if ((a[0] < 0n) === (a[j] < 0n)) continue;
    const next = a.slice(1);
    next[j - 1] += a[0];
    best = Math.min(best, 1 + minimumCount(next));
  }
  return best;
}

test('mínimo exato coincide com oráculo independente em 100 grupos', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const values = Array.from({ length: 5 }, (_, i) => BigInt((seed * (i + 1) * 13) % 19 - 9));
    values.push(-values.reduce((sum, v) => sum + v, 0n));
    const result = simplifyDebts(values.map((cents, i) => ({ memberId: String(i), cents })));
    assert.equal(result.optimal, true);
    assert.equal(result.transfers.length, minimumCount(values));
  }
});
