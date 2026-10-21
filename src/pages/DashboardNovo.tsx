import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, Boxes, AlertTriangle, AlertCircle, TrendingUp, TrendingDown,
  ShoppingCart, Truck, Layers, PieChart as PieIcon, Store, Flame,
  ArrowRight,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend as RLegend,
} from "recharts";
import Layout from "../components/Layout";
import type { DashboardStats, Movimentacao, Produto, Loja } from "../lib/types";
import { api } from "../lib/api";

// ============================================================================
//  DASHBOARD — modelo novo (proposta)
//  Mesma base do app: Tailwind + lucide-react + Recharts, cards rounded-2xl,
//  paleta azul/verde/âmbar/vermelho, Header/Sidebar/Layout originais.
// ============================================================================

interface SaldoLoja { produto_id: number; loja_id: number; loja_nome: string; quantidade: number }

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtData(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch { return ""; }
}

function chaveMes(iso: string): string {
  try { return iso.slice(0, 7); } catch { return ""; }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [saldos, setSaldos] = useState<SaldoLoja[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // mostrarLoading só no mount inicial; no intervalo/focus atualiza sem flicker.
  const carregarDados = useCallback(async (mostrarLoading: boolean = false) => {
    if (mostrarLoading) setLoading(true);
    try {
      const [s, movs, prods, lj, sl] = await Promise.all([
        api.dashboardStats(),
        api.movimentacoes.list(),
        api.produtos.list(),
        api.lojas.list(),
        api.estoqueLoja.saldos(),
      ]);
      setStats(s);
      setMovimentacoes(movs);
      setProdutos(prods);
      setLojas(lj);
      setSaldos(sl as SaldoLoja[]);
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
  const indisponiveis = stats?.itens_indisponiveis ?? 0;
  const entradasMes = stats?.entradas_mes ?? 0;
  const saidasMes = stats?.saidas_mes ?? 0;

  const ativos = useMemo(() => produtos.filter(p => p.ativo), [produtos]);

  // --- Itens zerados (ação imediata) ---
  const zerados = useMemo(
    () => ativos.filter(p => (p.estoque || 0) <= 0),
    [ativos]
  );

  // --- Preenchimento de dados cadastrais (o app não avisa isso hoje) ---
  const semMinimo = useMemo(() => ativos.filter(p => !(p.estoque_minimo > 0)).length, [ativos]);

  // --- Donut: contagem de PRODUTOS (mesma definição dos cards) ---
  const dispCount = ativos.filter(p => (p.estoque || 0) > (p.estoque_minimo || 0)).length;
  const baixoCount = ativos.filter(p => { const e = p.estoque || 0; return e > 0 && e <= (p.estoque_minimo || 0); }).length;
  const semEstoqueCount = ativos.filter(p => (p.estoque || 0) <= 0).length;
  const totalDonut = dispCount + baixoCount + semEstoqueCount;

  // --- Gráfico: entradas x saídas dos últimos 3 meses ---
  const serieMensal = useMemo(() => {
    const base = new Date();
    const meses: { chave: string; rotulo: string }[] = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      meses.push({
        chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        rotulo: `${MESES_CURTOS[d.getMonth()]}`,
      });
    }
    return meses.map(({ chave, rotulo }) => {
      const doMes = movimentacoes.filter(m => chaveMes(m.data_movimento || "") === chave);
      return {
        rotulo,
        entradas: doMes.filter(m => m.tipo === "entrada").reduce((s, m) => s + (m.quantidade || 0), 0),
        saidas: doMes.filter(m => m.tipo === "saida").reduce((s, m) => s + (m.quantidade || 0), 0),
      };
    });
  }, [movimentacoes]);

  // --- Estoque por categoria (unidades) ---
  const porCategoria = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const p of ativos) {
      const n = p.categoria_nome || "Sem categoria";
      cats[n] = (cats[n] || 0) + (p.estoque || 0);
    }
    return Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, estoque]) => ({ name: name.length > 14 ? name.slice(0, 14) + "…" : name, estoque, fullName: name }));
  }, [ativos]);

  // --- Estoque por loja ---
  const porLoja = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const l of lojas) mapa[l.nome] = 0;
    for (const s of saldos) {
      mapa[s.loja_nome] = (mapa[s.loja_nome] || 0) + (s.quantidade || 0);
    }
    return Object.entries(mapa)
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [lojas, saldos]);
  const lojasComEstoque = porLoja.filter(l => l.qtd > 0).length;

  // --- Maior consumo (histórico de saídas) ---
  const maiorConsumo = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const m of movimentacoes) {
      if (m.tipo !== "saida") continue;
      const nome = m.produto_nome || `Produto #${m.produto_id}`;
      mapa[nome] = (mapa[nome] || 0) + (m.quantidade || 0);
    }
    return Object.entries(mapa)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([nome, qtd]) => ({ nome, qtd }));
  }, [movimentacoes]);
  const maxConsumo = maiorConsumo[0]?.qtd || 1;

  const ultimaMovimentacao = useMemo(
    () => [...movimentacoes].sort((a, b) => (b.data_movimento || "").localeCompare(a.data_movimento || "")).slice(0, 8),
    [movimentacoes]
  );

  const dadosCard = (v: number) => (loading ? "-" : v.toLocaleString("pt-BR"));

  return (
    <Layout title="Dashboard" subtitle="Visão geral do estoque">
      {erro && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">{erro}</div>}

      {/* ---------- Linha 1: KPIs ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 auto-rows-fr items-stretch">
        <KpiCard
          icon={<Package className="h-5 w-5" />}
          iconBg="bg-blue-100 text-blue-600"
          label="Produtos ativos"
          value={dadosCard(totalProdutos)}
          sub={`${ativos.filter(p => p.categoria_nome).length} categorias`}
        />
        <KpiCard
          icon={<Boxes className="h-5 w-5" />}
          iconBg="bg-emerald-100 text-emerald-600"
          label="Unidades em estoque"
          value={dadosCard(itensEstoque)}
          sub={`${lojasComEstoque} de ${lojas.length} lojas`}
        />
        <KpiCard
          icon={<AlertCircle className="h-5 w-5" />}
          iconBg="bg-red-100 text-red-600"
          label="Itens zerados"
          value={dadosCard(indisponiveis)}
          sub={indisponiveis > 0 ? "reposição necessária" : "nada zerado"}
          alert={indisponiveis > 0}
        />
        <KpiCard
          icon={<Store className="h-5 w-5" />}
          iconBg="bg-violet-100 text-violet-600"
          label="Movimentações no mês"
          value={dadosCard(entradasMes + saidasMes)}
          sub={`${entradasMes} em • ${saidasMes} out`}
        />
      </div>

      {/* ---------- Faixa de ação ---------- */}
      {zerados.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-red-800">
              {zerados.length} {zerados.length === 1 ? "item está zerado" : "itens estão zerados"} e precisam de reposição
            </div>
            <div className="mt-0.5 truncate text-[11px] text-red-600">
              {zerados.map(p => p.nome).join(" · ")}
            </div>
          </div>
          <button
            onClick={() => navigate("/entradas")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            Registrar entrada <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ---------- Linha 2: gráfico + donut ---------- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Entradas x Saídas — 3 meses */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-7">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-600" />Entradas x Saídas
            </h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">últimos 3 meses</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Volume de unidades movimentadas por mês</p>
          <div className="h-[260px]">
            {serieMensal.every(s => s.entradas === 0 && s.saidas === 0) ? (
              <div className="flex h-full items-center justify-center text-xs text-gray-400">Sem movimentações no período</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RBarChart data={serieMensal} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "#f9fafb" }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                    formatter={(v: any, n: any) => [v, n === "entradas" ? "Entradas" : "Saídas"]}
                  />
                  <RLegend
                    verticalAlign="top" height={28} iconType="circle" iconSize={8}
                    formatter={(v: any) => (v === "entradas" ? "Entradas" : "Saídas")}
                  />
                  <Bar dataKey="entradas" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={34} />
                  <Bar dataKey="saidas" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={34} />
                </RBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Distribuição do Estoque — Donut */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-violet-600" />Distribuição do Estoque
            </h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{totalDonut} produtos</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Disponível • Baixo • Zerado</p>
          <div className="relative h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Disponíveis", value: dispCount, color: "#10b981" },
                    { name: "Estoque Baixo", value: baixoCount, color: "#f59e0b" },
                    { name: "Sem Estoque", value: semEstoqueCount, color: "#ef4444" },
                  ].filter(d => d.value > 0)}
                  cx="50%" cy="50%" innerRadius={58} outerRadius={84} paddingAngle={3} dataKey="value" stroke="#fff" strokeWidth={2}
                >
                  {["#10b981", "#f59e0b", "#ef4444"].map((c, i) => <Cell key={i} fill={c} />)}
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
            <MiniStat color="bg-emerald-500" bg="bg-emerald-50 border-emerald-100" text="text-emerald-700" label="Disponíveis" value={dispCount} pct={totalDonut > 0 ? Math.round(dispCount / totalDonut * 100) : 0} />
            <MiniStat color="bg-amber-500" bg="bg-amber-50 border-amber-100" text="text-amber-700" label="Baixo" value={baixoCount} pct={totalDonut > 0 ? Math.round(baixoCount / totalDonut * 100) : 0} />
            <MiniStat color="bg-red-500" bg="bg-red-50 border-red-100" text="text-red-700" label="Zerado" value={semEstoqueCount} pct={totalDonut > 0 ? Math.round(semEstoqueCount / totalDonut * 100) : 0} />
          </div>
        </div>
      </div>

      {/* ---------- Linha 3: categoria + loja + consumo ---------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Estoque por Categoria */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />Estoque por Categoria
            </h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{ativos.length} produtos</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Top 8 categorias por unidades em estoque</p>
          <div className="h-[240px]">
            {porCategoria.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-gray-400">Nenhuma categoria</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RBarChart data={porCategoria} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} interval={0} angle={-14} dy={10} height={40} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "#f9fafb" }}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                    formatter={(v: any) => [v, "unidades"]}
                    labelFormatter={(l: any) => porCategoria.find(d => d.name === l)?.fullName || l}
                  />
                  <Bar dataKey="estoque" radius={[8, 8, 0, 0]} maxBarSize={26}>
                    {porCategoria.map((_, i) => <Cell key={i} fill={["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#f97316", "#06b6d4", "#ef4444"][i % 8]} />)}
                  </Bar>
                </RBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Estoque por Loja */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Store className="h-4 w-4 text-cyan-600" />Estoque por Loja
            </h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700">{lojasComEstoque}/{lojas.length}</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Onde o material está guardado</p>
          <div className="space-y-2">
            {porLoja.length === 0 && <div className="py-4 text-center text-xs text-gray-400">Nenhuma loja cadastrada</div>}
            {porLoja.map(l => {
              const total = porLoja.reduce((s, x) => s + x.qtd, 0) || 1;
              const vazia = l.qtd === 0;
              return (
                <div key={l.nome} className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-gray-800">{l.nome}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${vazia ? "bg-gray-200 text-gray-500" : "bg-emerald-100 text-emerald-700"}`}>
                      {vazia ? "vazio" : `${l.qtd} un`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.round(l.qtd / total * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Maior Consumo */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />Maior Consumo
            </h3>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">histórico</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Itens que mais saíram — candidatos a reposição</p>
          <div className="space-y-2.5">
            {maiorConsumo.length === 0 && <div className="py-4 text-center text-xs text-gray-400">Nenhuma saída registrada</div>}
            {maiorConsumo.map(c => (
              <div key={c.nome}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-gray-800">{c.nome}</span>
                  <span className="shrink-0 text-xs font-bold text-gray-700">{c.qtd}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500" style={{ width: `${Math.max(6, Math.round(c.qtd / maxConsumo * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- Linha 4: movimentações ---------- */}
      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-violet-600" />Últimas Movimentações
          </h3>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{ultimaMovimentacao.length} recentes</span>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">Entradas, saídas e transferências mais recentes</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {ultimaMovimentacao.length === 0 && (
            <div className="col-span-full py-4 text-center text-xs text-gray-400">Nenhuma movimentação</div>
          )}
          {ultimaMovimentacao.map((m, i) => {
            const entrada = m.tipo === "entrada";
            const saida = m.tipo === "saida";
            return (
              <div key={m.id || i} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                entrada ? "border-emerald-200 bg-emerald-50/60"
                  : saida ? "border-blue-200 bg-blue-50/60"
                  : "border-violet-200 bg-violet-50/60"
              }`}>
                {entrada ? <TrendingUp className="h-4 w-4 shrink-0 text-emerald-600" />
                  : saida ? <TrendingDown className="h-4 w-4 shrink-0 text-blue-600" />
                  : <ArrowRight className="h-4 w-4 shrink-0 text-violet-600" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-gray-900">{m.produto_nome || `Produto #${m.produto_id}`}</div>
                  <div className="truncate text-[11px] text-gray-500">
                    {entrada ? "Entrada" : saida ? "Saída" : "Transferência"}
                    {m.loja_origem_nome ? ` • ${m.loja_origem_nome}` : ""}
                    {m.loja_destino_nome ? ` → ${m.loja_destino_nome}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-xs font-bold ${entrada ? "text-emerald-600" : saida ? "text-blue-600" : "text-violet-600"}`}>
                    {entrada ? "+" : saida ? "−" : "↔"}{m.quantidade}
                  </div>
                  <div className="text-[10px] text-gray-400">{fmtData(m.data_movimento)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- Rodapé: pendências de cadastro ---------- */}
      {semMinimo > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[11.5px] text-amber-800">
          <span className="font-semibold">Cadastros pendentes:</span>
          {semMinimo > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />{semMinimo} produtos sem estoque mínimo (o alerta de "baixo" nunca dispara)
            </span>
          )}
          <button
            onClick={() => navigate("/produtos")}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600"
          >
            Abrir produtos <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
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
        <div className={`mt-3 h-1.5 w-full rounded-full overflow-hidden ${alert ? "bg-gray-100" : "bg-transparent"}`}>
          {alert && <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: "100%" }} />}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ color, bg, text, label, value, pct }: {
  color: string; bg: string; text: string; label: string; value: number; pct: number;
}) {
  return (
    <div className={`rounded-xl border p-2.5 text-center ${bg}`}>
      <div className={`h-2 w-2 rounded-full mx-auto mb-1 ${color}`} />
      <div className={`text-[10px] font-semibold ${text}`}>{label}</div>
      <div className={`text-sm font-bold ${text}`}>{value}</div>
      <div className={`text-[10px] ${text} opacity-80`}>{pct}%</div>
    </div>
  );
}
