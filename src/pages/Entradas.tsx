import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowDownToLine, Plus, Pencil, Trash2 } from "lucide-react";
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
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Movimentacao | null>(null);
  const [form, setForm] = useState<{ produto_id: string; quantidade: number; preco_compra: number; unidade: number; data: string }>({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, data: hojeInput() });

  function hojeInput(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getFatorUnidade(prod?: Produto): number {
    if (!prod) return 1;
    const u = prod.unidade || "";
    if (u.includes(" / ")) return Number(u.split(" / ")[1]) || 1;
    const map: Record<string, number> = {un:1,cx:12,pct:100,rl:50,kg:1,lt:1,mt:1,dz:12,resma:500,par:2,pc:1,jogo:1,ct:1};
    return map[u] ?? 1;
  }

  function loadData() {
    Promise.all([api.movimentacoes.list(), api.produtos.list(), api.lojas.list()])
      .then(([m, p, l]) => {
        const r = renumerar(p);
        const mapa = new Map(r.map(pp => [pp.id, pp.codigo]));
        setMovs(m.filter(x => x.tipo === "entrada").map(x => ({ ...x, produto_codigo: mapa.get(x.produto_id) || "" })));
        setProdutos(r);
        setLojas(l);
      })
      .catch(() => { setMovs([]); setProdutos([]); setLojas([]); });
  }
  useEffect(() => { loadData(); }, []);

  // Abre form automaticamente se veio com ?novo=true
  useEffect(() => {
    if (searchParams.get("novo") === "true") {
      const prodId = searchParams.get("produto");
      if (prodId) setForm(f => ({ ...f, produto_id: prodId }));
      setOpen(true);
    }
  }, [searchParams]);

  async function handleSave() {
    try {
      const p = produtos.find(pp => pp.id === Number(form.produto_id));
      if (editing) {
        const upd = await api.movimentacoes.update(editing.id, {
          quantidade: Number(form.quantidade),
          produto_nome: p?.nome ?? null,
          unidade: form.unidade,
        });
        if (upd) setMovs((prev) => prev.map(x => x.id === editing.id ? { ...x, ...upd } : x));
        setOpen(false);
        setEditing(null);
        setForm({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, data: hojeInput() });
        return;
      }
      const novo = await api.movimentacoes.create({
        tipo: "entrada",
        produto_id: Number(form.produto_id),
        quantidade: Number(form.quantidade),
        loja_origem_id: null,
        loja_destino_id: null,
        usuario_id: user?.id ?? null,
        observacao: null,
        produto_nome: p?.nome ?? null,
        preco_compra: form.preco_compra,
        unidade: form.unidade,
        data_movimento: form.data ? `${form.data}T12:00:00` : undefined,
        loja_origem_nome: null, loja_destino_nome: null,
      });
      if (novo) setMovs((prev) => [novo, ...prev]);
      // Atualiza o estoque do produto
      if (p) {
        const prodAtual = produtos.find(pp => pp.id === p.id) || p;
        const acrescimo = getFatorUnidade(p) * Number(form.unidade);
        const novoEstoque = (prodAtual.estoque || 0) + acrescimo;
        setProdutos((prev) => prev.map(pp => pp.id === p.id ? { ...pp, estoque: novoEstoque } : pp));
      }
      setOpen(false);
      setForm({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, data: hojeInput() });
      loadData();
      if (searchParams.get("novo") === "true") navigate("/produtos");
    } catch (e) {
      alert("Erro: " + (e instanceof Error ? e.message : ""));
    }
  }

  const cols: Column<Movimentacao>[] = [
    { key: "id", label: "Código", width: "110px", render: (r) => {
      const p = produtos.find(pp => pp.id === r.produto_id);
      return p?.codigo || "—";
    }},
    { key: "produto_nome", label: "Produto", width: "auto", align: "center" },
    { key: "id", label: "Marca", width: "130px", align: "center", render: (r) => {
      const p = produtos.find(pp => pp.nome === r.produto_nome);
      return p?.marca || "—";
    }},
    { key: "id", label: "Modelo", width: "130px", align: "center", render: (r) => {
      const p = produtos.find(pp => pp.nome === r.produto_nome);
      return p?.modelo || "—";
    }},
    { key: "id", label: "Categoria", width: "150px", render: (r) => {
          const p = produtos.find(pp => pp.nome === r.produto_nome);
          return p?.categoria_nome || "—";
        }},
        { key: "quantidade", label: "Quantidade", width: "120px", align: "center", render: (r) => r.quantidade },
    { key: "data_movimento", label: "Data", width: "120px", align: "center", render: (r) => new Date(r.data_movimento).toLocaleDateString("pt-BR") },
    { key: "id", label: "Ação", align: "center", width: "100px", render: (r) => (
      <div className="flex items-center gap-1">
        <button onClick={(e) => { e.stopPropagation(); setEditing(r); setForm({ produto_id: String(r.produto_id), quantidade: r.quantidade, preco_compra: (r as any).preco_compra || 0, unidade: (r as any).unidade || 1, data: (r as any).data_movimento ? String(r.data_movimento).slice(0, 10) : hojeInput() }); setOpen(true); }}
          className="rounded p-1.5 text-blue-600 hover:bg-blue-50 transition">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={async (e) => { e.stopPropagation(); if (confirm(`Excluir entrada #${r.id}?`)) {
          const prod = produtos.find(pp => pp.nome === r.produto_nome);
          if (prod) {
            const u = prod.unidade || "";
            const fatorProd = u.includes(" / ") ? Number(u.split(" / ")[1]) || 1 : ({un:1,cx:12,pct:100,rl:50,kg:1,lt:1,mt:1,dz:12,resma:500,par:2,pc:1,jogo:1,ct:1} as Record<string, number>)[u] ?? 1;
            const decrescimo = fatorProd * ((r as any).unidade || 1);
            const novoEstoque = Math.max(0, (prod.estoque || 0) - decrescimo);
            const custoExcluido = fatorProd * (Number((r as any).preco_compra) || 0) * ((r as any).quantidade || 0);
            const novoCustoTotal = Math.max(0, (prod.custo_total || 0) - custoExcluido);
            const { invoke } = await import("@tauri-apps/api/core");
            invoke("update_produto", {
              id: prod.id,
              codigo: prod.codigo || "",
              nome: prod.nome || "",
              descricao: null,
              categoria_id: prod.categoria_id ?? null,
              fornecedor_id: null,
              unidade: prod.unidade || "un",
              preco_compra: prod.preco_compra || 0,
              preco_venda: 0,
              estoque: novoEstoque,
              estoque_minimo: prod.estoque_minimo || 0,
            }).catch(async () => {
              const st = (await import("../lib/api")).store;
              st.updateProduto({ ...prod, estoque: novoEstoque, custo_total: novoCustoTotal });
            });
          }
          api.movimentacoes.delete(r.id).then(() => loadData()).catch(() => loadData());
        }}}
          className="rounded p-1.5 text-red-600 hover:bg-red-50 transition">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    )},
  ];
  return (
    <Layout title="Entradas" subtitle="Registre entradas de mercadorias no estoque">
      <PageHeader
        title="Entradas"
        subtitle="Histórico de entradas de produtos"
        icon={<ArrowDownToLine className="h-5 w-5" />}
      />
      <DataTable<Movimentacao>
        data={movs}
        columns={cols}
        searchKeys={["produto_nome", "produto_codigo"]}
        searchPlaceholder="Buscar por produto ou código..."
        emptyMessage="Nenhuma entrada registrada"
      />

      <Window
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, data: hojeInput() }); if (searchParams.get("novo") === "true") navigate("/produtos"); }}
        title={editing ? "Editar Entrada" : "Nova Entrada"}
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => { setOpen(false); navigate("/produtos"); }}>Cancelar</Button>
          <Button onClick={handleSave}>Registrar Entrada</Button>
        </>}
      >
        <div className="space-y-3 py-1">
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Código</label>
            <input value={form.produto_id ? (produtos.find(pp => pp.id === Number(form.produto_id))?.codigo || "—") : "—"} readOnly
              className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Produto</label>
            <select value={form.produto_id} onChange={(e) => setForm({ ...form, produto_id: e.target.value })}
              disabled={!!searchParams.get("produto")}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${searchParams.get("produto") ? "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed" : "border-gray-300"}`}>
              <option value="">Selecione...</option>
              {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Quantidade</label>
            <input type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Data</label>
            <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>
      </Window>
    </Layout>
  );
}
