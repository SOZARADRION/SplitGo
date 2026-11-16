import Anthropic from "@anthropic-ai/sdk";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeReceiptParser, type ReceiptLlmClient } from "../src/receipts/claude-parser.js";
import { decimalToCents, normalizeDate, sniffMediaType, toParsedReceipt } from "../src/receipts/normalize.js";
import type { Extraction, ReceiptFile, ReceiptParser } from "../src/receipts/types.js";
import { createTestApp, registerUser, type TestUser } from "./helpers.js";

// ---------- Amostras ----------

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PDF = Buffer.from("%PDF-1.7\n%...\n");

function multipart(file: Buffer, { field = "file", filename = "recibo.png", type = "image/png" } = {}) {
  const boundary = "----splitgo-test-boundary";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
      `Content-Type: ${type}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, file, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

const sample: Extraction = {
  e_recibo: true,
  estabelecimento: " Bar do Zé ",
  data: "2026-11-10",
  valor_total: "55.00",
  itens: [
    { descricao: "Porção de fritas", quantidade: 1, valor_unitario: "35.00", valor_total_item: "35.00" },
    { descricao: "Refrigerante", quantidade: 2, valor_unitario: "10,00", valor_total_item: "20.00" },
  ],
};

class FixedParser implements ReceiptParser {
  readonly source = "claude" as const;
  calls: ReceiptFile[] = [];
  constructor(private readonly result: Extraction) {}
  async extract(file: ReceiptFile) {
    this.calls.push(file);
    return structuredClone(this.result);
  }
}

// ---------- Normalização ----------

describe("normalização", () => {
  it("converte texto decimal para centavos sem ponto flutuante", () => {
    expect(decimalToCents("12.90")).toBe(1290);
    expect(decimalToCents("12,9")).toBe(1290);
    expect(decimalToCents("R$ 0.05")).toBe(5);
    expect(decimalToCents("1234")).toBe(123400);
    expect(decimalToCents("0.1")).toBe(10);
    for (const bad of ["", "abc", "1.234,56", "-5.00", "12.345", null]) {
      expect(decimalToCents(bad), String(bad)).toBeNull();
    }
  });

  it("aceita só datas reais", () => {
    expect(normalizeDate("2026-02-28")).toBe("2026-02-28");
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(normalizeDate("10/11/2026")).toBeNull();
  });

  it("identifica o formato pelos bytes", () => {
    expect(sniffMediaType(PNG)).toBe("image/png");
    expect(sniffMediaType(JPEG)).toBe("image/jpeg");
    expect(sniffMediaType(PDF)).toBe("application/pdf");
    expect(sniffMediaType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffMediaType(Buffer.from("GIF89a...."))).toBe("image/gif");
    expect(sniffMediaType(Buffer.from("texto qualquer"))).toBeNull();
  });

  it("gera resposta em centavos e sem avisos quando tudo fecha", () => {
    const r = toParsedReceipt(sample, "claude");
    expect(r).toEqual({
      estabelecimento: "Bar do Zé",
      data: "2026-11-10",
      valor_total: 5500,
      itens: [
        { descricao: "Porção de fritas", quantidade: 1, valor_unitario: 3500, valor_total_item: 3500 },
        { descricao: "Refrigerante", quantidade: 2, valor_unitario: 1000, valor_total_item: 2000 },
      ],
      fonte: "claude",
      avisos: [],
    });
  });

  it("avisa quando os itens não fecham com o total e descarta item ilegível", () => {
    const r = toParsedReceipt(
      {
        ...sample,
        valor_total: "60.50",
        data: "31/02/2026",
        itens: [...sample.itens, { descricao: "???", quantidade: 1, valor_unitario: "x", valor_total_item: "x" }],
      },
      "claude",
    );
    expect(r.itens).toHaveLength(2);
    expect(r.data).toBeNull();
    expect(r.avisos.join(" | ")).toMatch(/Item 3 ignorado/);
    expect(r.avisos.join(" | ")).toMatch(/difere do total/);
    expect(r.avisos.join(" | ")).toMatch(/Data ilegível/);
  });
});

// ---------- Rota ----------

describe("POST /api/receipts/parse", () => {
  let app: FastifyInstance;
  let close: () => Promise<void>;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, close } = await createTestApp({}));
    user = await registerUser(app);
  });
  afterAll(() => close());

  const post = (body: ReturnType<typeof multipart>, headers: Record<string, string> = user.headers) =>
    app.inject({
      method: "POST",
      url: "/api/receipts/parse",
      payload: body.payload,
      headers: { ...body.headers, ...headers },
    });

  it("exige login", async () => {
    const res = await post(multipart(PNG), {});
    expect(res.statusCode).toBe(401);
  });

  it("no modo simulado devolve um recibo de exemplo, sempre o mesmo para a mesma imagem", async () => {
    const a = await post(multipart(PNG));
    const b = await post(multipart(PNG));
    expect(a.statusCode, a.body).toBe(200);
    const body = a.json();
    expect(body.fonte).toBe("simulado");
    expect(body.avisos[0]).toMatch(/Leitura simulada/);
    expect(body.itens.length).toBeGreaterThan(0);
    expect(Number.isInteger(body.valor_total)).toBe(true);
    expect(b.json()).toEqual(body);
  });

  it("recusa arquivo que não é imagem nem PDF, mesmo com Content-Type de imagem", async () => {
    const res = await post(multipart(Buffer.from("isto não é uma imagem"), { type: "image/jpeg" }));
    expect(res.statusCode).toBe(415);
    expect(res.json().error).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("exige o campo file e corpo multipart", async () => {
    const wrongField = await post(multipart(PNG, { field: "foto" }));
    expect(wrongField.statusCode).toBe(400);
    const json = await app.inject({
      method: "POST",
      url: "/api/receipts/parse",
      headers: user.headers,
      payload: { file: "base64..." },
    });
    expect(json.statusCode).toBe(400);
    expect(json.json().error).toBe("FILE_REQUIRED");
  });

  it("recusa arquivo acima do limite com 413", async () => {
    const small = await createTestApp({
      receipts: { parser: "mock", model: "x", maxBytes: 1024, rateLimitPerMinute: 1000 },
    });
    try {
      const u = await registerUser(small.app);
      const big = multipart(Buffer.concat([PNG, Buffer.alloc(4096)]));
      const res = await small.app.inject({
        method: "POST",
        url: "/api/receipts/parse",
        payload: big.payload,
        headers: { ...big.headers, ...u.headers },
      });
      expect(res.statusCode).toBe(413);
      expect(res.json().error).toBe("PAYLOAD_TOO_LARGE");
    } finally {
      await small.close();
    }
  });

  it("repassa ao leitor o formato detectado e responde 422 quando não é recibo", async () => {
    const parser = new FixedParser({ ...sample, e_recibo: false });
    const t = await createTestApp({}, { receiptParser: parser });
    try {
      const u = await registerUser(t.app);
      const body = multipart(PDF, { filename: "nota.pdf", type: "application/pdf" });
      const res = await t.app.inject({
        method: "POST",
        url: "/api/receipts/parse",
        payload: body.payload,
        headers: { ...body.headers, ...u.headers },
      });
      expect(parser.calls[0].mediaType).toBe("application/pdf");
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("NOT_A_RECEIPT");
    } finally {
      await t.close();
    }
  });
});

// ---------- Leitor Claude (cliente falso: nenhuma chamada paga) ----------

type ParseArgs = Parameters<ReceiptLlmClient["beta"]["messages"]["parse"]>[0];

function fakeClient(response: object | Error) {
  const calls: ParseArgs[] = [];
  const client = {
    beta: {
      messages: {
        parse: async (args: ParseArgs) => {
          calls.push(args);
          if (response instanceof Error) throw response;
          return response;
        },
      },
    },
  } as unknown as ReceiptLlmClient;
  return { client, calls };
}

describe("ClaudeReceiptParser", () => {
  const ok = { stop_reason: "end_turn", parsed_output: sample };

  it("envia imagem em base64 com saída estruturada e fallback de recusa", async () => {
    const { client, calls } = fakeClient(ok);
    const result = await new ClaudeReceiptParser(client).extract({ data: JPEG, mediaType: "image/jpeg" });
    expect(result).toEqual(sample);

    const req = calls[0] as unknown as Record<string, any>;
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.thinking).toBeUndefined(); // Opus 5.5: pensamento adaptativo por padrão
    const [media, text] = req.messages[0].content;
    expect(media).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: JPEG.toString("base64") },
    });
    expect(text.type).toBe("text");
  });

  it("envia PDF como documento", async () => {
    const { client, calls } = fakeClient(ok);
    await new ClaudeReceiptParser(client).extract({ data: PDF, mediaType: "application/pdf" });
    const media = (calls[0] as unknown as Record<string, any>).messages[0].content[0];
    expect(media.type).toBe("document");
    expect(media.source.media_type).toBe("application/pdf");
  });

  it("trata recusa, resposta incompleta e erros da API", async () => {
    const run = (response: object | Error) =>
      new ClaudeReceiptParser(fakeClient(response).client).extract({ data: PNG, mediaType: "image/png" });

    await expect(run({ stop_reason: "refusal", parsed_output: null })).rejects.toMatchObject({
      statusCode: 422,
      code: "RECEIPT_REFUSED",
    });
    await expect(run({ stop_reason: "max_tokens", parsed_output: null })).rejects.toMatchObject({
      statusCode: 502,
    });
    await expect(
      run(new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers())),
    ).rejects.toMatchObject({ statusCode: 503, code: "RECEIPT_SERVICE_BUSY" });
    await expect(
      run(new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers())),
    ).rejects.toMatchObject({ statusCode: 503, code: "RECEIPT_SERVICE_UNAVAILABLE" });
  });
});
