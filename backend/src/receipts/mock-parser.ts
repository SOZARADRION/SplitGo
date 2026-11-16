import { createHash } from "node:crypto";
import type { Extraction, ReceiptFile, ReceiptParser } from "./types.js";

/**
 * Leitor SIMULADO: devolve um de alguns recibos de exemplo, escolhido pelo hash
 * da imagem (a mesma imagem sempre gera o mesmo resultado). Serve para
 * desenvolver o app sem chave da API e sem custo.
 */
const SAMPLES: Extraction[] = [
  {
    e_recibo: true,
    estabelecimento: "Padaria Pão Dourado",
    data: "2026-11-14",
    valor_total: "47.30",
    itens: [
      { descricao: "Pão francês", quantidade: 10, valor_unitario: "0.90", valor_total_item: "9.00" },
      { descricao: "Café coado grande", quantidade: 3, valor_unitario: "7.50", valor_total_item: "22.50" },
      { descricao: "Pão de queijo", quantidade: 4, valor_unitario: "3.95", valor_total_item: "15.80" },
    ],
  },
  {
    e_recibo: true,
    estabelecimento: "Supermercado Bom Preço",
    data: "2026-11-13",
    valor_total: "186.42",
    itens: [
      { descricao: "Picanha bovina kg", quantidade: 1.25, valor_unitario: "89.90", valor_total_item: "112.38" },
      { descricao: "Carvão 4kg", quantidade: 2, valor_unitario: "18.90", valor_total_item: "37.80" },
      { descricao: "Cerveja lata 350ml", quantidade: 12, valor_unitario: "3.19", valor_total_item: "38.28" },
    ],
  },
  {
    e_recibo: true,
    estabelecimento: "Restaurante Sabor da Serra",
    data: "2026-11-12",
    valor_total: "214.50",
    itens: [
      { descricao: "Moqueca para 2", quantidade: 1, valor_unitario: "129.00", valor_total_item: "129.00" },
      { descricao: "Suco natural", quantidade: 3, valor_unitario: "12.00", valor_total_item: "36.00" },
      { descricao: "Sobremesa do dia", quantidade: 2, valor_unitario: "15.00", valor_total_item: "30.00" },
    ],
  },
];

export class MockReceiptParser implements ReceiptParser {
  readonly source = "simulado" as const;

  async extract(file: ReceiptFile): Promise<Extraction> {
    const digest = createHash("sha256").update(file.data).digest();
    return structuredClone(SAMPLES[digest[0] % SAMPLES.length]);
  }
}
