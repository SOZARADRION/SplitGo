export interface AppConfig {
  /** Segredo de assinatura do JWT (HS256). Obrigatório em produção, ≥ 32 caracteres. */
  jwtSecret: string;
  /** Validade do token de acesso, ex.: "7d", "12h". */
  jwtExpiresIn: string;
  /** Custo do bcrypt. 12 em produção; os testes usam 4 para rodar rápido. */
  bcryptRounds: number;
  /** Tentativas de login/cadastro por IP por minuto. */
  authRateLimitPerMinute: number;
}

const DEV_SECRET = "splitgo-dev-secret-NAO-USE-EM-PRODUCAO-0123456789";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProd = env.NODE_ENV === "production";
  const jwtSecret = env.JWT_SECRET ?? (isProd ? "" : DEV_SECRET);
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET ausente ou curto demais (mínimo 32 caracteres)");
  }
  if (!env.JWT_SECRET) {
    console.warn("[SplitGo] JWT_SECRET não definido: usando segredo de desenvolvimento.");
  }
  return {
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? "7d",
    bcryptRounds: Number(env.BCRYPT_ROUNDS ?? 12),
    authRateLimitPerMinute: Number(env.AUTH_RATE_LIMIT ?? 10),
  };
}
