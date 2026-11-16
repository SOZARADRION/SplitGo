import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";
import { parseReceipt, type ReceiptParser } from "../receipts/index.js";

/**
 * POST /api/receipts/parse — multipart/form-data com o campo "file".
 * Não grava nada: devolve os dados extraídos para o app pré-preencher a despesa.
 */
export async function receiptRoutes(
  app: FastifyInstance,
  opts: { config: AppConfig; parser: ReceiptParser },
) {
  const { config, parser } = opts;

  await app.register(multipart, {
    limits: { fileSize: config.receipts.maxBytes, files: 1, fields: 5, parts: 6 },
  });

  app.addHook("onRequest", app.authenticate);

  app.post(
    "/receipts/parse",
    { config: { rateLimit: { max: config.receipts.rateLimitPerMinute, timeWindow: "1 minute" } } },
    async (req) => {
      if (!req.isMultipart()) {
        throw new AppError(400, "FILE_REQUIRED", 'Envie o recibo como multipart/form-data no campo "file"');
      }
      const file = await req.file();
      if (!file || file.fieldname !== "file") {
        throw new AppError(400, "FILE_REQUIRED", 'Envie o recibo no campo "file"');
      }

      let data: Buffer;
      try {
        data = await file.toBuffer();
      } catch (err) {
        if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
          const mb = Math.round(config.receipts.maxBytes / 1024 / 1024);
          throw new AppError(413, "PAYLOAD_TOO_LARGE", `Arquivo grande demais (máx. ${mb} MB)`);
        }
        throw err;
      }
      if (data.length === 0) throw new AppError(400, "FILE_REQUIRED", "O arquivo enviado está vazio");

      return parseReceipt(parser, data);
    },
  );
}
