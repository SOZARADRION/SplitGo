import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, authApi, setUnauthorizedHandler, type AuthResponse, type User } from "@/lib/api";
import { getItem, removeItem, setItem } from "@/lib/secure-storage";

const STORAGE_KEY = "splitgo.session";

interface StoredSession {
  token: string;
  user: User;
}

interface SessionContextValue {
  /** true enquanto lê o token salvo e o valida na API */
  isLoading: boolean;
  session: StoredSession | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error("useSession deve ser usado dentro de <SessionProvider>");
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<StoredSession | null>(null);

  const signOut = useCallback(async () => {
    setSession(null);
    await removeItem(STORAGE_KEY);
  }, []);

  const persist = useCallback(async ({ token, user }: AuthResponse) => {
    const next = { token, user };
    await setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  // Ao abrir o app: recupera a sessão salva e confirma com a API.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await getItem(STORAGE_KEY);
        const stored: StoredSession | null = raw ? JSON.parse(raw) : null;
        if (!stored?.token) return;
        try {
          const user = await authApi.me(stored.token);
          if (!cancelled) setSession({ token: stored.token, user });
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            await removeItem(STORAGE_KEY); // token expirado ou inválido
          } else if (!cancelled) {
            setSession(stored); // sem conexão: segue com os dados salvos
          }
        }
      } catch {
        await removeItem(STORAGE_KEY); // conteúdo corrompido
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Qualquer 401 da API com token encerra a sessão → volta para o login.
  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo<SessionContextValue>(
    () => ({
      isLoading,
      session,
      signIn: async (email, password) => persist(await authApi.login(email.trim(), password)),
      signUp: async (name, email, password) =>
        persist(await authApi.register(name.trim(), email.trim(), password)),
      signOut,
    }),
    [isLoading, session, persist, signOut],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
