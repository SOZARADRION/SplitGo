export type Balance = { memberId: string; cents: bigint };
export type Transfer = { fromMemberId: string; toMemberId: string; amountCents: bigint };
export type Expense = {
  payerId: string;
  totalCents: bigint;
  shares: { memberId: string; amountCents: bigint }[];
};

/** O restante de centavos é atribuído pela ordem estável dos IDs. */
export function splitEqually(totalCents: bigint, memberIds: string[]) {
  if (totalCents <= 0n || memberIds.length === 0 || new Set(memberIds).size !== memberIds.length) {
    throw new Error('SplitGo: valor ou participantes inválidos');
  }
  const ids = [...memberIds].sort();
  const count = BigInt(ids.length);
  return ids.map((memberId, i) => ({
    memberId,
    amountCents: totalCents / count + (BigInt(i) < totalCents % count ? 1n : 0n),
  }));
}

/** Positivo: tem a receber. Negativo: tem a pagar. */
export function calculateBalances(memberIds: string[], expenses: Expense[], settlements: Transfer[] = []): Balance[] {
  if (new Set(memberIds).size !== memberIds.length) throw new Error('SplitGo: membro duplicado');
  const balances = new Map(memberIds.map(id => [id, 0n]));
  function add(id: string, amount: bigint) {
    const previous = balances.get(id);
    if (previous === undefined) throw new Error('SplitGo: membro fora do grupo');
    balances.set(id, previous + amount);
  }
  for (const expense of expenses) {
    if (expense.totalCents <= 0n || expense.shares.length === 0 ||
        new Set(expense.shares.map(s => s.memberId)).size !== expense.shares.length ||
        expense.shares.some(s => s.amountCents < 0n) ||
        expense.shares.reduce((sum, s) => sum + s.amountCents, 0n) !== expense.totalCents) {
      throw new Error('SplitGo: divisão inválida');
    }
    add(expense.payerId, expense.totalCents);
    for (const share of expense.shares) add(share.memberId, -share.amountCents);
  }
  for (const payment of settlements) {
    if (payment.amountCents <= 0n || payment.fromMemberId === payment.toMemberId) throw new Error('SplitGo: pagamento inválido');
    add(payment.fromMemberId, payment.amountCents);
    add(payment.toMemberId, -payment.amountCents);
  }
  return [...balances].map(([memberId, cents]) => ({ memberId, cents }));
}

function greedy(balances: Balance[]): Transfer[] {
  const debtors = balances.filter(b => b.cents < 0n).map(b => ({ ...b }));
  const creditors = balances.filter(b => b.cents > 0n).map(b => ({ ...b }));
  const result: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amountCents = -debtors[i].cents < creditors[j].cents ? -debtors[i].cents : creditors[j].cents;
    result.push({ fromMemberId: debtors[i].memberId, toMemberId: creditors[j].memberId, amountCents });
    debtors[i].cents += amountCents;
    creditors[j].cents -= amountCents;
    if (debtors[i].cents === 0n) i++;
    if (creditors[j].cents === 0n) j++;
  }
  return result;
}

/**
 * Exato até 12 saldos não nulos: particiona em um máximo de subconjuntos de soma zero.
 * Um componente de k pessoas requer pelo menos k-1 transferências.
 * Maximizar componentes minimiza transferências; custo O(3^n), memória O(2^n).
 * Acima do limite, retorna solução válida sem garantia de mínimo global.
 */
export function simplifyDebts(input: Balance[]): { transfers: Transfer[]; optimal: boolean } {
  if (new Set(input.map(b => b.memberId)).size !== input.length) throw new Error('SplitGo: membro duplicado');
  if (input.reduce((sum, b) => sum + b.cents, 0n) !== 0n) throw new Error('SplitGo: saldos não somam zero');
  const balances = input.filter(b => b.cents !== 0n).map(b => ({ ...b })).sort((a, b) => a.memberId.localeCompare(b.memberId));
  const n = balances.length;
  if (n > 12) return { transfers: greedy(balances), optimal: false };
  const size = 1 << n;
  const sums = Array<bigint>(size).fill(0n);
  for (let mask = 1; mask < size; mask++) {
    const bit = mask & -mask;
    sums[mask] = sums[mask ^ bit] + balances[31 - Math.clz32(bit)].cents;
  }
  const memo = new Map<number, { count: number; subset: number }>();
  function solve(mask: number): number {
    if (mask === 0) return 0;
    const cached = memo.get(mask);
    if (cached) return cached.count;
    const first = mask & -mask;
    let best = { count: -1, subset: mask };
    for (let subset = mask; subset; subset = (subset - 1) & mask) {
      if (!(subset & first) || sums[subset] !== 0n) continue;
      const count = 1 + solve(mask ^ subset);
      if (count > best.count) best = { count, subset };
    }
    memo.set(mask, best);
    return best.count;
  }
  solve(size - 1);
  const transfers: Transfer[] = [];
  let remaining = size - 1;
  while (remaining) {
    const subset = memo.get(remaining)!.subset;
    transfers.push(...greedy(balances.filter((_, i) => subset & (1 << i))));
    remaining ^= subset;
  }
  return { transfers, optimal: true };
}
