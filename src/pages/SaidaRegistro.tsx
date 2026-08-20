import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowUpFromLine, Plus, Pencil, Trash2, ChevronDown, Check } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type { Movimentacao, Produto, Loja, Usuario } from "../lib/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";
import { renumerar } from "../lib/utils";

export default function SaidaRegistro() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Movimentacao | null>(null);
  const [form, setForm] = useState<{ produto_id: string; quantidade: number; preco_compra: number; unidade: number; solicitante: string; data: string }>({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, solicitante: "", data: hojeInput() });
  const [solicitantes, setSolicitantes] = useState<string[]>([]);
  const [novoSolicitanteOpen, setNovoSolicitanteOpen] = useState(false);
  const [novoSolicitanteNome, setNovoSolicitanteNome] = useState("");

  function hojeInput(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function openEdit(m: Movimentacao) {
    setEditing(m);
    setForm({
      produto_id: String(m.produto_id ?? ""),
      quantidade: m.quantidade,
      preco_compra: (m as any).preco_compra ?? 0,
      unidade: (m as any).unidade ?? 1,
      solicitante: m.observacao?.match(/por (.+?) -/)?.[1] || "",
      data: String(m.data_movimento).slice(0, 10) || hojeInput(),
    });
    setOpen(true);
  }

  function getFatorUnidade(prod?: Produto): number {
    if (!prod) return 1;
    const u = prod.unidade || "";
    if (u.includes(" / ")) return Number(u.split(" / ")[1]) || 1;
    const map: Record<string, number> = {un:1,cx:12,pct:100,rl:50,kg:1,lt:1,mt:1,dz:12,resma:500,par:2,pc:1,jogo:1,ct:1};
    return map[u] ?? 1;
  }

  function loadData() {
    Promise.all([api.movimentacoes.list(), api.produtos.list(), api.lojas.list(), api.usuarios.list()])
      .then(([m, p, l, u]) => {
        const r = renumerar(p);
        const mapa = new Map(r.map(pp => [pp.id, pp.codigo]));
        setMovs(m.filter(x => x.tipo === "saida" && x.observacao?.startsWith("Saida manual")).map(x => ({ ...x, produto_codigo: mapa.get(x.produto_id) || "" })));
        setProdutos(r);
        setLojas(l);
        setUsuarios(u);
      })
      .catch(() => { setMovs([]); setProdutos([]); setLojas([]); setUsuarios([]); });
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
    const salvos = JSON.parse(localStorage.getItem("almox_solicitantes") || "[]");
    setSolicitantes(salvos);
  }, []);

  function addSolicitante() {
    if (!novoSolicitanteNome.trim()) return;
    const lista = [...solicitantes, novoSolicitanteNome.trim()];
    setSolicitantes(lista);
    localStorage.setItem("almox_solicitantes", JSON.stringify(lista));
    setForm({ ...form, solicitante: novoSolicitanteNome.trim() });
    setNovoSolicitanteNome("");
    setNovoSolicitanteOpen(false);
  }

  async function handleSave() {
    try {
      const p = produtos.find(pp => pp.id === Number(form.produto_id));
      if (!p) return;
      if (editing?.id) {
        const diff = Number(form.quantidade) - editing.quantidade;
        await api.movimentacoes.update(editing.id, {
          quantidade: Number(form.quantidade),
          preco_compra: form.preco_compra,
          unidade: form.unidade,
          observacao: `Saida manual por ${form.solicitante || "desconhecido"} - ${p.nome}`,
        });
        if (diff !== 0) {
          const prodAtual = produtos.find(pp => pp.id === p.id) || p;
          const fator = getFatorUnidade(p);
          const ajuste = fator * diff;
          const novoEstoque = Math.max(0, (prodAtual.estoque || 0) - ajuste);
          setProdutos(prev => prev.map(pp => pp.id === p.id ? { ...pp, estoque: novoEstoque } : pp));
        }
      } else {
        const novo = await api.movimentacoes.create({
          tipo: "saida",
          produto_id: p.id,
          produto_nome: p.nome,
          quantidade: Number(form.quantidade),
          loja_origem_id: user?.loja_id || null,
          loja_origem_nome: lojas.find(l => l.id === user?.loja_id)?.nome || null,
          loja_destino_id: null,
          loja_destino_nome: null,
          usuario_id: null,
          observacao: `Saida manual por ${form.solicitante || "desconhecido"} - ${p.nome}`,
          preco_compra: form.preco_compra,
          unidade: form.unidade,
          data_movimento: form.data ? `${form.data}T12:00:00` : undefined,
        });
        if (novo) setMovs((prev) => [novo, ...prev]);
        if (p) {
          const prodAtual = produtos.find(pp => pp.id === p.id) || p;
          const decrescimo = getFatorUnidade(p) * Number(form.unidade);
          const novoEstoque = Math.max(0, (prodAtual.estoque || 0) - decrescimo);
          setProdutos(prev => prev.map(pp => pp.id === p.id ? { ...pp, estoque: novoEstoque } : pp));
        }
      }
      setOpen(false);
      setEditing(null);
      setForm({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, solicitante: "", data: hojeInput() });
      loadData();
      if (searchParams.get("novo") === "true") navigate("/produtos");
    } catch { alert("Erro ao registrar saída"); }
  }

  const columns: Column<Movimentacao>[] = [
    { key: "id", label: "Código", width: "90px", render: (r) => {
      const p = produtos.find(pp => pp.id === r.produto_id);
      return p?.codigo || "—";
    }},
    { key: "produto_nome", label: "Produto", width: "auto", align: "center" },
    { key: "id", label: "Marca", width: "110px", align: "center", render: (r) => {
      const p = produtos.find(pp => pp.nome === r.produto_nome);
      return p?.marca || "—";
    }},
    { key: "id", label: "Modelo", width: "110px", align: "center", render: (r) => {
      const p = produtos.find(pp => pp.nome === r.produto_nome);
      return p?.modelo || "—";
    }},
    { key: "id", label: "Categoria", width: "130px", render: (r) => {
      const p = produtos.find(pp => pp.nome === r.produto_nome);
      return p?.categoria_nome || "—";
    }},
    { key: "quantidade", label: "Quantidade", width: "100px", align: "center" },
    { key: "observacao", label: "Solicitante", width: "140px", align: "center", render: (r) => {
      const match = r.observacao?.match(/por (.+?) -/);
      return match?.[1] || "—";
    } },
    { key: "data_movimento", label: "Data Saída", width: "100px", align: "center", render: (r) => new Date(r.data_movimento).toLocaleDateString("pt-BR") },
    { key: "acoes", label: "Ação", align: "center", width: "100px", render: (r) => (
      <div className="flex items-center justify-center gap-0.5">
        <button onClick={(e) => { e.stopPropagation(); openEdit(r); }}
          className="rounded p-1.5 text-blue-600 hover:bg-blue-50 transition" title="Editar saída">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={async () => {
          if (!confirm(`Excluir "${r.produto_nome}" (qtd: ${r.quantidade}) permanentemente?`)) return;
          try {
            await api.movimentacoes.delete(r.id);
            setMovs(prev => prev.filter(m => m.id !== r.id));
          } catch (e) { alert("Erro: " + String(e)); }
        }} className="rounded p-1.5 text-red-600 hover:bg-red-50 transition" title="Excluir saída">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )},
  ];

  return (
    <Layout title="Registro de Saída" subtitle="Registre saídas manuais de mercadorias">
      <PageHeader
        title="Saída"
        subtitle="Registre saída de produtos do estoque"
        icon={<ArrowUpFromLine className="h-5 w-5" />}
      />

      <DataTable<Movimentacao>
        data={movs}
        columns={columns}
        searchKeys={["produto_nome", "produto_codigo"]}
        searchPlaceholder="Buscar por produto ou código..."
        emptyMessage="Nenhuma saída registrada"
      />

      <Window
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm({ produto_id: "", quantidade: 1, preco_compra: 0, unidade: 1, solicitante: "", data: hojeInput() }); if (searchParams.get("novo") === "true") navigate("/produtos"); }}
        title={editing ? "Editar Saída" : "Nova Saída"}
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => { setOpen(false); navigate("/produtos"); }}>Cancelar</Button>
          <Button onClick={handleSave}>Registrar Saída</Button>
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
              <label className="block text-sm font-medium text-gray-700">Data Saída</label>
              <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Solicitante</label>
              <button
                type="button"
                onClick={() => setNovoSolicitanteOpen(true)}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm text-left transition flex items-center gap-2 overflow-visible ${
                  form.solicitante ? "border-gray-300 text-gray-900" : "border-gray-300 text-gray-400"
                } hover:border-blue-400`}
              >
                {form.solicitante && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 shrink-0">
                    {form.solicitante.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="flex-1 whitespace-nowrap overflow-visible">{form.solicitante || "Selecione um solicitante..."}</span>
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </Window>

      {/* Window: Novo Solicitante */}
      <Window open={novoSolicitanteOpen} onClose={() => setNovoSolicitanteOpen(false)} title="Solicitantes" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setNovoSolicitanteOpen(false)}>Fechar</Button>
        </>}>
        <div className="space-y-3">
          {/* Input para adicionar */}
          <div className="flex gap-2">
            <input
              type="text"
              value={novoSolicitanteNome}
              onChange={(e) => setNovoSolicitanteNome(e.target.value)}
              placeholder="Novo solicitante..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-50 outline-none"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") addSolicitante(); }}
            />
            <Button onClick={addSolicitante} disabled={!novoSolicitanteNome.trim()}>Adicionar</Button>
          </div>

          {/* Lista de opções */}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {usuarios.map((u) => (
              <div
                key={u.id}
                onClick={() => { setForm({ ...form, solicitante: u.nome }); setNovoSolicitanteOpen(false); }}
                className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition ${
                  form.solicitante === u.nome ? "bg-blue-50 border border-blue-200" : "border border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">{u.nome.charAt(0).toUpperCase()}</span>
                  <span className="text-sm text-gray-700">{u.nome}</span>
                </div>
                {form.solicitante === u.nome && <Check className="h-4 w-4 text-blue-600" />}
              </div>
            ))}
            {solicitantes.map((s) => (
              <div
                key={s}
                onClick={() => { setForm({ ...form, solicitante: s }); setNovoSolicitanteOpen(false); }}
                className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition ${
                  form.solicitante === s ? "bg-blue-50 border border-blue-200" : "border border-gray-200 hover:bg-gray-50"
                }`}
              >
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
