import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowDownToLine, Plus, Pencil, Trash2, Layers, X } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type { Movimentacao, Produto, Loja } from "../lib/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";
import { renumerar } from "../lib/utils";

export default function Entradas() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [, setLojas] = useState<Loja[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Movimentacao | null>(null);
  const [form, setForm] = useState<{ produto_id: string; quantidade: number; preco_compra: number; unidade: number; data: string; cod_produto: string }>({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, data: hojeInput(), cod_produto: "" });
  const [lote, setLote] = useState(false);
  const [loteItens, setLoteItens] = useState<{ cod_produto: string; quantidade: number }[]>([{ cod_produto: "", quantidade: 1 }]);
  const [erro, setErro] = useState<string | null>(null);

  function resetForm() {
    setForm({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, data: hojeInput(), cod_produto: "" });
    setLote(false);
    setLoteItens([{ cod_produto: "", quantidade: 1 }]);
  }

  function hojeInput(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function loadData() {
    Promise.all([api.movimentacoes.list(), api.produtos.list(), api.lojas.list()])
      .then(([m, p, l]) => {
        const r = renumerar(p);
        const mapa = new Map(r.map(pp => [pp.id, pp.codigo]));
        setMovs(m.filter(x => x.tipo === "entrada").map(x => ({ ...x, produto_codigo: mapa.get(x.produto_id) || "" })).sort((a,b)=> a.quantidade - b.quantidade || Math.random()-0.5));
        setProdutos(r);
        setLojas(l);
        setErro(null);
      })
      .catch((e) => { console.error("[Entradas] falha ao carregar dados:", e); setErro("Nao foi possivel carregar as entradas."); });
  }
  useEffect(() => { loadData(); }, []);

  // Abre form automaticamente se veio com ?novo=true
  useEffect(() => {
    if (searchParams.get("novo") === "true") {
      const prodId = searchParams.get("produto");
      if (prodId) setForm(f => ({ ...f, produto_id: prodId }));
      setOpen(true);
    }
  }, [searchParams, produtos]);

  async function handleSave() {
    try {
      const p = produtos.find(pp => pp.id === Number(form.produto_id));
      // -- Entrada em Lote: uma movimentacao por linha do mesmo produto --
      if (lote && !editing) {
        const validas = loteItens.filter(i => i.cod_produto.trim());
        if (!form.produto_id) { alert("Selecione o produto."); return; }
        if (validas.length === 0) { alert("Adicione ao menos um item com Cod. Produto."); return; }
        if (validas.length > 20) { alert("Limite de 20 linhas por lote."); return; }
        if (validas.some(i => !Number.isFinite(Number(i.quantidade)) || Number(i.quantidade) <= 0)) {
          alert("Quantidades do lote devem ser numeros maiores que zero.");
          return;
        }
        let gravados = 0;
        const falhas: string[] = [];
        for (let idx = 0; idx < validas.length; idx++) {
          const item = validas[idx];
          try {
            await api.movimentacoes.create({
              tipo: "entrada",
              produto_id: Number(form.produto_id),
              quantidade: Number(item.quantidade),
              loja_origem_id: null,
              loja_destino_id: null,
              usuario_id: user?.id ?? null,
              observacao: `cod_produto:${item.cod_produto.trim()}`,
              produto_nome: p?.nome ?? null,
              preco_compra: form.preco_compra,
              unidade: form.unidade,
              data_movimento: form.data ? `${form.data}T12:00:00` : undefined,
              loja_origem_nome: null, loja_destino_nome: null,
            });
            gravados++;
          } catch (e: any) {
            console.error("[Lote] erro na linha", idx + 1, e);
            falhas.push(`Linha ${idx + 1} (${item.cod_produto.trim()}): ${e?.message || e}`);
          }
          if (idx < validas.length - 1) await new Promise(r => setTimeout(r, 80));
        }
        if (falhas.length > 0) {
          alert(`Lote concluido parcialmente.\n\nGravados: ${gravados}\nFalhas: ${falhas.length}\n\n${falhas.join("\n").slice(0, 800)}`);
        }
        setOpen(false);
        resetForm();
        loadData();
        return;
      }
      const qtdNum = Number(form.quantidade);
      if (!Number.isFinite(qtdNum) || qtdNum <= 0) {
        alert("Informe uma quantidade valida (maior que zero).");
        return;
      }
      const obsCod = form.cod_produto.trim() ? `cod_produto:${form.cod_produto.trim()}` : null;
      if (editing) {
        await api.movimentacoes.update(editing.id, {
          quantidade: qtdNum,
          produto_nome: p?.nome ?? null,
          unidade: form.unidade,
          observacao: obsCod,
        });
        setOpen(false);
        setEditing(null);
        resetForm();
        loadData();
        return;
      }
      const novo = await api.movimentacoes.create({
        tipo: "entrada",
        produto_id: Number(form.produto_id),
        quantidade: qtdNum,
        loja_origem_id: null,
        loja_destino_id: null,
        usuario_id: user?.id ?? null,
        observacao: obsCod,
        produto_nome: p?.nome ?? null,
        preco_compra: form.preco_compra,
        unidade: form.unidade,
        data_movimento: form.data ? `${form.data}T12:00:00` : undefined,
        loja_origem_nome: null, loja_destino_nome: null,
      });
      if (novo) setMovs((prev) => [...prev, novo].sort((a,b)=> a.quantidade - b.quantidade));
      setOpen(false);
      resetForm();
      loadData();
      if (searchParams.get("novo") === "true") navigate("/produtos");
    } catch (e: any) {
      console.error("[Entrada] erro", e, e?.stack);
      alert("Erro: " + (e instanceof Error ? e.message : String(e)) + "\n\nStack:\n" + (e?.stack || "").slice(0,800));
    }
  }

  const cols: Column<Movimentacao>[] = [
    { key: "id", label: "Codigo", width: "110px", render: (r) => {
      const p = produtos.find(pp => pp.id === r.produto_id);
      return p?.codigo || "—";
    }},
    { key: "produto_nome", label: "Produto", width: "auto", align: "center" },
    { key: "id", label: "Marca", width: "130px", align: "center", render: (r) => {
      const p = produtos.find(pp => pp.id === r.produto_id) || produtos.find(pp => pp.nome === r.produto_nome);
      return p?.marca || "—";
    }},
    { key: "id", label: "Modelo", width: "130px", align: "center", render: (r) => {
      const p = produtos.find(pp => pp.id === r.produto_id) || produtos.find(pp => pp.nome === r.produto_nome);
      return p?.modelo || "—";
    }},
    { key: "id", label: "Categoria", width: "150px", render: (r) => {
          const p = produtos.find(pp => pp.id === r.produto_id) || produtos.find(pp => pp.nome === r.produto_nome);
          return p?.categoria_nome || "—";
        }},
    { key: "id", label: "Cod. Produto", width: "130px", align: "center", render: (r) => {
      const m = r.observacao?.match(/^cod_produto:(.+)$/);
      return m?.[1] || "—";
    }},
        { key: "quantidade", label: "Quantidade", width: "120px", align: "center", render: (r) => r.quantidade },
    { key: "data_movimento", label: "Data", width: "120px", align: "center", render: (r) => new Date(r.data_movimento).toLocaleDateString("pt-BR") },
    { key: "id", label: "Acao", align: "center", width: "100px", render: (r) => (
      <div className="flex items-center justify-center gap-1">
        <button onClick={(e) => { e.stopPropagation(); setEditing(r); const codManual = r.observacao?.match(/^cod_produto:(.+)$/m)?.[1]?.trim() || ""; setForm({ produto_id: String(r.produto_id), quantidade: r.quantidade, preco_compra: (r as any).preco_compra || 0, unidade: (r as any).unidade || 1, data: (r as any).data_movimento ? String(r.data_movimento).slice(0, 10) : hojeInput(), cod_produto: codManual }); setOpen(true); }}
          className="rounded p-1.5 text-blue-600 hover:bg-blue-50 transition" title="Editar entrada">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={async (e) => { e.stopPropagation(); if (confirm(`Excluir entrada #${r.id}?`)) {
          try {
            await api.movimentacoes.delete(r.id);
            setMovs(prev => prev.filter(m => m.id !== r.id));
          } catch (err) {
            alert("Erro ao excluir entrada: " + String(err));
          }
        }}}
          className="rounded p-1.5 text-red-600 hover:bg-red-50 transition" title="Excluir entrada">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    )},
  ];
  return (
    <Layout title="Entradas" subtitle="Registre entradas de mercadorias no estoque">
      <PageHeader
        title="Entradas"
        subtitle="Historico de entradas de produtos"
        icon={<ArrowDownToLine className="h-5 w-5" />}
      />
      {erro && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">{erro}</div>}
      <DataTable<Movimentacao>
        data={movs}
        columns={cols}
        searchKeys={["produto_nome", "produto_codigo"]}
        searchPlaceholder="Buscar por produto ou codigo..."
        emptyMessage="Nenhuma entrada registrada"
      />

      <Window
        open={open}
        onClose={() => { setOpen(false); setEditing(null); resetForm(); if (searchParams.get("novo") === "true") navigate("/produtos"); }}
        title={editing ? "Editar Entrada" : "Nova Entrada"}
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => { setOpen(false); setEditing(null); resetForm(); if (searchParams.get("novo") === "true") navigate("/produtos"); }}>Cancelar</Button>
          <Button onClick={handleSave}>{editing ? "Atualizar" : lote ? "Registrar Entradas em Lote" : "Registrar Entrada"}</Button>
        </>}
      >
        <div className="space-y-3 py-1">
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Codigo</label>
            <input value={form.produto_id ? (produtos.find(pp => pp.id === Number(form.produto_id))?.codigo || "—") : "—"} readOnly
              className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Produto</label>
            <input value={produtos.find(pp => pp.id === Number(form.produto_id))?.nome || "—"} readOnly
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
            <input value={form.cod_produto} onChange={(e) => setForm({ ...form, cod_produto: e.target.value })} disabled={lote}
              placeholder={lote ? "Use as linhas do lote" : "Digite o codigo..."}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${lote ? "border-gray-200 bg-gray-50 text-gray-400" : "border-gray-300"}`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Quantidade</label>
            <input type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })} disabled={lote}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm text-center ${lote ? "border-gray-200 bg-gray-50 text-gray-400" : "border-gray-300"}`} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Data</label>
            <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>

        {/* -- Entrada em Lote (mesmo produto) -- */}
        {!editing && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <button onClick={() => setLote(!lote)} className="flex items-center gap-2 w-full">
              <span className={`flex h-4 w-7 items-center rounded-full transition ${lote ? "bg-blue-600" : "bg-gray-300"}`}>
                <span className={`h-3 w-3 rounded-full bg-white transition-transform mt-0.5 ${lote ? "translate-x-[14px]" : "ml-0.5"}`} style={{ marginLeft: lote ? "14px" : "2px" }} />
              </span>
              <Layers className={`h-4 w-4 ${lote ? "text-blue-600" : "text-gray-400"}`} />
              <span className={`text-sm font-medium ${lote ? "text-blue-700" : "text-gray-600"}`}>
                Entrada em Lote (mesmo produto)
              </span>
              <span className="ml-auto text-[11px] text-gray-400">{lote ? `${loteItens.length} linha(s)` : "varias entradas de uma vez"}</span>
            </button>

            {lote && (
              <div className="mt-3 space-y-2">
                {loteItens.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 text-right text-[11px] text-gray-400">{i + 1}.</span>
                    <input value={item.cod_produto}
                      onChange={(e) => setLoteItens(prev => prev.map((x, j) => j === i ? { ...x, cod_produto: e.target.value } : x))}
                      placeholder="Cod. Produto"
                      className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
                    <input type="number" min="1" value={item.quantidade}
                      onChange={(e) => setLoteItens(prev => prev.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x))}
                      className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm text-center" title="Quantidade" />
                    <button onClick={() => setLoteItens(prev => prev.filter((_, j) => j !== i))}
                      disabled={loteItens.length === 1}
                      className={`rounded p-1.5 transition ${loteItens.length === 1 ? "text-gray-200 cursor-not-allowed" : "text-red-500 hover:bg-red-50"}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setLoteItens(prev => [...prev, { cod_produto: "", quantidade: 1 }])}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition">
                  <Plus className="h-3.5 w-3.5" /> Adicionar linha
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </Window>
    </Layout>
  );
}
