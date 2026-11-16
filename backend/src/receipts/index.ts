import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";
import { ClaudeReceiptParser } from "./claude-parser.js";
import { MockReceiptParser } from "./mock-parser.js";
import { sniffMediaType, toParsedReceipt } from "./normalize.js";
import type { ParsedReceipt, ReceiptParser } from "./types.js";

export type { ParsedReceipt, ReceiptParser } from "./types.js";

export function createReceiptParser(config: AppConfig): ReceiptParser {
  return config.receipts.parser === "claude"
    ? new ClaudeReceiptParser(undefined, config.receipts.model)
    : new MockReceiptParser();
}

/** Valida o arquivo, chama o leitor e devolve a resposta normalizada (centavos + avisos). */
export async function parseReceipt(parser: ReceiptParser, data: Buffer): Promise<ParsedReceipt> {
  const mediaType = sniffMediaType(data);
  if (!mediaType) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Envie uma imagem JPEG, PNG, WebP ou GIF, ou um PDF");
  }

  const raw = await parser.extract({ data, mediaType });
  if (!raw.e_recibo) {
    throw new AppError(422, "NOT_A_RECEIPT", "Não encontramos um recibo legível nesta imagem");
  }

  const result = toParsedReceipt(raw, parser.source);
  if (parser.source === "simulado") {
    result.avisos.unshift("Leitura simulada: configure ANTHROPIC_API_KEY no servidor para ler recibos de verdade");
  }
  return result;
}
