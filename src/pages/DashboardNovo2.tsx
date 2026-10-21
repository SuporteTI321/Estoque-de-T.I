import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  CircleAlert, Activity, Store, ListFilter, ChevronRight,
} from "lucide-react";
import {
  BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import Layout from "../components/Layout";
import type { DashboardStats, Movimentacao, Produto, Loja } from "../lib/types";
import { api } from "../lib/api";

// ============================================================================
//  DASHBOARD — modelo B: quadro operacional (denso, tabular, sem gradientes)
//  Mesma base do app: Tailwind + lucide-react + Recharts, Layout/Sidebar/Header.
// ============================================================================

interface SaldoLoja { produto_id: number; loja_id: number; loja_nome: string; quantidade: number }

type Status = "zerado" | "baixo" | "atencao";

const DIAS = 14;

function chaveDia(iso: string): string {
  try { return (iso || "").slice(0, 10); } catch { return ""; }
}

function fmtData(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch { return ""; }
}

export default function DashboardNovo2() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [saldos, setSaldos] = useState<SaldoLoja[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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
      setStats(s); setMovimentacoes(movs); setProdutos(prods); setLojas(lj);
      setSaldos(sl as SaldoLoja[]);
      setErro(null);
    } catch (e) {
      console.error("[DashboardB] falha ao carregar dados:", e);
      setErro("Não foi possível carregar os dados do dashboard.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    carregarDados(true);
    const onFocus = () => carregarDados();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(onFocus, 30000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(interval); };
  }, [carregarDados]);

  const ativos = useMemo(() => produtos.filter(p => p.ativo), [produtos]);

  // --- Consumo histórico por produto (saídas) ---
  const consumo = useMemo(() => {
    const mapa: Record<number, number> = {};
    for (const m of movimentacoes) {
      if (m.tipo !== "saida") continue;
      mapa[m.produto_id] = (mapa[m.produto_id] || 0) + (m.quantidade || 0);
    }
    return mapa;
  }, [movimentacoes]);

  // --- Quadro de reposição: zerados, abaixo do mínimo e estoque <= consumo ---
  const reposicao = useMemo(() => {
    const linhas = ativos.map(p => {
      const e = p.estoque || 0;
      const saiu = consumo[p.id] || 0;
      const min = p.estoque_minimo || 0;
      let status: Status | "ok" = "ok";
      if (e <= 0) status = "zerado";
      else if (min > 0 && e <= min) status = "baixo";
      else if (saiu > 0 && e <= saiu) status = "atencao";
      return { p, e, saiu, min, status };
    });
    return linhas
      .filter(l => l.status !== "ok")
      .sort((a, b) => (a.e - b.e) || (b.saiu - a.saiu));
  }, [ativos, consumo]);

  const nZerados = reposicao.filter(l => l.status === "zerado").length;
  const nBaixo = reposicao.filter(l => l.status === "baixo").length;
  const nAtencao = reposicao.filter(l => l.status === "atencao").length;

  // --- Movimento dos últimos 14 dias ---
  const serieDiaria = useMemo(() => {
    const hoje = new Date();
    const dias: { chave: string; rotulo: string; entradas: number; saidas: number }[] = [];
    for (let i = DIAS - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i);
      dias.push({
        chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        rotulo: String(d.getDate()),
        entradas: 0, saidas: 0,
      });
    }
    const mapa = new Map(dias.map(d => [d.chave, d]));
    for (const m of movimentacoes) {
      const d = mapa.get(chaveDia(m.data_movimento));
      if (!d) continue;
      if (m.tipo === "entrada") d.entradas += m.quantidade || 0;
      else if (m.tipo === "saida") d.saidas += m.quantidade || 0;
    }
    return dias;
  }, [movimentacoes]);

  const movimento14 = useMemo(() => {
    const ent = serieDiaria.reduce((s, d) => s + d.entradas, 0);
    const sai = serieDiaria.reduce((s, d) => s + d.saidas, 0);
    return { ent, sai, saldo: ent - sai };
  }, [serieDiaria]);

  // --- Estoque por loja ---
  const porLoja = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const l of lojas) mapa[l.nome] = 0;
    for (const s of saldos) mapa[s.loja_nome] = (mapa[s.loja_nome] || 0) + (s.quantidade || 0);
    return Object.entries(mapa).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);
  }, [lojas, saldos]);
  const lojasComEstoque = porLoja.filter(l => l.qtd > 0).length;

  // --- Últimas movimentações (tabela) ---
  const ultimas = useMemo(
    () => [...movimentacoes]
      .sort((a, b) => (b.data_movimento || "").localeCompare(a.data_movimento || ""))
      .slice(0, 12),
    [movimentacoes]
  );

  const totalEstoque = stats?.itens_estoque ?? 0;
  const semMinimo = ativos.filter(p => !(p.estoque_minimo > 0)).length;
  const n = (v: number) => (loading ? "—" : v.toLocaleString("pt-BR"));

  return (
    <Layout title="Painel do Estoque" subtitle="Reposição, movimento e localização">
      {erro && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{erro}</div>
      )}

      {/* ---------- Faixa de números (uma faixa, sem cards) ---------- */}
      <div className="mb-4 grid grid-cols-2 divide-x divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-300 bg-white sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0">
        <Num label="Produtos ativos" value={n(ativos.length)} sub={`${ativos.filter(p => p.categoria_nome).length} categorias`} />
        <Num label="Unidades" value={n(totalEstoque)} sub={`${lojasComEstoque}/${lojas.length} lojas`} />
        <Num label="Zerados" value={n(nZerados)} sub="repor agora" tone={nZerados > 0 ? "danger" : undefined} />
        <Num label="Movim. 14 dias" value={n(movimento14.ent + movimento14.sai)} sub={`+${movimento14.ent} / −${movimento14.sai}`} />
        <Num label="Atenção" value={n(nBaixo + nAtencao)} sub="estoque baixo" tone={(nBaixo + nAtencao) > 0 ? "warn" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* ---------- Quadro de reposição ---------- */}
        <section className="lg:col-span-7">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <ListFilter className="h-4 w-4 text-red-600" />
              Quadro de reposição
            </h2>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-gray-500">{reposicao.length} itens</span>
              <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">{nZerados} zerados</span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">{nBaixo + nAtencao} atenção</span>
            </div>
          </div>

          {reposicao.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-gray-400">Nenhum item precisa de reposição</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2 font-semibold">Produto</th>
                  <th className="px-2 py-2 text-right font-semibold">Estoque</th>
                  <th className="px-2 py-2 text-right font-semibold">Mínimo</th>
                  <th className="px-2 py-2 text-right font-semibold">Saiu</th>
                  <th className="px-2 py-2 text-center font-semibold">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {reposicao.map(({ p, e, saiu, min, status }) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="truncate font-medium text-gray-800">{p.nome}</div>
                      <div className="truncate text-[10px] text-gray-400">
                        {p.codigo ? <span className="font-mono">{p.codigo}</span> : null}
                        {p.codigo && p.categoria_nome ? " · " : ""}
                        {p.categoria_nome || "Sem categoria"}
                      </div>
                    </td>
                    <td className={`px-2 py-2 text-right font-semibold tabular-nums ${e <= 0 ? "text-red-600" : "text-gray-800"}`}>{e}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-500">{min > 0 ? min : "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-500">{saiu || "—"}</td>
                    <td className="px-2 py-2 text-center">
                      {status === "zerado" && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">Zerado</span>}
                      {status === "baixo" && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Baixo</span>}
                      {status === "atencao" && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">Atenção</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => navigate("/entradas?novo=true&produto=" + p.id)}
                        title="Registrar entrada"
                        className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        Repor <ChevronRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ---------- Coluna direita ---------- */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          {/* Movimento 14 dias */}
          <section>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Activity className="h-4 w-4 text-blue-600" />Movimento — 14 dias
              </h2>
              <span className="text-[11px] text-gray-500">saldo {movimento14.saldo >= 0 ? "+" : ""}{movimento14.saldo}</span>
            </div>
            <div className="p-4">
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart data={serieDiaria} margin={{ top: 4, right: 0, left: -24, bottom: 0 }} barCategoryGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "#f9fafb" }}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 11 }}
                      formatter={(v: any, nm: any) => [v, nm === "entradas" ? "Entradas" : "Saídas"]}
                      labelFormatter={(l: any) => `dia ${l}`}
                    />
                    <Bar dataKey="entradas" fill="#2563eb" maxBarSize={9} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="saidas" fill="#dc2626" maxBarSize={9} radius={[2, 2, 0, 0]} />
                  </RBarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><i className="block h-2 w-2 rounded-sm bg-blue-600" />Entradas {movimento14.ent}</span>
                <span className="flex items-center gap-1"><i className="block h-2 w-2 rounded-sm bg-red-600" />Saídas {movimento14.sai}</span>
              </div>
            </div>
          </section>

          {/* Localização */}
          <section>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Store className="h-4 w-4 text-cyan-600" />Onde está guardado
              </h2>
              <span className="text-[11px] text-gray-500">{lojasComEstoque}/{lojas.length} com saldo</span>
            </div>
            <div className="divide-y divide-gray-50">
              {porLoja.map(l => (
                <div key={l.nome} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="truncate text-gray-700">{l.nome}</span>
                  {l.qtd > 0
                    ? <span className="font-semibold tabular-nums text-gray-900">{l.qtd} un</span>
                    : <span className="text-[10px] text-gray-400">sem registro</span>}
                </div>
              ))}
              {porLoja.length === 0 && <div className="px-4 py-6 text-center text-xs text-gray-400">Nenhuma loja</div>}
            </div>
          </section>
        </div>
      </div>

      {/* ---------- Últimas movimentações (tabela) ---------- */}
      <section className="mt-4">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ArrowLeftRight className="h-4 w-4 text-gray-600" />Últimas movimentações
          </h2>
          <button onClick={() => navigate("/inventario")} className="text-[11px] font-medium text-blue-600 hover:text-blue-700">
            ver inventário
          </button>
        </div>
        {ultimas.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-gray-400">Nenhuma movimentação registrada</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="w-8 px-4 py-2" />
                <th className="px-2 py-2 font-semibold">Produto</th>
                <th className="px-2 py-2 font-semibold">Origem</th>
                <th className="px-2 py-2 font-semibold">Destino</th>
                <th className="px-2 py-2 text-right font-semibold">Qtd</th>
                <th className="px-4 py-2 text-right font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {ultimas.map((m, i) => {
                const entrada = m.tipo === "entrada";
                const saida = m.tipo === "saida";
                return (
                  <tr key={m.id || i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      {entrada ? <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
                        : saida ? <ArrowUpFromLine className="h-3.5 w-3.5 text-red-600" />
                        : <ArrowLeftRight className="h-3.5 w-3.5 text-violet-600" />}
                    </td>
                    <td className="px-2 py-2 font-medium text-gray-800">{m.produto_nome || `Produto #${m.produto_id}`}</td>
                    <td className="px-2 py-2 text-gray-500">{m.loja_origem_nome || "—"}</td>
                    <td className="px-2 py-2 text-gray-500">{m.loja_destino_nome || "—"}</td>
                    <td className={`px-2 py-2 text-right font-semibold tabular-nums ${entrada ? "text-emerald-700" : saida ? "text-red-700" : "text-violet-700"}`}>
                      {entrada ? "+" : saida ? "−" : "↔"}{m.quantidade}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">{fmtData(m.data_movimento)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ---------- Aviso de cadastro ---------- */}
      {semMinimo > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded border border-amber-300 bg-amber-50 px-4 py-2.5 text-[11px] text-amber-800">
          <span className="flex items-center gap-1.5 font-semibold"><CircleAlert className="h-3.5 w-3.5" />Cadastro incompleto</span>
          {semMinimo > 0 && <span>{semMinimo} produtos sem estoque mínimo — alerta de "baixo" nunca dispara</span>}
          <button onClick={() => navigate("/produtos")} className="ml-auto rounded bg-amber-600 px-2.5 py-1 font-semibold text-white transition hover:bg-amber-700">
            corrigir
          </button>
        </div>
      )}
    </Layout>
  );
}

// ============================================================================
//  Sub-components
// ============================================================================

function Num({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "warn" | "danger" }) {
  const cor = tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900";
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums leading-tight ${cor}`}>{value}</div>
      <div className="truncate text-[11px] text-gray-500">{sub}</div>
    </div>
  );
}
