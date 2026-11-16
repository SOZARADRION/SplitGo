import type { Extraction, ParsedReceipt, ReceiptMediaType } from "./types.js";

/** "12.90" | "12,90" | "12" → 1290 · inválido → null. Sem ponto flutuante. */
export function decimalToCents(value: string | null | undefined): number | null {
  if (value == null) return null;
  const v = value.trim().replace(/^R\$\s*/i, "").replace(",", ".");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** Aceita só datas reais AAAA-MM-DD. */
export function normalizeDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Converte a extração bruta para a resposta da API, com avisos de consistência. */
export function toParsedReceipt(raw: Extraction, fonte: ParsedReceipt["fonte"]): ParsedReceipt {
  const avisos: string[] = [];

  const itens: ParsedReceipt["itens"] = [];
  raw.itens.forEach((item, i) => {
    const unit = decimalToCents(item.valor_unitario);
    const line = decimalToCents(item.valor_total_item);
    const descricao = item.descricao.trim().slice(0, 140);
    if (unit === null || line === null || !descricao || !(item.quantidade > 0)) {
      avisos.push(`Item ${i + 1} ignorado: valores ilegíveis`);
      return;
    }
    itens.push({ descricao, quantidade: item.quantidade, valor_unitario: unit, valor_total_item: line });
  });

  const valor_total = decimalToCents(raw.valor_total);
  if (raw.valor_total != null && valor_total === null) avisos.push("Valor total ilegível");
  if (valor_total === null) avisos.push("Confira o valor total: ele não foi identificado no recibo");

  const data = normalizeDate(raw.data);
  if (raw.data && !data) avisos.push("Data ilegível");

  if (valor_total !== null && itens.length > 0) {
    const soma = itens.reduce((s, it) => s + it.valor_total_item, 0);
    if (soma !== valor_total) {
      avisos.push(
        `A soma dos itens (${brl(soma)}) difere do total (${brl(valor_total)}). ` +
          "Pode haver desconto, taxa de serviço ou item mal lido.",
      );
    }
  }

  return {
    estabelecimento: raw.estabelecimento?.trim().slice(0, 140) || null,
    data,
    valor_total,
    itens,
    fonte,
    avisos,
  };
}

/** Identifica o formato pelos primeiros bytes (a extensão/Content-Type do cliente não é confiável). */
export function sniffMediaType(buf: Buffer): ReceiptMediaType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  if (/^GIF8[79]a/.test(buf.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}
