/**
 * Dinheiro no app: sempre inteiro em centavos, como na API.
 * Formatação manual (sem Intl) para ser idêntica em Android, iOS e web.
 */

/** 123456 → "R$ 1.234,56" · com sign: "+R$ 1.234,56" / "−R$ 1.234,56" */
export function formatBRL(cents: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centavos = String(abs % 100).padStart(2, "0");
  const prefix = cents < 0 ? "−" : opts.sign && cents > 0 ? "+" : "";
  return `${prefix}R$ ${reais},${centavos}`;
}

/** Para preencher campos: 1250 → "12,50" */
export function centsToInput(cents: number): string {
  return formatBRL(cents).replace("R$ ", "");
}

/**
 * Lê o que o usuário digitou: "12,50", "12.50", "1.234,56", "R$ 30" → centavos.
 * Retorna null se não for um valor válido (mais de 2 casas, letras etc.).
 */
export function parseBRL(input: string): number | null {
  let v = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!v) return null;
  if (v.includes(",")) {
    v = v.replace(/\./g, "").replace(",", "."); // formato brasileiro
  } else if (/\.\d{3}(\.|$)/.test(v)) {
    v = v.replace(/\./g, ""); // "1.234" = mil duzentos e trinta e quatro
  }
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** "2026-11-13" ou ISO completo → "13/11/2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
