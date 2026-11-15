import { allocate } from "./money.js";

/**
 * Regras de divisão de uma despesa. Recebe a intenção do usuário e devolve
 * quanto cada membro deve, em centavos, com soma exata igual ao total.
 */

export type SplitType = "EQUAL" | "EXACT" | "PERCENT" | "SHARES";

export type SplitInput =
  | { type: "EQUAL"; memberIds: string[] }
  | { type: "EXACT"; shares: { memberId: string; amountCents: number }[] }
  /** percent com até 2 casas decimais; a soma deve ser 100 */
  | { type: "PERCENT"; shares: { memberId: string; percent: number }[] }
  /** pesos inteiros: ex. um casal conta 2, uma pessoa conta 1 */
  | { type: "SHARES"; shares: { memberId: string; weight: number }[] };

export interface ResolvedShare {
  memberId: string;
  amountCents: number;
  /** valor informado pelo usuário (% ou peso), guardado para reedição */
  input: number | null;
}

export class SplitError extends Error {}

export function resolveSplit(amountCents: number, split: SplitInput): ResolvedShare[] {
  const ids =
    split.type === "EQUAL" ? split.memberIds : split.shares.map((s) => s.memberId);

  if (ids.length === 0) throw new SplitError("A divisão precisa de ao menos um participante");
  if (new Set(ids).size !== ids.length) {
    throw new SplitError("Um participante aparece mais de uma vez na divisão");
  }

  switch (split.type) {
    case "EQUAL": {
      const amounts = allocate(amountCents, ids.map(() => 1));
      return ids.map((memberId, i) => ({ memberId, amountCents: amounts[i], input: null }));
    }

    case "EXACT": {
      const sum = split.shares.reduce((s, x) => s + x.amountCents, 0);
      if (sum !== amountCents) {
        throw new SplitError(
          `A soma dos valores (${sum}) difere do total da despesa (${amountCents})`,
        );
      }
      return split.shares.map((s) => ({
        memberId: s.memberId,
        amountCents: s.amountCents,
        input: null,
      }));
    }

    case "PERCENT": {
      // Trabalha em pontos-base (1% = 100) para evitar ponto flutuante.
      const bps = split.shares.map((s) => {
        const bp = Math.round(s.percent * 100);
        if (Math.abs(bp - s.percent * 100) > 1e-6) {
          throw new SplitError(`Percentual com mais de 2 casas decimais: ${s.percent}`);
        }
        return bp;
      });
      const total = bps.reduce((s, v) => s + v, 0);
      if (total !== 10_000) {
        throw new SplitError(`Os percentuais somam ${total / 100}%, e devem somar 100%`);
      }
      const amounts = allocate(amountCents, bps);
      return split.shares.map((s, i) => ({
        memberId: s.memberId,
        amountCents: amounts[i],
        input: s.percent,
      }));
    }

    case "SHARES": {
      const amounts = allocate(amountCents, split.shares.map((s) => s.weight));
      return split.shares.map((s, i) => ({
        memberId: s.memberId,
        amountCents: amounts[i],
        input: s.weight,
      }));
    }
  }
}
