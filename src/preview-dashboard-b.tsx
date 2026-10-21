import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AuthProvider } from "./lib/useAuth";
import DashboardNovo2 from "./pages/DashboardNovo2";
import "./index.css";

// Entrada de PREVIEW — modelo B (quadro operacional).
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
  } catch (e) { console.error("[preview-b] seed falhou:", e); }
  for (const [k, v] of Object.entries(SEED)) localStorage.setItem(k, JSON.stringify(v));
}

seed().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HashRouter>
        <AuthProvider>
          <DashboardNovo2 />
        </AuthProvider>
      </HashRouter>
    </React.StrictMode>
  );
});
