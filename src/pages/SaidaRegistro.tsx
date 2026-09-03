import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowUpFromLine, Plus, Pencil, Trash2, ChevronDown, Check, Layers, X, Search } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type { Movimentacao, Produto, Loja, Usuario } from "../lib/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";
import { renumerar } from "../lib/utils";

type LoteItem = { produto_id: string; cod_produto: string; quantidade: number };

export default function SaidaRegistro() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [entradasCod, setEntradasCod] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Movimentacao | null>(null);
  const [form, setForm] = useState<{ produto_id: string; quantidade: number; preco_compra: number; unidade: number; solicitante: string; data: string; cod_produto: string }>({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, solicitante: "", data: hojeInput(), cod_produto: "" });
  const [lote, setLote] = useState(false);
  const [loteItens, setLoteItens] = useState<LoteItem[]>([{ produto_id: "", cod_produto: "", quantidade: 1 }]);
  const [solicitantes, setSolicitantes] = useState<string[]>([]);
  const [novoSolicitanteOpen, setNovoSolicitanteOpen] = useState(false);
  const [novoSolicitanteNome, setNovoSolicitanteNome] = useState("");
  const [codProdutosComSaida, setCodProdutosComSaida] = useState<Set<string>>(new Set());
  const [codPickerOpen, setCodPickerOpen] = useState(false);
  const [codPickerSearch, setCodPickerSearch] = useState("");
  const [codLoteIdx, setCodLoteIdx] = useState<number | null>(null);
  const [itensAdicionais, setItensAdicionais] = useState<{ produto_id: string; cod_produto: string; quantidade: number }[]>([]);
  const [adicionalIdx, setAdicionalIdx] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function resetForm() {
    setForm({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, solicitante: "", data: hojeInput(), cod_produto: "" });
    setLote(false);
    setLoteItens([{ produto_id: "", cod_produto: "", quantidade: 1 }]);
    setItensAdicionais([]);
  }

  function hojeInput(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function openEdit(m: Movimentacao) {
    setEditing(m);
    const codManual = m.observacao?.match(/^cod_produto:(.+)$/m)?.[1]?.trim() || "";
    setForm({
      produto_id: String(m.produto_id ?? ""),
      quantidade: m.quantidade,
      preco_compra: (m as any).preco_compra ?? 0,
      unidade: (m as any).unidade ?? 1,
      solicitante: m.observacao?.match(/por ([^-]+) - /)?.[1]?.trim() || "",
      data: String(m.data_movimento).slice(0, 10) || hojeInput(),
      cod_produto: codManual,
    });
    setOpen(true);
  }

  function addSolicitante() {
    if (!novoSolicitanteNome.trim()) return;
    const lista = [...solicitantes, novoSolicitanteNome.trim()];
    setSolicitantes(lista);
    localStorage.setItem("almox_solicitantes", JSON.stringify(lista));
    setForm({ ...form, solicitante: novoSolicitanteNome.trim() });
    setNovoSolicitanteNome("");
    setNovoSolicitanteOpen(false);
  }

  function loadData() {
    Promise.all([api.movimentacoes.list(), api.produtos.list(), api.lojas.list(), api.usuarios.list()])
      .then(([m, p, l, u]) => {
        const r = renumerar(p);
        const mapa = new Map(r.map(pp => [pp.id, pp.codigo]));
                  setProdutos(r);
          setLojas(l);
          setUsuarios(u);
          setEntradasCod(m.filter(x => x.tipo === "entrada" && !!x.observacao?.match(/cod_produto:(.+)/)));
          const saidas = m.filter(x => x.tipo === "saida");
          const codsComSaida = new Set<string>();
          for (const s of saidas) {
            const match = s.observacao?.match(/cod_produto:(.+)/);
            if (match) codsComSaida.add(match[1].trim());
          }
          setCodProdutosComSaida(codsComSaida);
          setMovs(m.filter(x => x.tipo === "saida" && x.observacao?.startsWith("Saida manual")).map(x => ({ ...x, 
produto_codigo: mapa.get(x.produto_id) || "" })));
        setErro(null);
      })
      .catch((e) => { console.error("[SaidaRegistro] falha ao carregar dados:", e); setErro("Nao foi possivel carregar as saidas."); });
  }
  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (searchParams.get("novo") === "true") {
      const prodId = searchParams.get("produto");
      if (prodId) setForm(f => ({ ...f, produto_id: prodId }));
      setOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let salvos: string[] = [];
    try {
      salvos = JSON.parse(localStorage.getItem("almox_solicitantes") || "[]");
      if (!Array.isArray(salvos)) salvos = [];
    } catch { salvos = []; }
    setSolicitantes(salvos);
  }, []);

  // Auto-preenche cod_produto de mesmo modelo
  useEffect(() => {
    if (!form.produto_id || form.cod_produto) return;
    const sel = produtos.find(p => p.id === Number(form.produto_id));
    if (!sel?.modelo) return;
    const outro = produtos.find(p => p.modelo === sel.modelo && p.id !== sel.id);
    if (outro?.codigo) setForm(f => ({ ...f, cod_produto: outro.codigo }));
  }, [form.produto_id, produtos]);

  // Pre-configuracao: quando seleciona impressora, preenche itens adicionais com produtos da mesma categoria
  useEffect(() => {
    if (!form.produto_id || editing || lote) return;
    const sel = produtos.find(p => p.id === Number(form.produto_id));
    if (!sel) return;
    const isImp = (sel.nome || "").toLowerCase().includes("impressora") || (sel.categoria_nome || "").toLowerCase().includes("impressora");
    if (!isImp) return;
    // Busca produtos da mesma categoria (exceto o selecionado) que tenham entrada com cod_produto
    const codsValidos = new Set(entradasCod.map(m => m.observacao?.match(/cod_produto:(.+)/)?.[1]?.trim()).filter(Boolean));
    const relacionados = produtos.filter(p => p.id !== sel.id && p.ativo && p.categoria_id === sel.categoria_id && codsValidos.has(p.codigo));
    if (relacionados.length === 0) return;
    // Preenche itens adicionais
    setItensAdicionais(relacionados.map(p => ({ produto_id: String(p.id), cod_produto: p.codigo || "", quantidade: 1 })));
  }, [form.produto_id, editing, lote]);

  const gruposCod = useMemo(() => {
    type ItemCod = { codigo: string; produto: Produto; mov: Movimentacao | null };
    const map = new Map<string, ItemCod[]>();
    // Adiciona produtos que tem entrada com cod_produto
    for (const mov of entradasCod) {
      const code = mov.observacao?.match(/cod_produto:(.+)/)?.[1]?.trim();
      if (!code) continue;
      const prod = produtos.find(pp => pp.id === mov.produto_id) || produtos.find(pp => pp.nome === mov.produto_nome);
      if (!prod) continue;
      const key = `${prod.nome} — ${prod.marca || "Sem marca"} / ${prod.modelo || "Sem modelo"}`;
      if (!map.has(key)) map.set(key, []);
      if (!map.get(key)!.some(x => x.codigo === code)) map.get(key)!.push({ codigo: code, produto: prod, mov });
    }
    // Adiciona produtos ativos que NAO tem entrada (usa codigo proprio)
    for (const p of produtos.filter(p => p.ativo && p.codigo)) {
      const key = `${p.nome} — ${p.marca || "Sem marca"} / ${p.modelo || "Sem modelo"}`;
      if (!map.has(key)) map.set(key, []);
      if (!map.get(key)!.some(x => x.codigo === p.codigo)) map.get(key)!.push({ codigo: p.codigo, produto: p, mov: null });
    }
    let entries = Array.from(map.entries());
    const term = codPickerSearch.trim().toLowerCase();
    if (term) {
      entries = entries.map(([k, arr]) => [k, arr.filter(x => x.codigo.toLowerCase().includes(term) || x.produto.nome.toLowerCase().includes(term) || k.toLowerCase().includes(term))] as [string, ItemCod[]]).filter(([, arr]) => arr.length > 0);
    }
    return entries;
  }, [produtos, entradasCod, codPickerSearch]);

  function selecionarCod(item: { codigo: string; produto: Produto }, loteIdx: number | null = null, adicIdx: number | null = null) {
    if (loteIdx !== null) {
      setLoteItens(prev => prev.map((x, j) => j === loteIdx ? { ...x, produto_id: String(item.produto.id), cod_produto: item.codigo } : x));
      setCodLoteIdx(null);
    } else if (adicIdx !== null) {
      setItensAdicionais(prev => prev.map((x, j) => j === adicIdx ? { ...x, produto_id: String(item.produto.id), cod_produto: item.codigo } : x));
      setAdicionalIdx(null);
    } else {
      setForm(f => ({ ...f, produto_id: String(item.produto.id), cod_produto: item.codigo }));
      setCodPickerOpen(false);
    }
  }

  async function handleSave() {
    try {
      // ── Saida em Lote (multi-produto) ──
      if (lote && !editing) {
        const validas = loteItens.filter(i => i.produto_id && i.cod_produto.trim());
        if (validas.length === 0) { alert("Adicione ao menos um item com produto e Cod. Produto."); return; }
        if (validas.length > 20) { alert("Limite de 20 linhas por lote."); return; }
        if (validas.some(i => !Number.isFinite(Number(i.quantidade)) || Number(i.quantidade) <= 0)) {
          alert("Quantidades devem ser numeros maiores que zero."); return;
        }
        let gravados = 0;
        const falhas: string[] = [];
        for (const item of validas) {
          const p = produtos.find(pp => pp.id === Number(item.produto_id));
          if (!p) { falhas.push(`Produto ID ${item.produto_id} nao encontrado`); continue; }
          try {
            await api.movimentacoes.create({
              tipo: "saida",
              produto_id: p.id,
              produto_nome: p.nome,
              quantidade: Number(item.quantidade),
              loja_origem_id: user?.loja_id || null,
              loja_origem_nome: lojas.find(l => l.id === user?.loja_id)?.nome || null,
              loja_destino_id: null,
              loja_destino_nome: null,
              usuario_id: user?.id ?? null,
              observacao: `Saida manual por ${form.solicitante || "desconhecido"} - ${p.nome}\ncod_produto:${item.cod_produto.trim()}`,
              preco_compra: p.preco_compra,
              unidade: Number(p.unidade) || 1,
              data_movimento: form.data ? `${form.data}T12:00:00` : undefined,
            });
            gravados++;
          } catch (e: any) {
            falhas.push(`${p.nome} (${item.cod_produto}): ${e?.message || e}`);
          }
        }
        if (falhas.length > 0) {
          alert(`Lote concluido parcialmente.\n\nGravados: ${gravados}\nFalhas: ${falhas.length}\n\n${falhas.join("\n").slice(0, 800)}`);
        }
        setOpen(false);
        setEditing(null);
        resetForm();
        loadData();
        if (searchParams.get("novo") === "true") navigate("/produtos");
        return;
      }
      // ── Saida unica ──
      const p = produtos.find(pp => pp.id === Number(form.produto_id));
      if (!p) return;
      const qtdNum = Number(form.quantidade);
      if (!Number.isFinite(qtdNum) || qtdNum <= 0) { alert("Informe uma quantidade valida."); return; }
      const obsParts = [`Saida manual por ${form.solicitante || "desconhecido"} - ${p.nome}`];
      if (form.cod_produto.trim()) obsParts.push(`cod_produto:${form.cod_produto.trim()}`);
      const obs = obsParts.join("\n");
      if (editing?.id) {
        await api.movimentacoes.update(editing.id, {
          produto_id: Number(form.produto_id),
          produto_nome: p.nome,
          quantidade: qtdNum,
          preco_compra: form.preco_compra,
          unidade: form.unidade,
          observacao: obs,
        });
      } else {
        const novo = await api.movimentacoes.create({
          tipo: "saida",
          produto_id: p.id,
          produto_nome: p.nome,
          quantidade: qtdNum,
          loja_origem_id: user?.loja_id || null,
          loja_origem_nome: lojas.find(l => l.id === user?.loja_id)?.nome || null,
          loja_destino_id: null,
          loja_destino_nome: null,
          usuario_id: user?.id ?? null,
          observacao: obs,
          preco_compra: form.preco_compra,
          unidade: form.unidade,
          data_movimento: form.data ? `${form.data}T12:00:00` : undefined,
        });
        if (novo) setMovs((prev) => [novo, ...prev]);
        // ── Salvar itens adicionais ──
        const validasAdic = itensAdicionais.filter(i => i.produto_id && i.quantidade > 0);
        for (const item of validasAdic) {
          const pa = produtos.find(pp => pp.id === Number(item.produto_id));
          if (!pa) continue;
          try {
            await api.movimentacoes.create({
              tipo: "saida",
              produto_id: pa.id,
              produto_nome: pa.nome,
              quantidade: Number(item.quantidade),
              loja_origem_id: user?.loja_id || null,
              loja_origem_nome: lojas.find(l => l.id === user?.loja_id)?.nome || null,
              loja_destino_id: null,
              loja_destino_nome: null,
              usuario_id: user?.id ?? null,
              observacao: `Saida manual por ${form.solicitante || "desconhecido"} - ${pa.nome}\ncod_produto:${item.cod_produto.trim()}\nvia:${p.nome}`,
              preco_compra: pa.preco_compra,
              unidade: Number(pa.unidade) || 1,
              data_movimento: form.data ? `${form.data}T12:00:00` : undefined,
            });
          } catch (e: any) {
            console.error("[Adicionais] erro ao dar saida em", pa.nome, e);
          }
        }
      }
      setOpen(false);
      setEditing(null);
      resetForm();
      loadData();
      if (searchParams.get("novo") === "true") navigate("/produtos");
    } catch { alert("Erro ao registrar saida"); }
  }

  const columns: Column<Movimentacao>[] = [
    { key: "id", label: "Codigo", width: "90px", render: (r) => {
      const p = produtos.find(pp => pp.id === r.produto_id);
      return p?.codigo || "—";
    }},
    { key: "produto_nome", label: "Produto", width: "200px", align: "center", render: (r) => (
      <div className="mx-auto max-w-[190px] truncate" title={r.produto_nome || ""}>{r.produto_nome || "—"}</div>
    ) },
    { key: "id", label: "Marca", width: "110px", align: "center", render: (r) => {
      const p = produtos.find(pp => pp.id === r.produto_id) || produtos.find(pp => pp.nome === r.produto_nome);
      return p?.marca || "—";
    }},
    { key: "id", label: "Modelo", width: "110px", align: "center", render: (r) => {
      const p = produtos.find(pp => pp.id === r.produto_id) || produtos.find(pp => pp.nome === r.produto_nome);
      return p?.modelo || "—";
    }},
    { key: "id", label: "Categoria", width: "130px", render: (r) => {
      const p = produtos.find(pp => pp.id === r.produto_id) || produtos.find(pp => pp.nome === r.produto_nome);
      return p?.categoria_nome || "—";
    }},
    { key: "id", label: "Cod. Produto", width: "120px", align: "center", render: (r) => {
      const m = r.observacao?.match(/^cod_produto:(.+)$/m);
      return m?.[1] || "—";
    }},
    { key: "quantidade", label: "Quantidade", width: "100px", align: "center" },
    { key: "observacao", label: "Solicitante", width: "140px", align: "center", render: (r) => {
      const match = r.observacao?.match(/por ([^-]+) - /);
      return match?.[1]?.trim() || "—";
    } },
    { key: "data_movimento", label: "Data Saida", width: "100px", align: "center", render: (r) => new Date(r.data_movimento).toLocaleDateString("pt-BR") },
    { key: "acoes", label: "Acao", align: "center", width: "100px", render: (r) => (
      <div className="flex items-center justify-center gap-1">
        <button onClick={(e) => { e.stopPropagation(); openEdit(r); }}
          className="rounded p-1.5 text-blue-600 hover:bg-blue-50 transition" title="Editar saida">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={async () => {
          if (!confirm(`Excluir "${r.produto_nome}" (qtd: ${r.quantidade}) permanentemente?`)) return;
          try { await api.movimentacoes.delete(r.id); setMovs(prev => prev.filter(m => m.id !== r.id)); }
          catch (e) { alert("Erro: " + String(e)); }
        }} className="rounded p-1.5 text-red-600 hover:bg-red-50 transition" title="Excluir saida">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    )},
  ];

  return (
    <Layout title="Registro de Saida" subtitle="Registre saidas manuais de mercadorias">
      <PageHeader
        title="Saida"
        subtitle="Registre saida de produtos do estoque"
        icon={<ArrowUpFromLine className="h-5 w-5" />}
      />
      {erro && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">{erro}</div>}
      <DataTable<Movimentacao>
        data={movs}
        columns={columns}
        searchKeys={["produto_nome", "produto_codigo"]}
        searchPlaceholder="Buscar por produto ou codigo..."
        emptyMessage="Nenhuma saida registrada"
      />

      <Window
        open={open}
        onClose={() => { setOpen(false); setEditing(null); resetForm(); if (searchParams.get("novo") === "true") navigate("/produtos"); }}
        title={editing ? "Editar Saida" : "Nova Saida"}
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); resetForm(); if (searchParams.get("novo") === "true") navigate("/produtos"); }}>Cancelar</Button>
          <Button onClick={handleSave}>{editing ? "Atualizar" : lote ? "Registrar Saidas em Lote" : "Registrar Saida"}</Button>
        </>}
      >
        <div className="space-y-3 py-1">
          {/* ── Saida unica ── */}
          {form.produto_id && !editing && (
            <>
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Codigo</label>
                  <input value={form.produto_id ? (produtos.find(pp => pp.id === Number(form.produto_id))?.codigo || "—") : "—"} readOnly
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Produto</label>
                  <input value={form.produto_id ? (produtos.find(pp => pp.id === Number(form.produto_id))?.nome || "—") : "—"} readOnly
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Marca</label>
                  <input value={form.produto_id ? (produtos.find(pp => pp.id === Number(form.produto_id))?.marca || "—") : "—"} readOnly
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Modelo</label>
                  <input value={form.produto_id ? (produtos.find(pp => pp.id === Number(form.produto_id))?.modelo || "—") : "—"} readOnly
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Categoria</label>
                  <input value={form.produto_id ? (produtos.find(pp => pp.id === Number(form.produto_id))?.categoria_nome || "—") : "—"} readOnly
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cod. Produto</label>
                  <button type="button" onClick={() => { setCodPickerSearch(""); setCodPickerOpen(true); }}
                    className={`mt-1 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm text-left border-gray-300 bg-white hover:border-blue-400 ${form.cod_produto ? "text-gray-900" : "text-gray-400"}`}>
                    <span className="truncate">{form.cod_produto || "Selecione..."}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                  </button>
                  {form.cod_produto && (() => {
                    const prod = produtos.find(pp => pp.id === Number(form.produto_id));
                    if (!prod) return <p className="mt-0.5 text-[11px] text-red-500">Produto nao encontrado</p>;
                    return <p className="mt-0.5 text-[11px] text-green-600">✓ {prod.nome} — {form.cod_produto}</p>;
                  })()}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Quantidade</label>
                  <input type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Data Saida</label>
                  <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              </div>
              {/* ── Itens Adicionais ── */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Itens Adicionais</span>
                  <span className="text-[11px] text-gray-400">{itensAdicionais.length} item(s)</span>
                </div>
                {itensAdicionais.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {itensAdicionais.map((item, i) => {
                      const prod = item.produto_id ? produtos.find(p => p.id === Number(item.produto_id)) : null;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-5 text-right text-[11px] text-gray-400">{i + 1}.</span>
                          <button type="button" onClick={() => { setCodPickerSearch(""); setAdicionalIdx(i); }}
                            className={`flex-1 rounded border px-2 py-1.5 text-sm text-left truncate ${item.cod_produto ? "border-gray-300 bg-white text-gray-900" : "border-gray-300 bg-white text-gray-400"}`}>
                            {prod ? `${prod.nome} — ${item.cod_produto}` : item.cod_produto || "Selecionar produto..."}
                          </button>
                          <input type="number" min="1" value={item.quantidade}
                            onChange={(e) => setItensAdicionais(prev => prev.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x))}
                            className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm text-center" title="Quantidade" />
                          <button onClick={() => setItensAdicionais(prev => prev.filter((_, j) => j !== i))}
                            className="rounded p-1.5 text-red-500 hover:bg-red-50 transition">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button onClick={() => setItensAdicionais(prev => [...prev, { produto_id: "", cod_produto: "", quantidade: 1 }])} type="button"
                  className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition">
                  <Plus className="h-3.5 w-3.5" /> Adicionar item
                </button>
              </div>
            </>
          )}

          {/* ── Saida em Lote (multi-produto) ── */}
          {!editing && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <button onClick={() => setLote(!lote)} type="button" className="flex items-center gap-2 w-full">
                <span className={`flex h-4 w-7 items-center rounded-full transition ${lote ? "bg-blue-600" : "bg-gray-300"}`}>
                  <span className={`h-3 w-3 rounded-full bg-white transition-transform mt-0.5 ${lote ? "translate-x-[14px]" : "ml-0.5"}`} style={{ marginLeft: lote ? "14px" : "2px" }} />
                </span>
                <Layers className={`h-4 w-4 ${lote ? "text-blue-600" : "text-gray-400"}`} />
                <span className={`text-sm font-medium ${lote ? "text-blue-700" : "text-gray-600"}`}>
                  Saida em Lote (multiplos produtos)
                </span>
                <span className="ml-auto text-[11px] text-gray-400">{lote ? `${loteItens.length} linha(s)` : "varias saidas de uma vez"}</span>
              </button>

              {lote && (
                <div className="mt-3 space-y-2">
                  {loteItens.map((item, i) => {
                    const prod = item.produto_id ? produtos.find(p => p.id === Number(item.produto_id)) : null;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 text-right text-[11px] text-gray-400">{i + 1}.</span>
                        <button type="button" onClick={() => { setCodPickerSearch(""); setCodLoteIdx(i); }}
                          className={`flex-1 rounded border px-2 py-1.5 text-sm text-left truncate ${item.cod_produto ? "border-gray-300 bg-white text-gray-900" : "border-gray-300 bg-white text-gray-400"}`}>
                          {prod ? `${prod.nome} — ${item.cod_produto}` : item.cod_produto || "Selecionar produto + codigo..."}
                        </button>
                        <input type="number" min="1" value={item.quantidade}
                          onChange={(e) => setLoteItens(prev => prev.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x))}
                          className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm text-center" title="Quantidade" />
                        <button onClick={() => setLoteItens(prev => prev.filter((_, j) => j !== i))}
                          disabled={loteItens.length === 1}
                          className={`rounded p-1.5 transition ${loteItens.length === 1 ? "text-gray-200 cursor-not-allowed" : "text-red-500 hover:bg-red-50"}`}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  <button onClick={() => setLoteItens(prev => [...prev, { produto_id: "", cod_produto: "", quantidade: 1 }])} type="button"
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition">
                    <Plus className="h-3.5 w-3.5" /> Adicionar linha
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Editando saida unica (mostra campos preenchidos) ── */}
          {editing && (
            <>
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Codigo</label>
                  <input value={form.produto_id ? (produtos.find(pp => pp.id === Number(form.produto_id))?.codigo || "—") : "—"} readOnly
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Produto</label>
                  <input value={form.produto_id ? (produtos.find(pp => pp.id === Number(form.produto_id))?.nome || "—") : "—"} readOnly
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cod. Produto</label>
                  <input value={form.cod_produto} onChange={(e) => setForm({ ...form, cod_produto: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Quantidade</label>
                  <input type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Data Saida</label>
                  <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante</label>
              <button type="button" onClick={() => setNovoSolicitanteOpen(true)}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-left transition flex items-center gap-2 overflow-visible ${form.solicitante ? "border-gray-300 text-gray-900" : "border-gray-300 text-gray-400"} hover:border-blue-400`}>
                {form.solicitante && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 shrink-0">{form.solicitante.charAt(0).toUpperCase()}</span>
                )}
                <span className="flex-1 whitespace-nowrap overflow-visible">{form.solicitante || "Selecione um solicitante..."}</span>
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </Window>

      {/* Window: Selecionar Cod. Produto */}
      <Window open={codPickerOpen || codLoteIdx !== null || adicionalIdx !== null} onClose={() => { setCodPickerOpen(false); setCodLoteIdx(null); setAdicionalIdx(null); setCodPickerSearch(""); }}
        title={adicionalIdx !== null ? `Produto Adicional — Linha ${adicionalIdx + 1}` : codLoteIdx !== null ? `Cod. Produto — Linha ${codLoteIdx + 1}` : "Selecionar Cod. Produto"} size="lg">
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={codPickerSearch} onChange={e => setCodPickerSearch(e.target.value)} placeholder="Buscar por codigo, nome, marca ou modelo..." className="w-full rounded-lg border border-gray-300 bg-gray-50 pl-9 pr-3 py-2 text-sm focus:border-blue-400 focus:bg-white outline-none" autoFocus />
          </div>
          <div className="max-h-80 overflow-y-auto space-y-3">
            {gruposCod.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">Nenhum produto encontrado<br/><span className="text-xs">Cadastre produtos com codigo primeiro</span></div>
            ) : gruposCod.map(([grupo, arr]) => (
              <div key={grupo} className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 border-b border-gray-200 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-[10px] font-bold text-blue-700">{arr.length}</span>
                  <span className="truncate">{grupo}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {arr.map(({ codigo, produto, mov }) => {
                    const temSaida = mov && codProdutosComSaida.has(codigo);
                      return (
                        <button key={`${produto.id}-${codigo}`} type="button" onClick={() => {
                          if (adicionalIdx !== null) selecionarCod({ codigo, produto }, null, adicionalIdx);
                          else if (codLoteIdx !== null) selecionarCod({ codigo, produto }, codLoteIdx);
                          else selecionarCod({ codigo, produto });
                        }}
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${temSaida ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-blue-50"}`}>
                          <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-mono ${temSaida ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>{codigo}</span>
                          <span className="flex-1 truncate text-sm text-gray-900">{produto.nome}</span>
                          <span className="hidden sm:inline text-xs text-gray-500">{produto.marca} / {produto.modelo}</span>
                          {temSaida && <span className="text-[10px] font-medium text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">JA SAIU</span>}
                        </button>
                      );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Window>

      {/* Window: Novo Solicitante */}
      <Window open={novoSolicitanteOpen} onClose={() => setNovoSolicitanteOpen(false)} title="Solicitantes" size="sm"
        footer={<><Button variant="secondary" onClick={() => setNovoSolicitanteOpen(false)}>Fechar</Button></>}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input type="text" value={novoSolicitanteNome} onChange={(e) => setNovoSolicitanteNome(e.target.value)}
              placeholder="Novo solicitante..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 outline-none" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") addSolicitante(); }} />
            <Button onClick={addSolicitante} disabled={!novoSolicitanteNome.trim()}>Adicionar</Button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {usuarios.map((u) => (
              <div key={u.id} onClick={() => { setForm({ ...form, solicitante: u.nome }); setNovoSolicitanteOpen(false); }}
                className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition ${form.solicitante === u.nome ? "bg-blue-50 border border-blue-200" : "border border-gray-200 hover:bg-gray-50"}`}>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">{u.nome.charAt(0).toUpperCase()}</span>
                  <span className="text-sm text-gray-700">{u.nome}</span>
                </div>
                {form.solicitante === u.nome && <Check className="h-4 w-4 text-blue-600" />}
              </div>
            ))}
            {solicitantes.map((s) => (
              <div key={s} onClick={() => { setForm({ ...form, solicitante: s }); setNovoSolicitanteOpen(false); }}
                className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition ${form.solicitante === s ? "bg-blue-50 border border-blue-200" : "border border-gray-200 hover:bg-gray-50"}`}>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">{s.charAt(0).toUpperCase()}</span>
                  <span className="text-sm text-gray-700">{s}</span>
                </div>
                <div className="flex items-center gap-2">
                  {form.solicitante === s && <Check className="h-4 w-4 text-blue-600" />}
                  <button type="button" onClick={(e) => {
                    e.stopPropagation();
                    const nova = solicitantes.filter(x => x !== s);
                    setSolicitantes(nova);
                    localStorage.setItem("almox_solicitantes", JSON.stringify(nova));
                    if (form.solicitante === s) setForm({ ...form, solicitante: "" });
                  }} className="text-gray-400 hover:text-red-500 p-1" title="Excluir">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Window>
    </Layout>
  );
}
