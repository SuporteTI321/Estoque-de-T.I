import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import { Package, LogIn } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !senha) {
      setError("Informe o e-mail e a senha para entrar.");
      return;
    }
    setLoading(true);
    try {
      await login(email, senha);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // Mensagens amigáveis para os casos comuns (credenciais inválidas, senha vazia/sem hash etc.)
      if (/credencial|senha|usu[áa]rio|login|n[ãa]o.*(encontrado|cadastrado)/i.test(raw)) {
        setError("E-mail ou senha incorretos. Verifique seus dados e tente novamente.");
      } else {
        setError(raw || "Erro ao entrar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-4">
      <div className="w-full max-w-4xl">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Brand panel */}
          <div className="hidden flex-col justify-between rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-10 text-white shadow-xl lg:flex">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
                  <Package className="h-7 w-7" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Estoque de T.I</h1>
                  <p className="text-sm text-blue-100">Controle de Estoque</p>
                </div>
              </div>
              <div className="mt-16 space-y-4">
                <h2 className="text-3xl font-bold leading-tight">
                  Gestao completa do seu estoque
                </h2>
                <p className="text-blue-100">
                  Controle estoque, solicitações, pedidos e transferências em um só lugar.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-blue-50">
                  <li className="flex items-center gap-2">• Dashboard em tempo real</li>
                  <li className="flex items-center gap-2">• Alertas automáticos de estoque</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-blue-200">Tauri + React + SQLite</p>
          </div>

          {/* Login form */}
          <div className="rounded-2xl bg-white p-8 shadow-xl">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Package className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Estoque de T.I</h1>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Entrar</h2>
            <p className="mt-1 text-sm text-gray-500">Acesse sua conta para continuar</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="admin@empresa.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Senha</label>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
