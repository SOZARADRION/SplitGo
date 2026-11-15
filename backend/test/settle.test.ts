import { describe, expect, it } from "vitest";
import { EXACT_LIMIT, simplifyDebts, type Transfer } from "../src/domain/settle.js";

function applyTransfers(balances: Record<string, number>, transfers: Transfer[]) {
  const after = { ...balances };
  for (const t of transfers) {
    after[t.fromMemberId] += t.amountCents;
    after[t.toMemberId] -= t.amountCents;
  }
  return after;
}

function expectSettles(balances: Record<string, number>, transfers: Transfer[]) {
  const after = applyTransfers(balances, transfers);
  for (const v of Object.values(after)) expect(v).toBe(0);
  for (const t of transfers) {
    expect(t.amountCents).toBeGreaterThan(0);
    expect(Number.isInteger(t.amountCents)).toBe(true);
    expect(t.fromMemberId).not.toBe(t.toMemberId);
    // Quem paga sempre devia; quem recebe sempre tinha a receber.
    expect(balances[t.fromMemberId]).toBeLessThan(0);
    expect(balances[t.toMemberId]).toBeGreaterThan(0);
  }
}

/** Referência por força bruta (backtracking clássico) para conferir o ótimo. */
function bruteForceMin(values: number[]): number {
  const debt = values.filter((v) => v !== 0);
  const dfs = (start: number): number => {
    while (start < debt.length && debt[start] === 0) start++;
    if (start === debt.length) return 0;
    let best = Infinity;
    for (let i = start + 1; i < debt.length; i++) {
      if (debt[i] * debt[start] < 0) {
        debt[i] += debt[start];
        best = Math.min(best, 1 + dfs(start + 1));
        debt[i] -= debt[start];
        if (debt[i] + debt[start] === 0) break; // casamento perfeito: não há melhor
      }
    }
    return best;
  };
  return dfs(0);
}

function randomBalances(n: number, rng: () => number, maxCents = 20_000): Record<string, number> {
  const vals = Array.from({ length: n - 1 }, () => Math.floor(rng() * (2 * maxCents + 1)) - maxCents);
  vals.push(-vals.reduce((a, b) => a + b, 0) || 0); // `|| 0` evita −0
  return Object.fromEntries(vals.map((v, i) => [`m${String(i).padStart(2, "0")}`, v]));
}

/** PRNG determinístico (mulberry32) — testes reproduzíveis. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("simplifyDebts", () => {
  it("retorna vazio quando todos estão quites", () => {
    expect(simplifyDebts({})).toEqual([]);
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
  });

  it("resolve o caso simples de duas pessoas", () => {
    expect(simplifyDebts({ ana: 5000, bia: -5000 })).toEqual([
      { fromMemberId: "bia", toMemberId: "ana", amountCents: 5000 },
    ]);
  });

  it("elimina dívidas cruzadas (A→B→C vira A→C)", () => {
    // A deve 10 a B, B deve 10 a C → saldo líquido: A −10, B 0, C +10
    const t = simplifyDebts({ A: -1000, B: 0, C: 1000 });
    expect(t).toEqual([{ fromMemberId: "A", toMemberId: "C", amountCents: 1000 }]);
  });

  it("encontra o ótimo onde o guloso puro falha", () => {
    // Guloso (maior devedor → maior credor) gasta 4 transferências:
    //   c→b 7, e→a 5, e→d 2, c→d 1.
    // Ótimo usa 3, porque {b, e} e {a, c, d} zeram separadamente:
    //   e→b 7 · c→a 5 · c→d 3.
    const balances = { a: 500, b: 700, c: -800, d: 300, e: -700 };
    const t = simplifyDebts(balances);
    expectSettles(balances, t);
    expect(t).toHaveLength(3);
    expect(t).toContainEqual({ fromMemberId: "e", toMemberId: "b", amountCents: 700 });
  });

  it("é determinístico (mesma entrada → mesma saída, independente da ordem)", () => {
    const a = simplifyDebts({ x: -300, y: 100, z: 200 });
    const b = simplifyDebts({ z: 200, x: -300, y: 100 });
    expect(a).toEqual(b);
  });

  it("aceita Map como entrada", () => {
    const t = simplifyDebts(new Map([["p", -1], ["q", 1]]));
    expect(t).toEqual([{ fromMemberId: "p", toMemberId: "q", amountCents: 1 }]);
  });

  it("rejeita saldos que não somam zero", () => {
    expect(() => simplifyDebts({ a: 100, b: -99 })).toThrow(/soma deveria ser 0/);
  });

  it("rejeita valores não inteiros", () => {
    expect(() => simplifyDebts({ a: 0.5, b: -0.5 })).toThrow(/inteiro em centavos/);
  });

  it("bate com a força bruta em 500 grupos aleatórios (até 8 membros)", () => {
    const rng = mulberry32(42);
    for (let r = 0; r < 500; r++) {
      const n = 2 + Math.floor(rng() * 7);
      // Valores pequenos geram muitos subgrupos de soma zero → caso difícil.
      const balances = randomBalances(n, rng, 5);
      const t = simplifyDebts(balances);
      expectSettles(balances, t);
      expect(t.length, JSON.stringify(balances)).toBe(bruteForceMin(Object.values(balances)));
    }
  });

  it(`resolve ${EXACT_LIMIT} membros (limite exato) rapidamente`, () => {
    const balances = randomBalances(EXACT_LIMIT, mulberry32(7), 50);
    const start = performance.now();
    const t = simplifyDebts(balances);
    const ms = performance.now() - start;
    expectSettles(balances, t);
    expect(ms).toBeLessThan(1000);
  });

  it("usa o guloso acima do limite e nunca passa de n − 1 transferências", () => {
    const rng = mulberry32(99);
    for (const n of [EXACT_LIMIT + 1, 50, 500]) {
      const balances = randomBalances(n, rng);
      const nonZero = Object.values(balances).filter((v) => v !== 0).length;
      const t = simplifyDebts(balances);
      expectSettles(balances, t);
      expect(t.length).toBeLessThanOrEqual(nonZero - 1);
    }
  });
});
