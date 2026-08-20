import { useEffect, useState, useMemo, useRef } from "react";
import { Building2, Package, Check, X, ChevronDown, ChevronRight as ChevronRightIcon, Search, Scale, Trash2, Pencil } from "lucide-react";
import Layout from "../components/Layout";
import type { Pedido, PedidoItem, Loja, Produto } from "../lib/types";
import { api, store } from "../lib/api";
import { imprimirRomaneio as imprimirRomaneioBase } from "../lib/printHtml";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ====================== COMPONENTE PRINCIPAL ======================
function parseDataPtBr(s: string): Date { return s.length <= 10 ? new Date(s + "T12:00:00-03:00") : new Date(s); }

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [viewing, setViewing] = useState<Pedido | null>(null);
  const [pedidoItens, setPedidoItens] = useState<PedidoItem[]>([]);
  const [itensDist, setItensDist] = useState<any[]>([]);
  const [todosItens, setTodosItens] = useState<Record<number, PedidoItem[]>>({});
  const [confirmando, setConfirmando] = useState(0);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const qtdsRef = useRef<Record<string, number>>({});
  const [qtdsVer, setQtdsVer] = useState(0);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(-1);
  const [busca, setBusca] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { loadData(); }, []);

  function loadData() {
    Promise.all([api.pedidos.list(), api.lojas.list(), api.produtos.list()])
      .then(([p, l, pr]) => { setPedidos(p); setLojas(l); setProdutos(pr); })
      .catch(() => { setPedidos([]); setLojas([]); setProdutos([]); });
    api.pedidos.listAllItens().then(setTodosItens).catch(() => {});
  }

  const produtoMap = useMemo(() => { const m = new Map<string, Produto>(); for (const p of produtos) m.set(p.nome.toLowerCase().trim(), p); return m; }, [produtos]);

  const anos = useMemo(() => { const s = new Set<number>(); for (const p of pedidos) { const d = parseDataPtBr(p.data_pedido); s.add(d.getFullYear()); } s.add(new Date().getFullYear()); return Array.from(s).sort((a,b)=>b-a); }, [pedidos]);
  const meses = useMemo(() => { const s = new Set<number>(); for (const p of pedidos) { const d = parseDataPtBr(p.data_pedido); if (d.getFullYear()===ano) s.add(d.getMonth()); } return Array.from(s).sort((a,b)=>a-b); }, [pedidos, ano]);

  const filtrados = useMemo(() => pedidos.filter(p => {
    if (busca) { const q = busca.toLowerCase(); if (!p.numero.toLowerCase().includes(q) && !p.solicitante.toLowerCase().includes(q) && !(p.loja_nome||"").toLowerCase().includes(q)) return false; }
    const d = parseDataPtBr(p.data_pedido); if (d.getFullYear()!==ano) return false;
    return mes<0 || d.getMonth()===mes;
  }).sort((a,b) => b.data_pedido.localeCompare(a.data_pedido)), [pedidos, ano, mes, busca]);

  const grupos = useMemo(() => {
    const map = new Map<number, Pedido[]>();
    for (const p of filtrados) { if (!map.has(p.loja_id)) map.set(p.loja_id, []); map.get(p.loja_id)!.push(p); }
    return Array.from(map.entries()).map(([id, peds]) => ({ loja: lojas.find(l=>l.id===id), pedidos: peds }));
  }, [filtrados, lojas]);

  // Recolhe grupos com todos pedidos atendidos
  useEffect(() => {
    const ids = new Set<string>();
    for (const g of grupos) {
      if (g.pedidos.length > 0 && g.pedidos.every(p => p.status === "atendido")) ids.add(String(g.loja?.id || ""));
    }
    setCollapsed(ids);
  }, [grupos]);

  function lojaOf(p: Pedido) { return lojas.find(l => l.id === p.loja_id); }

  function abrirPedido(p: Pedido) {
    api.pedidos.listItens(p.id).then((it: any) => {
      const lista = (it?.length ? it : todosItens[p.id] || []) as PedidoItem[];
      // Guarda copia original para janela de materiais (antes de confirmar)
      if (p.status !== "atendido" && !todosItens[p.id]) setTodosItens(prev => ({ ...prev, [p.id]: lista }));
      setPedidoItens(lista);
      if (p.status === "atendido") {
        api.movimentacoes.list().then((movs: any[]) => {
          const saidas = movs.filter((m: any) => m.tipo === "saida" && m.observacao?.includes(`Pedido ${p.numero}`));
          setItensDist(saidas.map((s: any, i: number) => ({ id: i+1000, pedido_id: p.id, produto_id: s.produto_id||0, produto_nome: (s.produto_nome||"").trim(), unidade: s.unidade||"Un", quantidade: s.quantidade })));
        });
        qtdsRef.current = {};
        setQtdsVer(v => v+1);
      } else {
        setItensDist([]);
        const q: Record<string, number> = {};
        for (const item of lista) {
          const chave = (item.produto_nome||(item as any).produto||`Item ${item.id}`).trim();
          q[chave] = (q[chave]||0) + (Number(item.quantidade)||1);
        }
        qtdsRef.current = q;
        setQtdsVer(v => v+1);
      }
      setViewing(p);
    });
  }

  function chaveItem(item: any) { return (item.produto_nome||item.produto||`Item ${item.id}`).trim(); }

  async function confirmar(p: Pedido) {
    if (!confirm(`Confirmar pedido ${p.numero}?`)) return;
    setConfirmando(p.id);
    try {
      let itens: any[] = await api.pedidos.listItens(p.id);
      if (!itens?.length) itens = todosItens[p.id] || [];
      if (!itens.length) { setMsg({ ok: false, text: "Nenhum item." }); return; }

      const qtdAtual = { ...qtdsRef.current };
      for (const item of itens) {
        const nome = chaveItem(item);
        if (qtdAtual[nome] === undefined) qtdAtual[nome] = Number(item.quantidade) || 1;
      }

      const movsE = await api.movimentacoes.list();
      for (const m of movsE) { if (m.tipo==="saida" && m.observacao?.includes(`Pedido ${p.numero}`)) { try { await api.movimentacoes.delete(m.id); } catch {} } }

      const grupos = new Map<string, { item: any; qtd: number }>();
      const romaneio: any[] = [];
      for (const item of itens) {
        if (removed.has(item.id)) continue;
        const nome = chaveItem(item);
        const qtd = qtdAtual[nome];
        if (qtd <= 0) continue;
        if (!grupos.has(nome)) grupos.set(nome, { item, qtd });
        romaneio.push({ ...item, produto_nome: nome, quantidade: qtd });
      }

      let n = 0;
      for (const [, { item, qtd }] of grupos) {
        const prod = produtoMap.get(chaveItem(item).toLowerCase());
        n++;
        await api.movimentacoes.create({
          tipo: "saida", produto_id: prod?.id || 0, produto_nome: item.produto_nome||item.produto, quantidade: qtd,
          loja_origem_id: p.loja_id, loja_origem_nome: p.loja_nome, loja_destino_id: null, loja_destino_nome: null,
          usuario_id: null, observacao: `Pedido ${p.numero} - ${item.produto_nome}`, preco_compra: prod?.preco_compra || 0, unidade: undefined,
        });
      }

      setViewing(null);
      setPedidoItens([]);
      setItensDist([]);
      setRemoved(new Set());
      qtdsRef.current = {};
      await api.pedidos.update(p.id, { status: "atendido" });
      // Mantém a quantidade SOLICITADA original no banco (Janela "Materiais do Pedido").
      // A quantidade CONFIRMADA/distribuída vai para movimentações ("Saída Almox→Loja").
      const itensFinais = itens.filter(item => !removed.has(item.id) && (qtdAtual[chaveItem(item)] ?? Number(item.quantidade)) > 0);
      await api.pedidos.setItens(p.id, itensFinais.map((item: any) => ({
        produto_id: item.produto_id || 0,
        produto_nome: item.produto_nome || item.produto,
        unidade: item.unidade || null,
        quantidade: Number(item.quantidade) || 1,
      })));
      setPedidos(prev => prev.map(x => x.id===p.id ? {...x, status:"atendido"} : x));
      const dists = Array.from(grupos.entries()).map(([nome, { item, qtd }]) => ({ ...item, produto_nome: nome, quantidade: qtd }));
      setMsg({ ok: true, text: `Pedido ${p.numero} confirmado! ${n} item(ns).` });
      setTimeout(() => imprimirRomaneio(p, romaneio), 500);
    } catch (e: any) {
      setMsg({ ok: false, text: "Erro: " + (e.message||"Falha ao confirmar") });
    } finally {
      setConfirmando(0);
    }
  }

  function imprimirRomaneio(p: Pedido, itens: any[]) {
    const dataPedido = p.data_pedido ? parseDataPtBr(p.data_pedido) : new Date();
    const dataSaida = new Date();

    imprimirRomaneioBase({
      titulo: "COMPROVANTE DE SAIDA",
      pedido: p.numero,
      codigo: p.loja_codigo || "—",
      loja: p.loja_nome || "—",
      solicitante: p.solicitante || "—",
      setor: p.setor || undefined,
      dataSolicitacao: dataPedido.toLocaleDateString("pt-BR"),
      dataSaida: dataSaida.toLocaleDateString("pt-BR"),
      itens: itens.map((item: any) => ({ produto: item.produto_nome || "Produto", qtd: item.quantidade || 0 })),
    });
  }

  const temPendentes = filtrados.some(p => p.status !== "atendido");

  return (
    <Layout title="Pedidos por Loja" subtitle="Importe PDFs e gerencie pedidos">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input name="busca" id="busca-pedido" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pedido..." className="w-full rounded-lg border border-gray-200 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-white border border-gray-200 px-2 py-1">
            {anos.map(a => <button key={a} onClick={()=>setAno(a)} className={`rounded px-2 py-0.5 text-xs font-medium ${ano===a?"bg-blue-600 text-white":"text-gray-500 hover:bg-gray-100"}`}>{a}</button>)}
          </div>
          {meses.length>0 && <div className="flex items-center gap-1 flex-wrap">
            <button onClick={()=>setMes(-1)} className={`rounded px-2 py-0.5 text-xs font-medium ${mes===-1?"bg-blue-600 text-white":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>Todos</button>
            {meses.map(m => <button key={m} onClick={()=>setMes(m)} className={`rounded px-2 py-0.5 text-xs font-medium ${mes===m?"bg-blue-600 text-white":"bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{MESES[m]}</button>)}
          </div>}
        </div>
        {temPendentes && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">{filtrados.filter(p=>p.status!=="atendido").length} pendentes</span>}
      </div>

      {msg && <div className={`mb-3 rounded-lg px-4 py-2.5 text-xs font-medium ${msg.ok?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700"}`}>{msg.text}<button onClick={()=>setMsg(null)} className="ml-2 text-gray-400 hover:text-gray-600"><X className="inline h-3 w-3"/></button></div>}

      {grupos.length === 0 ? (
        <div className="text-center text-gray-400 py-8 text-xs">Nenhum pedido encontrado</div>
      ) : (
        <div className="space-y-3">
          {grupos.map(g => {
            if (!g.loja) return null;
            const key = String(g.loja.id);
            const aberto = !collapsed.has(key);
            return (
              <div key={key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <button onClick={() => setCollapsed(p => { const s = new Set(p); s.has(key) ? s.delete(key) : s.add(key); return s; })} className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-100 transition">
                  <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" />{g.loja.nome} <span className="text-xs font-normal text-gray-500">({g.loja.codigo})</span></span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs font-normal text-gray-500">{g.pedidos.length} pedido(s)</span>
                    {aberto ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRightIcon className="h-4 w-4 text-gray-400" />}
                  </span>
                </button>
                {aberto && (
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-100 text-gray-500 uppercase"><th className="text-left px-4 py-2">Nº Pedido</th><th className="text-left px-4 py-2">Solicitante</th><th className="text-left px-4 py-2">Data</th><th className="text-center px-4 py-2 w-24">Status</th><th className="text-center px-4 py-2 w-20">Ações</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {g.pedidos.map(p => {
                        const statusColor: Record<string,string> = { importado:"bg-blue-100 text-blue-700", atendido:"bg-green-100 text-green-700", pendente:"bg-orange-100 text-orange-700" };
                        const statusLabel: Record<string,string> = { importado:"Aguardando", atendido:"Atendido", pendente:"Pendente" };
                        return (
                          <tr key={p.id} className="hover:bg-blue-50 transition">
                            <td className="px-4 py-2.5 font-medium text-gray-900 cursor-pointer" onClick={() => abrirPedido(p)}>{p.numero}</td>
                            <td className="px-4 py-2.5 text-gray-600">{p.solicitante}</td>
                            <td className="px-4 py-2.5 text-gray-500">{parseDataPtBr(p.data_pedido).toLocaleDateString("pt-BR")}</td>
                            <td className="px-4 py-2.5 text-center"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[p.status]||"bg-gray-100 text-gray-600"}`}>{statusLabel[p.status]||p.status}</span></td>
                            <td className="px-4 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={e => { e.stopPropagation(); abrirPedido(p); }} className="rounded p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                                <button onClick={e => { e.stopPropagation(); if (confirm(`Excluir pedido ${p.numero}?`)) { api.pedidos.delete(p.id).then(() => setPedidos(prev => prev.filter(x => x.id !== p.id))).catch(() => {}); } }} className="rounded p-1 text-gray-400 hover:text-red-600 hover:bg-red-50" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal dual-panel */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex gap-4 items-start justify-center bg-black/40 pt-8 px-4" onClick={() => { setViewing(null); setPedidoItens([]); setItensDist([]); }}>
          {/* Janela 1: Materiais do Pedido */}
          <div className="w-1/2 h-[90vh] rounded-xl bg-white shadow-2xl border-2 border-blue-200 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-blue-600 text-white px-5 py-4 rounded-t-xl">
              <div><h2 className="text-base font-semibold">Materiais do Pedido</h2><p className="mt-0.5 text-[11px] text-blue-100">{viewing.numero} — {lojaOf(viewing)?.nome||viewing.loja_nome||"—"}</p></div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col">
              <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
                <div><div className="text-xs uppercase text-gray-500">Nº do Pedido</div><div className="text-lg font-bold text-gray-900">{viewing.numero}</div></div>
                <div><div className="text-xs uppercase text-gray-500">Status</div><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${({importado:"bg-blue-100 text-blue-700",atendido:"bg-green-100 text-green-700",pendente:"bg-orange-100 text-orange-700"})[viewing.status]||"bg-gray-100 text-gray-600"}`}>{{importado:"Aguardando",atendido:"Atendido",pendente:"Pendente"}[viewing.status]||viewing.status}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div><span className="text-gray-400">CODIGO</span><p className="font-medium text-gray-800">{lojaOf(viewing)?.codigo || viewing.loja_codigo || "—"}</p></div>
                <div><span className="text-gray-400">LOJA</span><p className="font-medium text-gray-800">{lojaOf(viewing)?.nome || viewing.loja_nome || "—"}</p></div>
                <div><span className="text-gray-400">SOLICITANTE</span><p className="font-medium text-gray-800">{viewing.solicitante || "—"}</p></div>
                <div><span className="text-gray-400">SOLICITACAO</span><p className="font-medium text-gray-800">{parseDataPtBr(viewing.data_pedido).toLocaleDateString("pt-BR")}</p></div>
                {viewing.setor && <div><span className="text-gray-400">SETOR</span><p className="font-medium text-gray-800">{viewing.setor}</p></div>}
                {viewing.arquivo_pdf && <div><span className="text-gray-400">PDF</span><p className="font-medium text-gray-800 truncate">{viewing.arquivo_pdf}</p></div>}
              </div>
              <div className="mt-3">
                <h4 className="mb-2 text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Package className="h-4 w-4 text-blue-600"/>Materiais do Pedido</h4>
                {pedidoItens.length===0 && !(viewing.status==="atendido" && todosItens[viewing.id]?.length) ? <p className="text-xs text-gray-400 text-center py-8">Nenhum item</p> : (
                <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                  <thead><tr className="bg-gray-50 text-gray-500 uppercase"><th className="text-left px-3 py-2">Produto</th><th className="text-center px-3 py-2 w-24">Unidade</th><th className="text-center px-3 py-2 w-20">Qtd</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {(() => {
                          const dadosItens = viewing.status === "atendido" && todosItens[viewing.id]?.length ? todosItens[viewing.id] : pedidoItens;
                          if (dadosItens.length === 0) return <tr><td colSpan={3} className="text-center text-gray-400 py-4">Nenhum item</td></tr>;
                          const map = new Map<string, { unidade:string; qtd:number }>();
                          for (const item of dadosItens) {
                            const k = chaveItem(item);
                            const e = map.get(k);
                            if (e) e.qtd += Number(item.quantidade||1);
                            else map.set(k, { unidade:item.unidade||"Un", qtd:Number(item.quantidade||1) });
                          }
                      return Array.from(map.entries()).map(([nome, g]) => {
                        const prod = produtoMap.get(nome.toLowerCase());
                        return (
                          <tr key={nome} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-900">{nome}{!prod && <span className="ml-1 text-[10px] text-amber-500">(não cadastrado)</span>}</td>
                            <td className="px-3 py-1.5 text-center text-gray-500">{g.unidade}</td>
                            <td className="px-3 py-1.5 text-center font-bold text-gray-700">{g.qtd}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
                )}
              </div>
            </div>
          </div>

          {/* Janela 2: Saída — Almoxarifado → Loja */}
          <div className="w-1/2 h-[90vh] rounded-xl bg-white shadow-2xl border-2 border-emerald-200 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-emerald-600 text-white px-5 py-4 rounded-t-xl">
              <div><h2 className="text-base font-semibold">Saída — Almoxarifado → Loja</h2><p className="mt-0.5 text-[11px] text-emerald-100">{lojaOf(viewing)?.nome||viewing.loja_nome||"—"}</p></div>
              <button onClick={() => { setViewing(null); setPedidoItens([]); setItensDist([]); }} className="text-emerald-200 hover:text-white"><X className="h-4 w-4"/></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col">
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
                <div><div className="text-xs uppercase text-gray-500">Nº do Pedido</div><div className="text-lg font-bold text-gray-900">{viewing.numero}</div></div>
                <div><div className="text-xs uppercase text-gray-500">Status</div><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${({importado:"bg-blue-100 text-blue-700",atendido:"bg-green-100 text-green-700",pendente:"bg-orange-100 text-orange-700"})[viewing.status]||"bg-gray-100 text-gray-600"}`}>{{importado:"Aguardando",atendido:"Atendido",pendente:"Pendente"}[viewing.status]||viewing.status}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div><span className="text-gray-400">CODIGO</span><p className="font-medium text-gray-800">{lojaOf(viewing)?.codigo || viewing.loja_codigo || "—"}</p></div>
                <div><span className="text-gray-400">LOJA</span><p className="font-medium text-gray-800">{lojaOf(viewing)?.nome || viewing.loja_nome || "—"}</p></div>
                <div><span className="text-gray-400">SOLICITANTE</span><p className="font-medium text-gray-800">{viewing.solicitante || "—"}</p></div>
                <div><span className="text-gray-400">SOLICITACAO</span><p className="font-medium text-gray-800">{parseDataPtBr(viewing.data_pedido).toLocaleDateString("pt-BR")}</p></div>
                {viewing.setor && <div><span className="text-gray-400">SETOR</span><p className="font-medium text-gray-800">{viewing.setor}</p></div>}
                {viewing.arquivo_pdf && <div><span className="text-gray-400">PDF</span><p className="font-medium text-gray-800 truncate">{viewing.arquivo_pdf}</p></div>}
              </div>
              <div className="mt-3">
                <h4 className="mb-2 text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Scale className="h-4 w-4 text-emerald-600"/>Comparação com Estoque</h4>
                <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                  <thead><tr className="bg-gray-50 text-gray-500 uppercase"><th className="text-left px-3 py-2">Produto</th><th className="text-center px-3 py-2 w-24">Unidade</th><th className="text-center px-3 py-2 w-20">Qtd</th>{viewing.status !== "atendido" && <th className="text-center px-3 py-2 w-16">Ações</th>}</tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {(() => {
                      const map = new Map<string, { ids: number[]; unidade:string; qtd:number }>();
                      for (const item of pedidoItens) {
                       if (removed.has(item.id)) continue;
                       const k = chaveItem(item);
                       const e = map.get(k);
                       if (e) { e.qtd += Number(item.quantidade||1); e.ids.push(item.id); }
                       else map.set(k, { ids: [item.id], unidade:item.unidade||"Un", qtd:Number(item.quantidade||1) });
                      }
                      return Array.from(map.entries()).map(([nome, g]) => {
                       const prod = produtoMap.get(nome.toLowerCase());
                       const qtdItem = g.qtd;
                       return (
                         <tr key={nome} className="hover:bg-gray-50">
                           <td className="px-3 py-1.5 text-gray-900">{nome}{!prod && <span className="ml-1 text-[10px] text-amber-500">(não cadastrado)</span>}</td>
                            <td className="px-3 py-1.5 text-center text-gray-500">{g.unidade}</td>
                            <td className="px-3 py-1.5 text-center">
                              {viewing.status==="atendido" ? (
                                <span className="text-sm font-bold text-emerald-600">
                                  {(() => {
                                    const d = itensDist.find((dd:any) => (dd.produto_nome||"").trim().toLowerCase()===nome.toLowerCase())
                                      || itensDist.find((dd:any) => (dd.produto_nome||"").toLowerCase().includes(nome.toLowerCase().substring(0,10)));
                                    return d ? d.quantidade : 0;
                                  })()}
                                </span>
                              ) : (
                                <input type="number" min="0" name={`qtd-${nome}`} id={`qtd-${viewing.id}-${nome}`} key={`q-${viewing.id}-${nome}`} defaultValue={qtdsRef.current[nome] ?? qtdItem}
                                  onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) { qtdsRef.current[nome] = v; setQtdsVer(x => x+1); } }}
                                  className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm font-semibold" />
                              )}
                            </td>
                            {viewing.status !== "atendido" && (
                              <td className="px-3 py-1.5 text-center">
                                <button onClick={e => { e.stopPropagation(); setRemoved(p => { const s = new Set(p); for (const id of g.ids) s.add(id); return s; }); }} className="text-gray-400 hover:text-red-600" title="Remover item"><Trash2 className="h-3.5 w-3.5" /></button>
                              </td>
                            )}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
              {viewing.status !== "atendido" && (
                <button onClick={() => confirmar(viewing)} disabled={confirmando===viewing.id}
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm">
                  <Check className="h-5 w-5"/>{confirmando===viewing.id ? "Confirmando..." : "Confirmar Pedido"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
