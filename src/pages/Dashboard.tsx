import { useEffect, useState, useCallback } from "react";
import {
  Package, Boxes, AlertTriangle, AlertCircle,
  TrendingUp, TrendingDown, ShoppingCart, Truck,
  Layers, PieChart as PieIcon, Zap, ArrowLeftRight, ClipboardList,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import Layout from "../components/Layout";
import type { DashboardStats, Movimentacao, Produto } from "../lib/types";
import { api } from "../lib/api";

// Paleta exata das 8 cores de categoria (protótipo v2 — a mesma do gráfico antigo)
const CORES_CATEGORIA = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#f97316", "#06b6d4", "#ef4444"];

// "hoje" / "ontem" / "N dias" / data — para o feed de movimentações
function tempoRelativo(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dia = new Date(d); dia.setHours(0, 0, 0, 0);
    const dias = Math.round((hoje.getTime() - dia.getTime()) / 86400000);
    if (dias <= 0) return "hoje";
    if (dias === 1) return "ontem";
    if (dias < 7) return `${dias} dias`;
    return d.toLocaleDateString("pt-BR");
  } catch { return ""; }
}

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
  // Métricas dos painéis esquerdo/track do modelo v4 — tudo calculado do MESMO
  // banco (disponiveis/baixo/sem fecham exatamente com o total).
  const catCount = new Set(produtos.map(p => p.categoria_nome || "Sem categoria")).size;
  const pctDisponivel = totalProdutos > 0 ? Math.round(((stats?.disponiveis ?? 0) / totalProdutos) * 100) : 0;
  const pctBaixo = totalProdutos > 0 ? Math.round((estoqueBaixo / totalProdutos) * 100) : 0;
  const pctSem = totalProdutos > 0 ? Math.round((indisponiveis / totalProdutos) * 100) : 0;

  // Contagem de movimentos do MES corrente para os subs dos resumo cards.
  // Mesma referencia do backend (date('now','start of month')) — antes isto
  // mostrava o total de TODOS os tempos (195/30) embaixo de cards "do Mês".
  const agora = new Date();
  const anoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  const movEntradasMes = movimentacoes.filter(m => m.tipo === "entrada" && (m.data_movimento || "").slice(0, 7) === anoMes).length;
  const movSaidasMes = movimentacoes.filter(m => m.tipo === "saida" && (m.data_movimento || "").slice(0, 7) === anoMes).length;
  const movTransfMes = movimentacoes.filter(m => m.tipo === "transferencia" && (m.data_movimento || "").slice(0, 7) === anoMes).length;
  const totalMovMes = movEntradasMes + movSaidasMes + movTransfMes;

  // Barras horizontais: categorias com produtos, soma de unidades (mesma fonte
  // dos KPIs — produtos do banco, ativos). Top 8.
  const catData = (() => {
    const cats: Record<string, number> = {};
    for (const p of produtos) { const n = p.categoria_nome || "Sem categoria"; cats[n] = (cats[n] || 0) + (p.estoque || 0); }
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([nomeCat, unidades]) => ({ nome: nomeCat.length > 16 ? nomeCat.slice(0, 16) + "…" : nomeCat, unidades, completo: nomeCat }));
  })();
  const catSoma = catData.reduce((s, d) => s + d.unidades, 0);
  const catMax = Math.max(...catData.map(d => d.unidades), 1);

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
      {/* 6 Cards — modelo v4 Duo-Split (protótipo aprovado) */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 auto-rows-fr items-stretch">
        <Kpi04
          tipo="blue"
          icon={<Package className="h-5 w-5" />}
          label="Total de Produtos"
          value={loading ? "—" : totalProdutos.toLocaleString("pt-BR")}
          unit="cadastrados"
          leftValue={loading ? "—" : String(catCount)}
          leftLabel={"categorias\nativas"}
          track={100}
          foot={`${loading ? "—" : itensEstoque.toLocaleString("pt-BR")} unidades em estoque`}
        />
        <Kpi04
          tipo="emerald"
          icon={<Boxes className="h-5 w-5" />}
          label="Em Estoque"
          value={loading ? "—" : itensEstoque.toLocaleString("pt-BR")}
          unit="unidades"
          leftValue={loading ? "—" : `${pctDisponivel}%`}
          leftLabel={"do catálogo\nsaudável"}
          track={pctDisponivel}
          foot={`${loading ? "—" : String(stats?.disponiveis ?? 0)} produtos acima do mínimo`}
        />
        <Kpi04
          tipo="amber"
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Estoque Baixo"
          value={loading ? "—" : String(estoqueBaixo)}
          unit="produtos"
          pill="atenção"
          leftValue={loading ? "—" : String(estoqueBaixo)}
          leftLabel={"produtos\nabaixo mín."}
          track={pctBaixo}
          foot="monitorar necessidade de compra"
        />
        <Kpi04
          tipo="red"
          icon={<AlertCircle className="h-5 w-5" />}
          label="Sem Estoque"
          value={loading ? "—" : String(indisponiveis)}
          unit="produtos"
          pill="crítico"
          leftValue={loading ? "—" : String(indisponiveis)}
          leftLabel={"produtos\nsem estoque"}
          track={pctSem}
          foot="aguardando reposição"
        />
        <Kpi04
          tipo="blue"
          icon={<Truck className="h-5 w-5" />}
          label="Entradas do Mês"
          value={entradasMes.toLocaleString("pt-BR")}
          unit="unidades"
          leftValue={String(movEntradasMes)}
          leftLabel={"movimentos\nno mês"}
          track={Math.min(100, entradasMes)}
          foot="recebidas no mês corrente"
        />
        <Kpi04
          tipo="violet"
          icon={<ShoppingCart className="h-5 w-5" />}
          label="Saídas do Mês"
          value={saidasMes.toLocaleString("pt-BR")}
          unit="unidades"
          leftValue={String(movSaidasMes)}
          leftLabel={"movimentos\nno mês"}
          track={Math.min(100, saidasMes)}
          foot="consumidas no mês corrente"
        />
      </div>

      {/* Row: Gráficos + Últimas Movimentações */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Distribuição do Estoque — donut com cabeçalho/legenda do protótipo v2 */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:col-span-3">
          <div className="mb-3.5 flex items-start justify-between gap-2.5 border-b border-dashed border-gray-200 pb-3">
            <div>
              <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-gray-900"><PieIcon className="h-4 w-4 text-violet-600" />Distribuição do Estoque</h3>
              <p className="mt-0.5 text-[11px] text-gray-400">Disponível • Baixo • Zerado</p>
            </div>
            <span className="whitespace-nowrap rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-600">{totalDonut} produtos</span>
          </div>
          <div className="relative h-[200px]">
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
              <span className="text-[26px] font-extrabold leading-none tracking-tight text-gray-900">{totalDonut}</span>
              <span className="mt-0.5 text-[9.5px] uppercase tracking-[0.15em] text-gray-400">produtos</span>
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-1.5 py-2 text-center text-emerald-600">
              <div className="text-[10px] font-semibold">Disponíveis</div>
              <div className="text-[15px] font-extrabold leading-tight">{dispCount}</div>
              <div className="text-[10px]">{totalDonut>0?Math.round(dispCount/totalDonut*100):0}%</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-1.5 py-2 text-center text-amber-600">
              <div className="text-[10px] font-semibold">Baixo</div>
              <div className="text-[15px] font-extrabold leading-tight">{baixoCount}</div>
              <div className="text-[10px]">{totalDonut>0?Math.round(baixoCount/totalDonut*100):0}%</div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 px-1.5 py-2 text-center text-red-600">
              <div className="text-[10px] font-semibold">Zerado</div>
              <div className="text-[15px] font-extrabold leading-tight">{semEstoqueCount}</div>
              <div className="text-[10px]">{totalDonut>0?Math.round(semEstoqueCount/totalDonut*100):0}%</div>
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-dashed border-gray-200 pt-3 text-[10.5px] text-gray-400">
            <span>{dispCount} saudáveis</span>
            <b className="font-bold text-gray-500">{totalDonut} no total</b>
          </div>
        </div>

        {/* Estoque por Categoria — barras horizontais (estilo protótipo v2, paleta de 8 cores) */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:col-span-5">
          <div className="mb-3.5 flex items-start justify-between gap-2.5 border-b border-dashed border-gray-200 pb-3">
            <div>
              <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-gray-900"><Layers className="h-4 w-4 text-blue-600" />Estoque por Categoria</h3>
              <p className="mt-0.5 text-[11px] text-gray-400">Top 8 categorias por unidades em estoque</p>
            </div>
            <span className="whitespace-nowrap rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-600">soma: {catSoma.toLocaleString("pt-BR")} un</span>
          </div>
          {catData.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-gray-400">Nenhuma categoria</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {catData.map((d, i) => (
                <div key={d.completo} className="grid grid-cols-[104px_1fr_44px] items-center gap-2.5 text-xs" title={`${d.completo}: ${d.unidades} unidades`}>
                  <span className="truncate font-semibold text-gray-900">{d.nome}</span>
                  <div className="h-[10px] overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, Math.round((d.unidades / catMax) * 100))}%`, background: CORES_CATEGORIA[i % 8] }} />
                  </div>
                  <span className="text-right text-[11.5px] font-bold text-gray-500">{d.unidades.toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center justify-between border-t border-dashed border-gray-200 pt-3 text-[10.5px] text-gray-400">
            <span>Top {catData.length} exibidas{catData.length > 0 ? ` · maior: ${catData[0].completo}` : ""}</span>
            <b className="font-bold text-gray-500">{catSoma.toLocaleString("pt-BR")} un total</b>
          </div>
        </div>
        {/* Últimas Movimentações — feed (estilo protótipo v2) */}
        <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:col-span-4">
          <div className="mb-3.5 flex items-start justify-between gap-2.5 border-b border-dashed border-gray-200 pb-3">
            <div>
              <h3 className="text-[13.5px] font-bold text-gray-900">Últimas Movimentações</h3>
              <p className="mt-0.5 text-[11px] text-gray-400">Entradas e saídas recentes</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            {movimentacoes.length === 0 && (
              <div className="py-4 text-center text-xs text-gray-400">Nenhuma movimentação</div>
            )}
            {movimentacoes.slice(0, 6).map((m, i) => {
              const entrou = m.tipo === "entrada";
              return (
                <div key={m.id || i} className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2 ${entrou ? "border-emerald-500 bg-[#f0fdf4]" : "border-blue-200 bg-blue-50"}`}>
                  <div className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg ${entrou ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                    {entrou ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-gray-900">{m.produto_nome || `Produto #${m.produto_id}`}</div>
                    <div className="truncate text-[11px] text-gray-500">
                      {entrou ? "Entrada" : m.tipo === "transferencia" ? "Transferência" : "Saída"} • {m.quantidade} un.{m.loja_origem_nome && ` • ${m.loja_origem_nome}`}
                    </div>
                  </div>
                  <time className="whitespace-nowrap text-[10px] text-gray-400">{tempoRelativo(m.data_movimento)}</time>
                </div>
              );
            })}
          </div>
          <div className="mt-auto flex items-center justify-between border-t border-dashed border-gray-200 pt-3 text-[10.5px] text-gray-400">
            <span>Entradas ↑ verde · Saídas ↓ azul</span>
            <b className="font-bold text-gray-500">atualiza sozinho</b>
          </div>
        </div>
      </div>

      {/* Rodapé — mini-estatísticas ao vivo (dados reais do banco) */}
      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <MiniStat
          bg="bg-blue-50 text-blue-600"
          icon={<Zap className="h-5 w-5" />}
          valor={loading ? "—" : String(totalMovMes)}
          texto="movimentações registradas no mês"
        />
        <MiniStat
          bg="bg-emerald-50 text-emerald-600"
          icon={<ArrowLeftRight className="h-5 w-5" />}
          valor={loading ? "—" : String(movTransfMes)}
          texto="transferências entre lojas no mês"
        />
        <MiniStat
          bg="bg-violet-50 text-violet-600"
          icon={<ClipboardList className="h-5 w-5" />}
          valor={loading ? "—" : String(stats?.solicitacoes_pendentes ?? 0)}
          texto="solicitações abertas aguardando aprovação"
        />
      </div>
    </Layout>
  );
}

// ============================================================================
//  Sub-components
// ============================================================================

// Mini-estatística do rodapé (modelo .mini-stat do protótipo v2)
function MiniStat({ bg, icon, valor, texto }: {
  bg: string;
  icon: React.ReactNode;
  valor: string;
  texto: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${bg}`}>{icon}</div>
      <div className="min-w-0">
        <b className="block text-lg font-extrabold leading-tight tracking-tight text-gray-900">{valor}</b>
        <span className="text-[11.5px] leading-snug text-gray-500">{texto}</span>
      </div>
    </div>
  );
}

// Modelo v4 Duo-Split: painel colorido à esquerda (ícone + métrica secundária),
// corpo à direita (label + valor + track + rodapé). Cores da paleta original.
function Kpi04({ tipo, icon, label, value, unit, pill, leftValue, leftLabel, track, foot }: {
  tipo: "blue" | "emerald" | "amber" | "red" | "violet";
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  pill?: "atenção" | "crítico";
  leftValue: string;
  leftLabel: string;
  track: number;
  foot: string;
}) {
  const st = {
    blue:    { solid: "bg-blue-600",    ring: "hover:border-blue-600",    val: "text-gray-900",    pill: "bg-blue-50 text-blue-600" },
    emerald: { solid: "bg-emerald-500", ring: "hover:border-emerald-500", val: "text-emerald-600", pill: "" },
    amber:   { solid: "bg-amber-500",   ring: "hover:border-amber-500",   val: "text-amber-600",   pill: "bg-amber-50 text-amber-600" },
    red:     { solid: "bg-red-600",     ring: "hover:border-red-600",     val: "text-red-600",     pill: "bg-red-50 text-red-600" },
    violet:  { solid: "bg-violet-600",  ring: "hover:border-violet-600",  val: "text-gray-900",    pill: "" },
  }[tipo];
  return (
    <div className={`group flex h-full overflow-hidden rounded-2xl border border-gray-200 bg-white transition-all hover:-translate-y-0.5 hover:shadow-lg ${st.ring}`}>
      <div className={`flex w-20 flex-none flex-col items-center justify-center gap-1.5 px-1.5 py-4 text-white ${st.solid}`}>
        {icon}
        <b className="text-lg font-extrabold leading-none tracking-tight">{leftValue}</b>
        <span className="whitespace-pre-line text-center text-[8px] font-semibold uppercase leading-[1.35] tracking-[0.13em] opacity-80">{leftLabel}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3.5">
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.11em] text-gray-400">{label}</span>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`text-[26px] font-extrabold leading-none tracking-tight ${st.val}`}>{value}</span>
          <span className="text-[10.5px] font-semibold text-gray-500">{unit}</span>
          {pill && <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${st.pill}`}>● {pill}</span>}
        </div>
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full transition-all duration-700 ${st.solid}`} style={{ width: `${Math.max(6, Math.min(100, track))}%` }} />
        </div>
        <span className="text-[10px] leading-snug text-gray-400">{foot}</span>
      </div>
    </div>
  );
}


