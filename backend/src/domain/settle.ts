import { assertCents } from "./money.js";

/**
 * Simplificação de dívidas (Etapa 2).
 *
 * Entrada: saldo líquido de cada membro (> 0 recebe, < 0 paga), soma zero.
 * Saída: lista de transferências que zera todos os saldos com o MENOR número
 * possível de transações.
 *
 * Fundamento: se os n membros com saldo ≠ 0 podem ser particionados em k
 * subgrupos disjuntos que somam zero, cada subgrupo se resolve internamente
 * com (tamanho − 1) transferências, totalizando n − k. Minimizar transferências
 * equivale a MAXIMIZAR k. O problema é NP-difícil, então:
 *   - n ≤ EXACT_LIMIT → solução ótima exata por programação dinâmica em bitmask;
 *   - n maior          → heurística gulosa (garante no máximo n − 1).
 */

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export const EXACT_LIMIT = 16;

type Entry = { id: string; cents: number };

export function simplifyDebts(balances: Map<string, number> | Record<string, number>): Transfer[] {
  const raw = balances instanceof Map ? [...balances] : Object.entries(balances);

  let total = 0;
  const entries: Entry[] = [];
  for (const [id, cents] of raw) {
    assertCents(cents, `saldo de ${id}`);
    total += cents;
    if (cents !== 0) entries.push({ id, cents });
  }
  if (total !== 0) throw new Error(`Saldos inconsistentes: a soma deveria ser 0 (é ${total})`);
  if (entries.length === 0) return [];

  // Ordenação estável por id → mesma entrada gera sempre a mesma saída.
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return entries.length <= EXACT_LIMIT ? optimalSettle(entries) : greedySettle(entries);
}

/**
 * Guloso: o maior devedor paga ao maior credor, repetidamente.
 * O(n log n). Cada passo zera pelo menos um membro → no máximo n − 1 transferências.
 */
export function greedySettle(entries: Entry[]): Transfer[] {
  const byAmountDesc = (a: { v: number; id: string }, b: { v: number; id: string }) =>
    b.v - a.v || (a.id < b.id ? -1 : 1);
  const creditors = entries.filter((e) => e.cents > 0).map((e) => ({ id: e.id, v: e.cents }));
  const debtors = entries.filter((e) => e.cents < 0).map((e) => ({ id: e.id, v: -e.cents }));
  creditors.sort(byAmountDesc);
  debtors.sort(byAmountDesc);

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amount = Math.min(d.v, c.v);
    out.push({ fromMemberId: d.id, toMemberId: c.id, amountCents: amount });
    d.v -= amount;
    c.v -= amount;
    if (d.v === 0) i++;
    if (c.v === 0) j++;
  }
  return out;
}

/**
 * Ótimo exato. dp[mask] = maior número de subgrupos de soma zero disjuntos
 * que cabem em `mask`, considerando cadeias de remoção de um elemento por vez.
 * Tempo O(2^n · n), memória O(2^n). n = 16 → ~1M operações (milissegundos).
 */
export function optimalSettle(entries: Entry[]): Transfer[] {
  const n = entries.length;
  const size = 1 << n;
  const full = size - 1;
  const sum = new Float64Array(size);
  const dp = new Int8Array(size);

  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    sum[mask] = sum[mask ^ low] + entries[31 - Math.clz32(low)].cents;
    let best = 0;
    for (let bits = mask; bits; bits &= bits - 1) {
      const v = dp[mask ^ (bits & -bits)];
      if (v > best) best = v;
    }
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0);
  }

  // Reconstrução: percorre do conjunto completo até o vazio removendo um
  // elemento por vez sem perder o ótimo. As máscaras de soma zero visitadas
  // formam uma cadeia; a diferença entre duas consecutivas é um subgrupo.
  const groups: number[] = [];
  let mask = full;
  let groupStart = full;
  while (mask) {
    const bonus = sum[mask] === 0 ? 1 : 0;
    for (let bits = mask; bits; bits &= bits - 1) {
      const prev = mask ^ (bits & -bits);
      if (dp[prev] + bonus === dp[mask]) {
        mask = prev;
        break;
      }
    }
    if (mask === 0 || sum[mask] === 0) {
      groups.push(groupStart ^ mask);
      groupStart = mask;
    }
  }

  return groups.flatMap((g) => greedySettle(entries.filter((_, k) => g & (1 << k))));
}
