import { useEffect, useState, useRef } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/useAuth";
import { syncAllFromBackend } from "./lib/api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Entradas from "./pages/Entradas";
import SaidaRegistro from "./pages/SaidaRegistro";
import Inventario from "./pages/Inventario";
import Categorias from "./pages/Categorias";
import Produtos from "./pages/Produtos";
import Relatorios from "./pages/Relatorios";
import Etiquetas from "./pages/Etiquetas";
import Configuracoes from "./pages/Configuracoes";
import Usuarios from "./pages/Usuarios";
import Perfil from "./pages/Perfil";
import Sincronizacao from "./pages/Sincronizacao";

function Bootstrap() {
  const [ready, setReady] = useState(false);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    // Sync bloqueante na inicialização
    syncAllFromBackend().finally(() => setReady(true));
  }, []);

  // Auto-sync periódico — atualiza todas as janelas a cada 30s
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(syncAllFromBackend, 30000);
    return () => clearInterval(interval);
  }, [ready]);

  // Backup automático — salva todos os dados do localStorage no servidor a cada 5 min
  useEffect(() => {
    if (!ready) return;
    const backup = () => {
      const dados: Record<string, any> = {};
      const chaves = [
        "almox_produtos", "almox_movimentacoes", "almox_pedidos",
        "almox_pedido_itens", "almox_lojas", "almox_categorias",
        "almox_usuarios", "almox_solicitacoes", "almox_alertas",
      ];
      for (const chave of chaves) {
        try {
          const raw = localStorage.getItem(chave);
          if (raw) dados[chave] = JSON.parse(raw);
        } catch {}
      }
      if (Object.keys(dados).length > 0) {
        fetch("/api/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados),
        }).catch(() => {});
      }
    };
    backup(); // executa já na inicialização
    const interval = setInterval(backup, 5 * 60 * 1000); // depois a cada 5 min
    return () => clearInterval(interval);
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Inicializando sistema...
      </div>
    );
  }
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [user, loading, navigate]);

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500">Carregando...</div>;
  if (!user) return null;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/entradas" element={<ProtectedRoute><Entradas /></ProtectedRoute>} />
      <Route path="/saida-registro" element={<ProtectedRoute><SaidaRegistro /></ProtectedRoute>} />
            <Route path="/inventario" element={<ProtectedRoute><Inventario /></ProtectedRoute>} />
      <Route path="/categorias" element={<ProtectedRoute><Categorias /></ProtectedRoute>} />
      <Route path="/produtos" element={<ProtectedRoute><Produtos /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
      <Route path="/etiquetas" element={<ProtectedRoute><Etiquetas /></ProtectedRoute>} />
      <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
      <Route path="/configuracoes" element={<ProtectedRoute><Configuracoes /></ProtectedRoute>} />
      <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
      <Route path="/sincronizacao" element={<ProtectedRoute><Sincronizacao /></ProtectedRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Bootstrap />
      <AppRoutes />
    </AuthProvider>
  );
}
