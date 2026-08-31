import { useEffect, useState, useCallback } from "react";
import {
  Package, Boxes, AlertTriangle, AlertCircle,
  TrendingUp, TrendingDown, ShoppingCart, Truck,
} from "lucide-react";
import Layout from "../components/Layout";
import type { DashboardStats, Movimentacao, Produto } from "../lib/types";
import { api } from "../lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarMovs = async (): Promise<Movimentacao[]> => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const dados = await invoke<Movimentacao[]>("list_movimentacoes", {});
      if (Array.isArray(dados)) return dados;
    } catch (e) { console.warn("[Dashboard] carregarMovs fallback:", e); }
    return [];
  };

  // mostrarLoading só no mount inicial; no intervalo/focus atualiza sem flicker.
  const carregarDados = useCallback(async (mostrarLoading: boolean = false) => {
    if (mostrarLoading) setLoading(true);
    try {
      const [s, , movs, prods] = await Promise.all([api.dashboardStats(), api.alertas.list(), carregarMovs(), api.produtos.list()]);
      setStats(s);
      setMovimentacoes(movs);
      setProdutos(prods);
      // Persistência centralizada (uma única escrita por ciclo)
      if (movs.length === 0) {
        localStorage.removeItem("almox_movimentacoes");
      } else {
        localStorage.setItem("almox_movimentacoes", JSON.stringify(movs));
      }
      setErro(null);
    } catch (e) {
      console.error("[Dashboard] falha ao carregar dados:", e);
      setErro("Não foi possível carregar os dados do dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados(true);
    const onFocus = () => carregarDados();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(onFocus, 30000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(interval); };
  }, [carregarDados]);

  const totalProdutos = stats?.total_produtos ?? 0;
  const itensEstoque = stats?.itens_estoque ?? 0;
  const estoqueBaixo = stats?.estoque_baixo ?? 0;
  const indisponiveis = stats?.itens_indisponiveis ?? 0;
  const entradasMes = stats?.entradas_mes ?? 0;
  const saidasMes = stats?.saidas_mes ?? 0;

  const entradas = movimentacoes.filter(m => m.tipo === "entrada");
  const saidas = movimentacoes.filter(m => m.tipo === "saida");

  // Donut: contagem uniforme de PRODUTOS (não mistura com soma de unidades).
  // Mesmas definições dos StatCards: disponível = estoque > mínimo; baixo = 0 < estoque <= mínimo; sem = estoque <= 0.
  const dispCount = produtos.filter(p => (p.estoque || 0) > (p.estoque_minimo || 0)).length;
  const baixoCount = produtos.filter(p => { const e = p.estoque || 0; return e > 0 && e <= (p.estoque_minimo || 0); }).length;
  const semEstoqueCount = produtos.filter(p => (p.estoque || 0) <= 0).length;
  const totalDonut = dispCount + baixoCount + semEstoqueCount;

  return (
    <Layout title="Dashboard" subtitle="Visão geral do estoque">
      {erro && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">{erro}</div>}
      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<Package className="h-5 w-5" />}
          iconBg="bg-blue-100 text-blue-600"
          label="Total de Produtos"
          value={loading ? "—" : totalProdutos.toLocaleString("pt-BR")}
          sub="cadastrados"
        />
        <KpiCard
          icon={<Boxes className="h-5 w-5" />}
          iconBg="bg-emerald-100 text-emerald-600"
          label="Em Estoque"
          value={loading ? "—" : itensEstoque.toLocaleString("pt-BR")}
          sub="unidades"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          iconBg="bg-amber-100 text-amber-600"
          label="Estoque Baixo"
          value={loading ? "—" : String(estoqueBaixo)}
          sub="abaixo do mínimo"
          alert={estoqueBaixo > 0}
        />
        <KpiCard
          icon={<AlertCircle className="h-5 w-5" />}
          iconBg="bg-red-100 text-red-600"
          label="Sem Estoque"
          value={loading ? "—" : String(indisponiveis)}
          sub="indisponíveis"
          alert={indisponiveis > 0}
        />
      </div>

      {/* Row: Entradas/Saídas */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ResumoCard
          icon={<Truck className="h-5 w-5" />}
          iconBg="bg-blue-100 text-blue-600"
          titulo="Entradas do Mês"
          valor={entradasMes.toLocaleString("pt-BR")}
          sub={`${entradas.length} movimentações`}
        />
        <ResumoCard
          icon={<ShoppingCart className="h-5 w-5" />}
          iconBg="bg-violet-100 text-violet-600"
          titulo="Saídas do Mês"
          valor={saidasMes.toLocaleString("pt-BR")}
          sub={`${saidas.length} movimentações`}
        />
      </div>

      {/* Row: Donut + Categorias */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Grafico Estoque */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Distribuição do Estoque</h3>
          <p className="text-[11px] text-gray-400 mb-4">Status geral dos produtos</p>
          <div className="space-y-4">
            <BarChart
              data={[
                { label: "Disponíveis", value: dispCount, color: "bg-emerald-500" },
                { label: "Estoque Baixo", value: baixoCount, color: "bg-amber-500" },
                { label: "Sem Estoque", value: semEstoqueCount, color: "bg-red-500" },
              ]}
            />
            <div className="mt-4 w-full space-y-2">
              <Legend color="#10b981" label="Disponíveis" value={`${dispCount} (${totalDonut > 0 ? Math.round((dispCount / totalDonut) * 100) : 0}%)`} />
              <Legend color="#f59e0b" label="Estoque Baixo" value={`${baixoCount} (${totalDonut > 0 ? Math.round((baixoCount / totalDonut) * 100) : 0}%)`} />
              <Legend color="#ef4444" label="Sem Estoque" value={`${semEstoqueCount} (${totalDonut > 0 ? Math.round((semEstoqueCount / totalDonut) * 100) : 0}%)`} />
            </div>
          </div>
        </div>

        {/* Estoque por Categoria */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Estoque por Categoria</h3>
          <p className="text-[11px] text-gray-400 mb-4">Distribuição de unidades por categoria</p>
          <div className="space-y-3">
            {(() => {
              const cats: Record<string, number> = {};
              for (const p of produtos) {
                const nome = p.categoria_nome || "Sem categoria";
                cats[nome] = (cats[nome] || 0) + (p.estoque || 0);
              }
              const entries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
              const maxVal = Math.max(...entries.map(e => e[1]), 1);
              const cores = [
                "from-blue-500 to-blue-400",
                "from-emerald-500 to-emerald-400",
                "from-amber-500 to-amber-400",
                "from-violet-500 to-violet-400",
                "from-pink-500 to-pink-400",
                "from-orange-500 to-orange-400",
                "from-cyan-500 to-cyan-400",
                "from-red-500 to-red-400",
                "from-indigo-500 to-indigo-400",
                "from-teal-500 to-teal-400",
              ];
              if (entries.length === 0) return <div className="text-center text-xs text-gray-400 py-4">Nenhuma categoria</div>;
              return entries.slice(0, 8).map(([nome, value], i) => (
                <div key={nome}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700 truncate">{nome}</span>
                    <span className="text-gray-500 font-mono ml-2">{value}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${cores[i % cores.length]} transition-all duration-500`}
                      style={{ width: `${(value / maxVal) * 100}%` }} />
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {/* Row: Últimas Movimentações */}
      <div className="grid grid-cols-1 gap-3">
        {/* Últimas Movimentações */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Últimas Movimentações</h3>
          <p className="text-[11px] text-gray-400 mb-3">Entradas e saídas recentes</p>
          <div className="space-y-2">
            {movimentacoes.length === 0 && (
              <div className="text-center text-xs text-gray-400 py-4">Nenhuma movimentação</div>
            )}
            {movimentacoes.slice(0, 8).map((m, i) => (
              <div key={m.id || i} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                m.tipo === "entrada"
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-blue-200 bg-blue-50/50"
              }`}>
                {m.tipo === "entrada"
                  ? <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                  : <TrendingDown className="h-4 w-4 text-blue-600 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate">
                    {m.produto_nome || `Produto #${m.produto_id}`}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {m.tipo === "entrada" ? "Entrada" : "Saída"} • {m.quantidade} un.
                    {m.loja_origem_nome && ` • ${m.loja_origem_nome}`}
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                  {m.data_movimento ? new Date(m.data_movimento).toLocaleDateString("pt-BR") : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

// ============================================================================
//  Sub-components
// ============================================================================

function KpiCard({ icon, iconBg, label, value, sub, alert }: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 transition hover:shadow-sm ${
      alert ? "border-amber-300 shadow-amber-100" : "border-gray-200"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-gray-500 truncate">{label}</div>
          <div className="text-xl font-bold text-gray-900 leading-tight">{value}</div>
          <div className="text-[10px] text-gray-400">{sub}</div>
        </div>
      </div>
    </div>
  );
}

function ResumoCard({ icon, iconBg, titulo, valor, sub }: {
  icon: React.ReactNode;
  iconBg: string;
  titulo: string;
  valor: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div>
          <div className="text-[11px] text-gray-500">{titulo}</div>
          <div className="text-lg font-bold text-gray-900">{valor}</div>
          <div className="text-[10px] text-gray-400">{sub}</div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs text-gray-600">{label}</span>
      </span>
      <span className="text-xs font-semibold text-gray-700">{value}</span>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-gray-700">{d.label}</span>
            <span className="text-gray-500 font-mono">{d.value}</span>
          </div>
          <div className="h-6 w-full rounded-lg bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-lg ${d.color} transition-all duration-700 ease-out flex items-center justify-end pr-2`}
              style={{ width: `${d.value > 0 ? Math.max((d.value / maxValue) * 100, 8) : 0}%` }}>
              {d.value > 0 && <span className="text-[10px] font-bold text-white">{d.value}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
