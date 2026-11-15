/**
 * Cálculo de saldos do grupo a partir de despesas e pagamentos registrados.
 * Nada aqui é persistido: o saldo é sempre derivado (fonte única da verdade).
 */

export interface LedgerExpense {
  paidByMemberId: string;
  amountCents: number;
  shares: { memberId: string; amountCents: number }[];
}

export interface LedgerSettlement {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export interface MemberBalance {
  memberId: string;
  /** total que o membro pagou em despesas */
  paidCents: number;
  /** soma das partes do membro nas despesas (o que ele consumiu) */
  shareCents: number;
  /** pagamentos de acerto que o membro enviou */
  sentCents: number;
  /** pagamentos de acerto que o membro recebeu */
  receivedCents: number;
  /** > 0: tem a receber · < 0: deve · 0: quite */
  balanceCents: number;
}

export function computeBalances(
  memberIds: string[],
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
): MemberBalance[] {
  const map = new Map<string, MemberBalance>();
  const get = (id: string): MemberBalance => {
    let b = map.get(id);
    if (!b) {
      b = { memberId: id, paidCents: 0, shareCents: 0, sentCents: 0, receivedCents: 0, balanceCents: 0 };
      map.set(id, b);
    }
    return b;
  };
  memberIds.forEach(get);

  for (const e of expenses) {
    const sum = e.shares.reduce((s, x) => s + x.amountCents, 0);
    if (sum !== e.amountCents) {
      throw new Error(`Despesa inconsistente: partes somam ${sum}, total ${e.amountCents}`);
    }
    get(e.paidByMemberId).paidCents += e.amountCents;
    for (const s of e.shares) get(s.memberId).shareCents += s.amountCents;
  }
  for (const s of settlements) {
    get(s.fromMemberId).sentCents += s.amountCents;
    get(s.toMemberId).receivedCents += s.amountCents;
  }

  for (const b of map.values()) {
    b.balanceCents = b.paidCents - b.shareCents + b.sentCents - b.receivedCents;
  }
  return [...map.values()];
}
