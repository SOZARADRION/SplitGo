export interface AppConfig {
  /** Segredo de assinatura do JWT (HS256). Obrigatório em produção, ≥ 32 caracteres. */
  jwtSecret: string;
  /** Validade do token de acesso, ex.: "7d", "12h". */
  jwtExpiresIn: string;
  /** Custo do bcrypt. 12 em produção; os testes usam 4 para rodar rápido. */
  bcryptRounds: number;
  /** Tentativas de login/cadastro por IP por minuto. */
  authRateLimitPerMinute: number;
  /**
   * Quantos proxies à frente da API são confiáveis (ex.: 1 no Render). Com isso
   * o IP do cliente vem do X-Forwarded-For — necessário para o limite de
   * tentativas valer por pessoa, e não para todos juntos. 0 = sem proxy.
   */
  trustProxyHops: number;
  /** Origens web autorizadas (CORS). `true` = qualquer uma (a API usa token, não cookies). */
  corsOrigins: true | string[];
  receipts: {
    /** "claude" = leitura real via API da Anthropic · "mock" = leitura simulada */
    parser: "claude" | "mock";
    model: string;
    /** Tamanho máximo do arquivo enviado, em bytes. */
    maxBytes: number;
    /** Leituras por IP por minuto (cada leitura real tem custo). */
    rateLimitPerMinute: number;
  };
}

const DEV_SECRET = "splitgo-dev-secret-NAO-USE-EM-PRODUCAO-0123456789";

function parseHops(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10) {
    throw new Error("TRUST_PROXY deve ser o número de proxies confiáveis (ex.: 1)");
  }
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProd = env.NODE_ENV === "production";
  const jwtSecret = env.JWT_SECRET ?? (isProd ? "" : DEV_SECRET);
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET ausente ou curto demais (mínimo 32 caracteres)");
  }
  if (!env.JWT_SECRET) {
    console.warn("[SplitGo] JWT_SECRET não definido: usando segredo de desenvolvimento.");
  }
  // Leitor real só quando há credencial; RECEIPT_PARSER força um dos modos.
  const parser = env.RECEIPT_PARSER ?? (env.ANTHROPIC_API_KEY ? "claude" : "mock");
  if (parser !== "claude" && parser !== "mock") {
    throw new Error('RECEIPT_PARSER deve ser "claude" ou "mock"');
  }

  return {
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? "7d",
    bcryptRounds: Number(env.BCRYPT_ROUNDS ?? 12),
    authRateLimitPerMinute: Number(env.AUTH_RATE_LIMIT ?? 10),
    trustProxyHops: parseHops(env.TRUST_PROXY),
    corsOrigins: env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
      : true,
    receipts: {
      parser,
      model: env.RECEIPT_MODEL ?? "claude-opus-5-5",
      maxBytes: Number(env.RECEIPT_MAX_MB ?? 5) * 1024 * 1024,
      rateLimitPerMinute: Number(env.RECEIPT_RATE_LIMIT ?? 20),
    },
  };
}
