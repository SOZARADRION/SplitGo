/**
 * Utilitários monetários. Todo valor do sistema é um inteiro em centavos.
 */

export function assertCents(value: number, label = "valor"): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} deve ser um inteiro em centavos (recebido: ${value})`);
  }
}

/**
 * Divide `amountCents` proporcionalmente a `weights` (inteiros >= 0) pelo
 * método do maior resto. A soma do resultado é sempre exatamente `amountCents`.
 * Empates no resto são resolvidos pela ordem de entrada (determinístico).
 *
 * allocate(10000, [1, 1, 1]) → [3334, 3333, 3333]
 */
export function allocate(amountCents: number, weights: number[]): number[] {
  assertCents(amountCents, "amountCents");
  if (amountCents < 0) throw new RangeError("amountCents não pode ser negativo");
  if (weights.length === 0) throw new RangeError("Informe ao menos um peso");
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`Peso inválido: ${w}`);
  }
  const total = weights.reduce((s, w) => s + w, 0);
  if (total === 0) throw new RangeError("A soma dos pesos deve ser maior que zero");
  if (!Number.isSafeInteger(amountCents * total)) {
    throw new RangeError("Valor ou pesos grandes demais para divisão exata");
  }

  const result = weights.map((w) => Math.floor((amountCents * w) / total));
  let leftover = amountCents - result.reduce((s, v) => s + v, 0);

  const order = weights
    .map((w, i) => ({ i, rest: (amountCents * w) % total }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);

  for (let k = 0; leftover > 0; k++, leftover--) result[order[k].i] += 1;
  return result;
}
