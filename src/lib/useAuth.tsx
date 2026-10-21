import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { Usuario } from "./types";
import { api } from "./api";
import { clearAuthToken } from "./cloudDb";
import { sanitizeUserForStorage, SECURITY_CONSTANTS } from "./security";

interface AuthContextType {
  user: Usuario | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<Usuario>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "estoque_ti_user";
/** Sessao local: { session_id, login_em }. O login_em e o inicio da sessao. */
const SESSION_KEY = "estoque_ti_sessao";

type SessaoSalva = { session_id?: string | null; login_em: number };

function lerSessao(): SessaoSalva | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessaoSalva) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const sessao = lerSessao();

        // 1) Timeout de 8h — vale para desktop e web.
        //    Sem isso a sessao do localStorage nunca expirava.
        if (sessao && Date.now() - sessao.login_em > SECURITY_CONSTANTS.SESSION_TIMEOUT_MS) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(SESSION_KEY);
          setLoading(false);
          return;
        }

        // 2) No desktop, o backend decide se a sessao ainda vale.
        //    Pode ter sido invalidada por um logout em outra aba/sessao.
        if (sessao?.session_id) {
          const ok = await api.usuarios.validarSessao(sessao.session_id).catch(() => true);
          if (!ok) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(SESSION_KEY);
            setLoading(false);
            return;
          }
        }

        if (raw) setUser(JSON.parse(raw));
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function login(email: string, senha: string) {
    const u = await api.usuarios.login(email, senha);
    // Remove senha antes de persistir — defense in depth (sanitizacao centralizada)
    const safe = sanitizeUserForStorage(u);
    setUser(safe);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ session_id: safe.session_id ?? null, login_em: Date.now() })
    );
    return safe;
  }

  function logout() {
    // Encerra a sessao no backend (invalida o id e limpa as expiradas).
    const sessao = lerSessao();
    if (sessao?.session_id) {
      api.usuarios.logout(sessao.session_id).catch(() => {});
    }
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    clearAuthToken();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser dentro de AuthProvider");
  return ctx;
}
