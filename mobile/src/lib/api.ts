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
  opts: { method?: string; body?: unknown; form?: FormData; token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  // Com FormData o fetch define o content-type (com o boundary) sozinho.
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
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

export interface Member {
  id: string;
  groupId: string;
  userId: string | null;
  name: string;
  email: string | null;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  members: Member[];
}

export interface Expense {
  id: string;
  description: string;
  amountCents: number;
  splitType: "EQUAL" | "EXACT" | "PERCENT" | "SHARES";
  paidByMemberId: string;
  occurredAt: string;
  shares: { memberId: string; amountCents: number }[];
}

export interface MemberBalance {
  memberId: string;
  name: string;
  paidCents: number;
  shareCents: number;
  sentCents: number;
  receivedCents: number;
  /** > 0 recebe · < 0 deve */
  balanceCents: number;
}

export interface Transfer {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amountCents: number;
}

export interface GroupSummary {
  groupId: string;
  groupName: string;
  currency: string;
  totalSpentCents: number;
  members: MemberBalance[];
  transfers: Transfer[];
}

export type SplitInput =
  | { type: "EQUAL"; memberIds: string[] }
  | { type: "EXACT"; shares: { memberId: string; amountCents: number }[] };

export interface NewExpense {
  description: string;
  amountCents: number;
  paidByMemberId: string;
  occurredAt?: string;
  split: SplitInput;
}

export const groupsApi = {
  list: (token: string) => api<GroupListItem[]>("/api/groups", { token }),
  create: (token: string, body: { name: string; members: { name: string; email?: string | null }[] }) =>
    api<Group>("/api/groups", { method: "POST", body, token }),
  get: (token: string, groupId: string) => api<Group>(`/api/groups/${groupId}`, { token }),
  summary: (token: string, groupId: string) => api<GroupSummary>(`/api/groups/${groupId}/summary`, { token }),
  addMember: (token: string, groupId: string, body: { name: string; email?: string | null }) =>
    api<Member>(`/api/groups/${groupId}/members`, { method: "POST", body, token }),
  expenses: (token: string, groupId: string) => api<Expense[]>(`/api/groups/${groupId}/expenses`, { token }),
  createExpense: (token: string, groupId: string, body: NewExpense) =>
    api<Expense>(`/api/groups/${groupId}/expenses`, { method: "POST", body, token }),
  deleteExpense: (token: string, groupId: string, expenseId: string) =>
    api<void>(`/api/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE", token }),
  settle: (token: string, groupId: string, t: { fromMemberId: string; toMemberId: string; amountCents: number }) =>
    api<unknown>(`/api/groups/${groupId}/settlements`, { method: "POST", body: t, token }),
};

/** Mensagem amigável para qualquer erro vindo da API ou da rede. */
export function errorMessage(err: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (err instanceof ApiError) return err.issues[0]?.message ? `${err.message}: ${err.issues[0].message}` : err.message;
  return fallback;
}

/** Resultado da leitura de recibo. Valores em centavos. */
export interface ParsedReceipt {
  estabelecimento: string | null;
  data: string | null; // AAAA-MM-DD
  valor_total: number | null;
  itens: { descricao: string; quantidade: number; valor_unitario: number; valor_total_item: number }[];
  fonte: "claude" | "simulado";
  avisos: string[];
}

export const receiptsApi = {
  /**
   * Envia a foto/PDF do recibo (ex.: `uri` vindo do expo-image-picker ou da câmera).
   * No celular o arquivo vai como { uri, name, type }; na web, como Blob.
   */
  parse: async (token: string, file: { uri: string; name?: string; mimeType?: string }) => {
    const name = file.name ?? "recibo.jpg";
    const type = file.mimeType ?? "image/jpeg";
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(file.uri)).blob();
      form.append("file", blob, name);
    } else {
      // Formato aceito pelo FormData do React Native.
      form.append("file", { uri: file.uri, name, type } as unknown as Blob);
    }
    return api<ParsedReceipt>("/api/receipts/parse", { method: "POST", form, token });
  },
};
