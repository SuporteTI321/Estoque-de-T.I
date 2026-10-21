import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AuthProvider } from "./lib/useAuth";
import DashboardAtual from "./pages/Dashboard";
import "./index.css";

// Entrada de PREVIEW do dashboard ATUAL (para comparar renderização headless).
const SEED: Record<string, any> = {
  estoque_ti_user: {
    id: 1, nome: "Administrador", email: "admin@estoque.local",
    perfil: "admin", loja_id: null, loja_nome: null, ativo: true,
  },
};

async function seed() {
  try {
    const res = await fetch("/preview_dados.json");
    const dados = await res.json();
    for (const [k, v] of Object.entries(dados)) {
      if (k.startsWith("_")) continue;
      localStorage.setItem(k, JSON.stringify(v));
    }
  } catch (e) { console.error("[preview-atual] seed falhou:", e); }
  for (const [k, v] of Object.entries(SEED)) localStorage.setItem(k, JSON.stringify(v));
}

seed().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HashRouter>
        <AuthProvider>
          <DashboardAtual />
        </AuthProvider>
      </HashRouter>
    </React.StrictMode>
  );
});
