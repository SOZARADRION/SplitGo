import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * URL da API do SplitGo.
 * 1. EXPO_PUBLIC_API_URL, se definido (ex.: produção);
 * 2. senão, o mesmo host do servidor de desenvolvimento do Expo na porta 3333
 *    — funciona no navegador, no emulador e no celular físico na mesma rede.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3333`;
  }
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:3333`;
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;

/** A sessão registra aqui o que fazer quando um token é recusado (401). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Não foi possível conectar ao SplitGo. Verifique sua conexão.");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && opts.token) onUnauthorized?.();
    throw new ApiError(
      res.status,
      data?.error ?? "HTTP_ERROR",
      data?.message ?? `Erro inesperado (${res.status})`,
      data?.issues ?? [],
    );
  }
  return data as T;
}

// ---------- Tipos e chamadas da API ----------

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: User;
}

export interface GroupListItem {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  memberCount: number;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<AuthResponse>("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (name: string, email: string, password: string) =>
    api<AuthResponse>("/api/auth/register", { method: "POST", body: { name, email, password } }),
  me: (token: string) => api<User>("/api/auth/me", { token }),
};

export const groupsApi = {
  list: (token: string) => api<GroupListItem[]>("/api/groups", { token }),
};
