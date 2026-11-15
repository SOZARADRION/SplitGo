import { describe, expect, it } from "vitest";
import { computeBalances } from "../src/domain/balances.js";
import { allocate } from "../src/domain/money.js";
import { resolveSplit } from "../src/domain/split.js";

const sum = (xs: { amountCents: number }[]) => xs.reduce((s, x) => s + x.amountCents, 0);

describe("allocate", () => {
  it("distribui o resto de forma determinística", () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(allocate(1, [1, 1])).toEqual([1, 0]);
    expect(allocate(100, [1, 0, 1])).toEqual([50, 0, 50]);
  });

  it("sempre soma exatamente o total", () => {
    for (let amount = 1; amount < 500; amount += 7) {
      const weights = [3, 1, 4, 1, 5];
      expect(allocate(amount, weights).reduce((a, b) => a + b, 0)).toBe(amount);
    }
  });

  it("rejeita pesos inválidos", () => {
    expect(() => allocate(100, [])).toThrow();
    expect(() => allocate(100, [0, 0])).toThrow();
    expect(() => allocate(100, [-1, 2])).toThrow();
  });
});

describe("resolveSplit", () => {
  it("EQUAL", () => {
    const r = resolveSplit(10000, { type: "EQUAL", memberIds: ["a", "b", "c"] });
    expect(r.map((s) => s.amountCents)).toEqual([3334, 3333, 3333]);
  });

  it("EXACT exige soma igual ao total", () => {
    const ok = resolveSplit(1000, {
      type: "EXACT",
      shares: [{ memberId: "a", amountCents: 700 }, { memberId: "b", amountCents: 300 }],
    });
    expect(sum(ok)).toBe(1000);
    expect(() =>
      resolveSplit(1000, { type: "EXACT", shares: [{ memberId: "a", amountCents: 999 }] }),
    ).toThrow(/difere do total/);
  });

  it("PERCENT com casas decimais", () => {
    const r = resolveSplit(9999, {
      type: "PERCENT",
      shares: [
        { memberId: "a", percent: 33.33 },
        { memberId: "b", percent: 33.33 },
        { memberId: "c", percent: 33.34 },
      ],
    });
    expect(sum(r)).toBe(9999);
    expect(r[2].input).toBe(33.34);
  });

  it("PERCENT precisa somar 100", () => {
    expect(() =>
      resolveSplit(100, { type: "PERCENT", shares: [{ memberId: "a", percent: 99 }] }),
    ).toThrow(/100%/);
  });

  it("SHARES por peso (casal conta 2)", () => {
    const r = resolveSplit(30000, {
      type: "SHARES",
      shares: [{ memberId: "casal", weight: 2 }, { memberId: "solo", weight: 1 }],
    });
    expect(r.map((s) => s.amountCents)).toEqual([20000, 10000]);
  });

  it("rejeita participante repetido", () => {
    expect(() => resolveSplit(100, { type: "EQUAL", memberIds: ["a", "a"] })).toThrow(/mais de uma vez/);
  });
});

describe("computeBalances", () => {
  it("considera despesas e acertos; a soma é sempre zero", () => {
    const b = computeBalances(
      ["ana", "bia", "caio"],
      [
        { paidByMemberId: "ana", amountCents: 30000, shares: [
          { memberId: "ana", amountCents: 10000 },
          { memberId: "bia", amountCents: 10000 },
          { memberId: "caio", amountCents: 10000 },
        ] },
      ],
      [{ fromMemberId: "bia", toMemberId: "ana", amountCents: 10000 }],
    );
    const byId = Object.fromEntries(b.map((x) => [x.memberId, x.balanceCents]));
    expect(byId).toEqual({ ana: 10000, bia: 0, caio: -10000 });
    expect(b.reduce((s, x) => s + x.balanceCents, 0)).toBe(0);
  });
});
