import { z } from "zod";

/** Formatos aceitos pelo leitor de recibos (validados pelos bytes, não pela extensão). */
export type ReceiptMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf";

export interface ReceiptFile {
  data: Buffer;
  mediaType: ReceiptMediaType;
}

/**
 * Formato que o leitor (IA ou simulado) devolve. Valores monetários vêm como
 * texto decimal ("12.90") e são convertidos para centavos pelo servidor, para
 * não depender de aritmética do modelo.
 */
export const extractionSchema = z.object({
  e_recibo: z
    .boolean()
    .describe("true se a imagem é um recibo, cupom ou nota fiscal legível; false caso contrário"),
  estabelecimento: z.string().nullable().describe("Nome do estabelecimento, como impresso; null se ilegível"),
  data: z.string().nullable().describe("Data da compra no formato AAAA-MM-DD; null se ausente ou ilegível"),
  valor_total: z
    .string()
    .nullable()
    .describe("Valor total pago, com ponto decimal e sem separador de milhar, ex.: 1234.56"),
  itens: z
    .array(
      z.object({
        descricao: z.string().describe("Descrição do item como impressa"),
        quantidade: z.number().describe("Quantidade (pode ser fracionária, ex.: 0.512 kg)"),
        valor_unitario: z.string().describe("Preço unitário, ex.: 12.90"),
        valor_total_item: z.string().describe("Valor total da linha (quantidade × unitário), ex.: 25.80"),
      }),
    )
    .describe("Itens na ordem do recibo; vazio se não houver itens legíveis"),
});

export type Extraction = z.infer<typeof extractionSchema>;

/** Resposta da API: todos os valores em centavos (inteiros), como no resto do SplitGo. */
export interface ParsedReceipt {
  estabelecimento: string | null;
  data: string | null;
  valor_total: number | null;
  itens: { descricao: string; quantidade: number; valor_unitario: number; valor_total_item: number }[];
  fonte: "claude" | "simulado";
  avisos: string[];
}

export interface ReceiptParser {
  readonly source: ParsedReceipt["fonte"];
  extract(file: ReceiptFile): Promise<Extraction>;
}
