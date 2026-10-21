import { useEffect, useState, useCallback } from "react";
import {
  Package, Boxes, AlertTriangle, AlertCircle,
  TrendingUp, TrendingDown, ShoppingCart, Truck,
  Layers, PieChart as PieIcon,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import Layout from "../components/Layout";
import type { DashboardStats, Movimentacao, Produto } from "../lib/types";
import { api } from "../lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // mostrarLoading só no mount inicial; no intervalo/focus atualiza sem flicker.
  const carregarDados = useCallback(async (mostrarLoading: boolean = false) => {
    if (mostrarLoading) setLoading(true);
    try {
      const [s, movs, prods] = await Promise.all([api.dashboardStats(), api.movimentacoes.list(), api.produtos.list()]);
      setStats(s);
      setMovimentacoes(movs);
      setProdutos(prods);
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
  // Vem do backend (dashboard_stats) — mesma fonte dos StatCards, para card e
  // rosca nunca discordarem. Definições: disponivel = estoque > minimo;
  // baixo = 0 < estoque <= minimo; sem = estoque <= 0.
  const dispCount = stats?.disponiveis ?? 0;
  const baixoCount = estoqueBaixo;
  const semEstoqueCount = indisponiveis;
  const totalDonut = dispCount + baixoCount + semEstoqueCount;

  return (
    <Layout title="Dashboard" subtitle="Visão geral do estoque">
      {erro && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">{erro}</div>}
      {/* 6 Cards na mesma linha — calibrados */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 auto-rows-fr items-stretch">
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

      {/* Row: Gráficos + Últimas Movimentações */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Distribuição do Estoque — Donut Moderno */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><PieIcon className="h-4 w-4 text-violet-600" />Distribuição do Estoque</h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{totalDonut} produtos</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Disponível • Baixo • Zerado</p>
          <div className="relative h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Disponíveis", value: dispCount, color: "#10b981" },
                    { name: "Estoque Baixo", value: baixoCount, color: "#f59e0b" },
                    { name: "Sem Estoque", value: semEstoqueCount, color: "#ef4444" },
                  ].filter(d=>d.value>0)}
                  cx="50%" cy="50%" innerRadius={62} outerRadius={88} paddingAngle={3} dataKey="value" stroke="#fff" strokeWidth={2}
                >
                  {["#10b981","#f59e0b","#ef4444"].map((c,i)=><Cell key={i} fill={c} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-gray-900">{totalDonut}</span>
              <span className="text-[10px] uppercase tracking-widest text-gray-400">produtos</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 text-center">
              <div className="h-2 w-2 rounded-full bg-emerald-500 mx-auto mb-1" />
              <div className="text-[10px] text-emerald-700 font-semibold">Disponíveis</div>
              <div className="text-sm font-bold text-emerald-700">{dispCount}</div>
              <div className="text-[10px] text-emerald-600">{totalDonut>0?Math.round(dispCount/totalDonut*100):0}%</div>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-2.5 text-center">
              <div className="h-2 w-2 rounded-full bg-amber-500 mx-auto mb-1" />
              <div className="text-[10px] text-amber-700 font-semibold">Baixo</div>
              <div className="text-sm font-bold text-amber-700">{baixoCount}</div>
              <div className="text-[10px] text-amber-600">{totalDonut>0?Math.round(baixoCount/totalDonut*100):0}%</div>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-100 p-2.5 text-center">
              <div className="h-2 w-2 rounded-full bg-red-500 mx-auto mb-1" />
              <div className="text-[10px] text-red-700 font-semibold">Zerado</div>
              <div className="text-sm font-bold text-red-700">{semEstoqueCount}</div>
              <div className="text-[10px] text-red-600">{totalDonut>0?Math.round(semEstoqueCount/totalDonut*100):0}%</div>
            </div>
          </div>
        </div>

        {/* Estoque por Categoria — Barras Verticais */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Layers className="h-4 w-4 text-blue-600" />Estoque por Categoria</h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{produtos.length} produtos</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Top 8 categorias por unidades em estoque</p>
          <div className="h-[260px]">
            {(() => {
              const cats: Record<string, number> = {};
              for (const p of produtos) { const n = p.categoria_nome || "Sem categoria"; cats[n] = (cats[n]||0)+(p.estoque||0); }
              const data = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name, estoque])=> ({ name: name.length>14? name.slice(0,14)+"…": name, estoque, fullName: name }));
              if(data.length===0) return <div className="flex h-full items-center justify-center text-xs text-gray-400">Nenhuma categoria</div>;
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} interval={0} angle={-14} dy={10} height={40} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "#f9fafb" }} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v:any)=>[v, "unidades"]} labelFormatter={(l:any)=> data.find(d=>d.name===l)?.fullName || l} />
                    <Bar dataKey="estoque" radius={[8,8,0,0]} barSize={26}>
                      {data.map((_,i)=> <Cell key={i} fill={ ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ec4899","#f97316","#06b6d4","#ef4444"][i%8]} />)}
                    </Bar>
                  </RBarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>
        {/* Últimas Movimentações — ao lado direito de Estoque por Categoria */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-4 flex flex-col">
          <div className="flex-1">
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
    <div className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-[1px] transition-all hover:shadow-lg hover:-translate-y-0.5 ${alert ? "border-amber-300 shadow-md" : "border-gray-200"}`}>
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition ${alert ? "bg-gradient-to-br from-amber-50 to-orange-50" : "bg-gradient-to-br from-gray-50 to-white"}`} />
      <div className="relative flex h-full flex-col rounded-[15px] bg-white p-3.5">
        <div className="flex items-start justify-between mb-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${iconBg}`}>{icon}</div>
          {alert && <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate">{label}</div>
        <div className="mt-1 text-xl font-black tracking-tight text-gray-900 leading-none">{value}</div>
        <div className="mt-1 text-[11px] text-gray-500 truncate">{sub}</div>
        <div className="flex-1" />
        {alert ? <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: "100%" }} /></div> : <div className="mt-3 h-1.5 w-full rounded-full bg-transparent" />}
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
  const isEntrada = titulo.toLowerCase().includes("entrada");
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-[1px] transition-all hover:shadow-lg hover:-translate-y-0.5">
      <div className={`absolute inset-0 bg-gradient-to-br ${isEntrada ? "from-blue-50/80 to-cyan-50/80" : "from-violet-50/80 to-purple-50/80"} opacity-60 group-hover:opacity-100 transition`} />
      <div className="relative flex h-full flex-col rounded-[15px] bg-white p-3.5">
        <div className="flex items-start justify-between mb-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${iconBg}`}>{icon}</div>
          <div className={`hidden h-6 w-6 items-center justify-center rounded-full ${isEntrada ? "bg-blue-100 text-blue-600" : "bg-violet-100 text-violet-600"}`}>
            <TrendingUp className={`h-3.5 w-3.5 ${isEntrada ? "" : "rotate-180"}`} />
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 truncate">{titulo}</div>
        <div className="mt-1 text-xl font-black tracking-tight text-gray-900 leading-none">{valor}</div>
        <div className="mt-1 inline-flex max-w-full truncate rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{sub}</div>
        <div className="flex-1" />
        <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${isEntrada ? "bg-gradient-to-r from-blue-500 to-cyan-500" : "bg-gradient-to-r from-violet-500 to-purple-500"}`} style={{ width: `${Math.min(100, parseInt(valor.replace(/\D/g, "")) || 30)}%` }} />
        </div>
      </div>
    </div>
  );
}


