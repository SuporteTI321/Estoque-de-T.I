import { useEffect, useState, useCallback } from "react";
import {
  Package, Boxes, AlertTriangle, AlertCircle,
  TrendingUp, TrendingDown, ShoppingCart, Truck,
} from "lucide-react";
import Layout from "../components/Layout";
import type { DashboardStats, Alerta, Movimentacao, Produto } from "../lib/types";
import { api } from "../lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);

  const carregarDados = useCallback(() => {
    setLoading(true);
    const carregarMovs = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const dados = await invoke<Movimentacao[]>("list_movimentacoes", {});
        if (Array.isArray(dados) && dados.length > 0) {
          localStorage.setItem("almox_movimentacoes", JSON.stringify(dados));
          return dados;
        }
      } catch {}
      localStorage.removeItem("almox_movimentacoes");
      return [];
    };
    Promise.all([api.dashboardStats(), api.alertas.list(), carregarMovs(), api.produtos.list()])
      .then(([s, al, movs, prods]) => {
        setStats(s);
        setAlertas(al);
        if (movs.length === 0) {
          localStorage.removeItem("almox_movimentacoes");
        } else {
          localStorage.setItem("almox_movimentacoes", JSON.stringify(movs));
        }
        setMovimentacoes(movs);
        setProdutos(prods);
      })
      .catch(() => { setStats(null); setAlertas([]); setMovimentacoes([]); setProdutos([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregarDados();
    window.addEventListener("focus", carregarDados);
    const interval = setInterval(carregarDados, 30000);
    return () => { window.removeEventListener("focus", carregarDados); clearInterval(interval); };
  }, [carregarDados]);

  const totalProdutos = stats?.total_produtos ?? 0;
  const itensEstoque = stats?.itens_estoque ?? 0;
  const estoqueBaixo = stats?.estoque_baixo ?? 0;
  const indisponiveis = stats?.itens_indisponiveis ?? 0;
  const entradasMes = stats?.entradas_mes ?? 0;
  const saidasMes = stats?.saidas_mes ?? 0;

  const entradas = movimentacoes.filter(m => m.tipo === "entrada");
  const saidas = movimentacoes.filter(m => m.tipo === "saida");
  const totalEntradas = entradas.reduce((s, m) => s + m.quantidade, 0);
  const totalSaidas = saidas.reduce((s, m) => s + m.quantidade, 0);

  return (
    <Layout title="Dashboard" subtitle="Visão geral do estoque">
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
        {/* Donut Estoque */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Distribuição do Estoque</h3>
          <p className="text-[11px] text-gray-400 mb-4">Status geral dos produtos</p>
          <div className="flex flex-col items-center">
            <DonutChart
              data={[
                { label: "Disponíveis", value: itensEstoque, color: "#10b981" },
                { label: "Estoque Baixo", value: estoqueBaixo, color: "#f59e0b" },
                { label: "Sem Estoque", value: indisponiveis, color: "#ef4444" },
              ]}
              centerLabel="Total"
              centerValue={totalProdutos.toLocaleString("pt-BR")}
            />
            <div className="mt-4 w-full space-y-2">
              <Legend color="#10b981" label="Disponíveis" value={`${itensEstoque} (${totalProdutos > 0 ? Math.round((itensEstoque / totalProdutos) * 100) : 0}%)`} />
              <Legend color="#f59e0b" label="Estoque Baixo" value={`${estoqueBaixo} (${totalProdutos > 0 ? Math.round((estoqueBaixo / totalProdutos) * 100) : 0}%)`} />
              <Legend color="#ef4444" label="Sem Estoque" value={`${indisponiveis} (${totalProdutos > 0 ? Math.round((indisponiveis / totalProdutos) * 100) : 0}%)`} />
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

function DonutChart({ data, centerLabel, centerValue }: {
  data: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 58;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width="170" height="170" viewBox="0 0 170 170">
      <g transform="translate(85,85) rotate(-90)">
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const seg = (
            <circle
              key={i}
              r={r}
              fill="transparent"
              stroke={d.color}
              strokeWidth={26}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += len;
          return seg;
        })}
      </g>
      <text x="85" y="81" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 10 }}>{centerLabel}</text>
      <text x="85" y="100" textAnchor="middle" className="fill-gray-900" style={{ fontSize: 18, fontWeight: 700 }}>{centerValue}</text>
    </svg>
  );
}
