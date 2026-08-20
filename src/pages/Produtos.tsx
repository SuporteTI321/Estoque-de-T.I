import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package as PackageIcon, Plus, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, Tag } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type { Produto, Categoria } from "../lib/types";
import { api, store } from "../lib/api";
import { renumerar } from "../lib/utils";

export default function Produtos() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Produto[]>([]);
  const [cats, setCats] = useState<Categoria[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Produto | null>(null);
  const [form, setForm] = useState<Partial<Produto>>({});
  const [showNewCat, setShowNewCat] = useState(false);
  const [showNewUnid, setShowNewUnid] = useState(false);
  const [novaCat, setNovaCat] = useState("");
  const [unidadesQtd, setUnidadesQtd] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<{ categoria_id: number | null; unidade: string }>({ categoria_id: null, unidade: "" });

  function load() {
    Promise.all([api.produtos.list(), api.categorias.list()])
      .then(([p, c]) => {
        const renum = renumerar(p);
        setItems(renum);
        localStorage.setItem("almox_produtos", JSON.stringify(renum));
        // Salvar codigos no backend
        renum.forEach((prod, i) => {
          const cat = (prod.categoria_nome || "PROD").toUpperCase().replace(/\s+/g, "");
          const sigla = cat.substring(0, 4);
          const esperado = `${String(i + 1).padStart(5, "0")}-${sigla}`;
          if (prod.codigo !== esperado) {
            api.produtos.update(Number(prod.id), { codigo: esperado }).catch(() => {});
          }
        });
        if (c && c.length > 0) {
          setCats(c);
          localStorage.setItem("almox_categorias", JSON.stringify(c));
        } else {
          // Fallback: categorias padrao
          const padrao = [
            { id: 1, nome: "Material de Escritório", descricao: "Papelaria e materiais administrativos", ativa: true },
            { id: 2, nome: "Material de Limpeza", descricao: "Produtos de higiene e limpeza", ativa: true },
            { id: 3, nome: "Ferramentas", descricao: "Ferramentas manuais e elétricas", ativa: true },
            { id: 4, nome: "Material Elétrico", descricao: "Cabos, disjuntores e componentes elétricos", ativa: true },
            { id: 5, nome: "EPI", descricao: "Equipamentos de proteção individual", ativa: true },
            { id: 6, nome: "Informática", descricao: "Suprimentos e acessórios de informática", ativa: true },
            { id: 7, nome: "Serviços", descricao: "Prestação de serviços terceirizados", ativa: true },
            { id: 8, nome: "Decoração", descricao: "Itens de decoração e ambientação", ativa: true },
            { id: 9, nome: "Utilidades", descricao: "Utensílios e itens diversos", ativa: true },
            { id: 10, nome: "Construção", descricao: "Materiais de construção e reparos", ativa: true },
            { id: 11, nome: "Descartáveis", descricao: "Produtos descartáveis em geral", ativa: true },
            { id: 12, nome: "Diversos", descricao: "Itens não classificados", ativa: true },
            { id: 13, nome: "Automotivo", descricao: "Peças e acessórios automotivos", ativa: true },
            { id: 14, nome: "Móveis", descricao: "Móveis e utensílios para escritório", ativa: true },
            { id: 15, nome: "Vestuário", descricao: "Uniformes e vestuário profissional", ativa: true },
            { id: 16, nome: "Alimentos", descricao: "Alimentos e bebidas em geral", ativa: true },
            { id: 17, nome: "Hidráulico", descricao: "Conexões, tubos, registros e materiais hidráulicos", ativa: true },
            { id: 18, nome: "Embalagem", descricao: "Sacos, fitas, caixas e materiais para embalagem", ativa: true },
            { id: 19, nome: "Copa / Cozinha", descricao: "Utensílios e descartáveis para copa e cozinha", ativa: true },
            { id: 20, nome: "Sinalização", descricao: "Placas, fitas, cones e materiais de sinalização", ativa: true },
            { id: 21, nome: "Manutenção Predial", descricao: "Tintas, massas, cimentos e materiais para manutenção", ativa: true },
            { id: 22, nome: "Proteção e Segurança", descricao: "Extintores, câmeras, alarmes e materiais de segurança patrimonial", ativa: true },
            { id: 23, nome: "Esporte e Lazer", descricao: "Bolas, redes, jogos e materiais esportivos", ativa: true },
            { id: 24, nome: "Didático / Cultural", descricao: "Livros, revistas e material pedagógico", ativa: true },
            { id: 25, nome: "Jardinagem", descricao: "Sementes, adubos, ferramentas e materiais para jardim", ativa: true },
            { id: 26, nome: "Primeiros Socorros", descricao: "Curativos, medicamentos básicos e materiais hospitalares", ativa: true },
            { id: 27, nome: "Fonte Colmeia", descricao: "Fontes de alimentação tipo colmeia para computadores", ativa: true },
            { id: 28, nome: "Produto Fonte Colmeia", descricao: "Produtos relacionados a fontes de alimentação colmeia", ativa: true },
          ];
          setCats(padrao);
          localStorage.setItem("almox_categorias", JSON.stringify(padrao));
        }
      }).catch(() => { setItems([]); setCats([]); });
  }
  useEffect(() => { load(); }, []);

  function unidadeLabel(u?: string): string {
    if (!u) return "";
    if (u.includes(" / ")) return u;
    const nomes: Record<string, string> = {
      un: "UNIDADE", cx: "CAIXA", pct: "PACOTE", rl: "ROLO", kg: "QUILORGRAMA",
      lt: "LITRO", mt: "METRO", dz: "DÚZIA", resma: "RESMA", par: "PAR",
      pc: "PEÇA", jogo: "JOGO", ct: "CARTUCHO",
    };
    return nomes[u.toLowerCase()] || u;
  }

  function gerarCodigo(produto: string, marca: string, modelo: string): string {
    // Gera código PRD-ABC (PRD + iniciais de Produto, Marca, Modelo)
    const prod = produto.trim();
    const marc = marca.trim();
    const mod = modelo.trim();
    const sigla = (prod ? prod.split(/\s+/).map(p => p[0]).join("").substring(0, 2) : "") +
                  (marc ? marc.split(/\s+/).map(m => m[0]).join("").substring(0, 1) : "") +
                  (mod ? mod.split(/\s+/).map(m => m[0]).join("").substring(0, 1) : "");
    return sigla ? `PRD-${sigla.toUpperCase()}` : `PRD-001`;
  }

  function openNew() {
    const nextNum = items.length + 1;
    setEditing(null);
    setForm({ codigo: `${String(nextNum).padStart(5, "0")}-PROD`, unidade: "un", estoque: 0, estoque_minimo: 0, ativo: true, preco_compra: 0, preco_venda: 0, custo_total: 0 });
    setOpen(true);
  }
  function openEdit(p: Produto) {
    setEditing(p);
    setForm({ ...p, preco_compra: p.preco_compra ?? 0, preco_venda: p.preco_venda ?? 0, estoque: p.estoque ?? 0, estoque_minimo: p.estoque_minimo ?? 0 });
    setOpen(true);
  }

  async function save() {
    try {
      if (editing?.id) {
        const catNome = form.categoria_id ? (cats.find(c => c.id === form.categoria_id)?.nome || null) : editing.categoria_nome;
        const u = await api.produtos.update(editing.id, { ...form, categoria_nome: catNome });
        setItems((p) => p.map((x) => (x.id === editing.id ? { ...x, ...u } : x)));
        setOpen(false);
        setTimeout(() => load(), 300);
      } else {
        const catNome = cats.find(c => c.id === form.categoria_id)?.nome || null;
        const n = await api.produtos.create({ ...form, categoria_nome: catNome } as Omit<Produto, "id">);
        if (n) {
            const novaLista = renumerar([...items, n]);
            setItems(novaLista);
            localStorage.setItem("almox_produtos", JSON.stringify(novaLista));
          }
        setOpen(false);
        setTimeout(() => load(), 300);
      }
    } catch (e) { alert("Erro: " + (e instanceof Error ? e.message : "")); }
  }

  async function del(p: Produto) {
    if (!confirm(`Excluir ${p.nome}?`)) return;
    try {
      await api.produtos.delete(p.id!);
      store.removeProduto(p.id!);
      const rest = store.getProdutos();
      const renum = renumerar(rest);
      setItems(renum);
      localStorage.setItem("almox_produtos", JSON.stringify(renum));
    } catch {}
  }

  const cols: Column<Produto>[] = [
    { key: "codigo", label: "CÓDIGO", width: "110px" },
    { key: "nome", label: "PRODUTO", width: "auto", headerAlign: "center" },
    { key: "marca", label: "MARCA", width: "130px", render: (r) => r.marca || <span className="text-gray-300">—</span> },
    { key: "modelo", label: "MODELO", width: "130px", render: (r) => r.modelo || <span className="text-gray-300">—</span> },
    { key: "categoria_nome", label: "CATEGORIA", width: "150px", render: (r) => r.categoria_nome ? String(r.categoria_nome).toUpperCase() : <span className="text-gray-300">—</span> },
    { key: "estoque_minimo", label: "ESTOQUE MÍNIMO", width: "120px", align: "center" },
    { key: "estoque", label: "ESTOQUE", width: "100px", align: "center" },
    { key: "acoes", label: "Ação", align: "center", width: "100px", render: (r) => (
      <div className="flex justify-center gap-1">
        <button onClick={() => navigate("/entradas?novo=true&produto=" + r.id)} title="Nova Entrada" className="rounded p-1.5 text-green-600 hover:bg-green-50"><ArrowDownToLine className="h-3.5 w-3.5" /></button>
        <button onClick={() => navigate("/saida-registro?novo=true&produto=" + r.id)} title="Nova Saída" className="rounded p-1.5 text-orange-600 hover:bg-orange-50"><ArrowUpFromLine className="h-3.5 w-3.5" /></button>
        <button onClick={() => openEdit(r)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
        <button onClick={() => navigate("/etiquetas?produto=" + r.id)} title="Etiqueta" className="rounded p-1.5 text-purple-600 hover:bg-purple-50"><Tag className="h-3.5 w-3.5" /></button>
        <button onClick={() => del(r)} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    )},
  ];

  return (
    <Layout title="Produtos" subtitle="Cadastro de produtos">
      <PageHeader
        title="Produtos"
        subtitle="Catálogo de produtos"
        icon={<PackageIcon className="h-5 w-5" />}
        action={
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Total: {items.length}</span>
            <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Novo Produto</Button>
          </div>
        }
      />
      <DataTable<Produto>
        data={items}
        columns={cols}
        searchKeys={["nome", "codigo"]}
        searchPlaceholder="Buscar por nome ou código..."
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      {/* Barra de seleção em lote */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-600 px-5 py-3 text-white shadow-lg">
          <span className="text-sm font-medium">{selectedIds.size} produto(s) selecionado(s)</span>
          <button onClick={() => setBulkOpen(true)}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-blue-700 transition hover:bg-blue-50">
            Editar em Lote
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm text-white transition hover:bg-blue-400">
            Limpar
          </button>
        </div>
      )}

      {/* Bulk Edit */}
      <Window open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Editar ${selectedIds.size} produto(s)`} size="lg"
        footer={<><Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancelar</Button><Button onClick={async () => {
          try {
            for (const id of selectedIds) {
              const prod = items.find(p => p.id === id);
              if (!prod) continue;
              const catNome = bulkForm.categoria_id ? (cats.find(c => c.id === bulkForm.categoria_id)?.nome || null) : prod.categoria_nome;
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("update_produto_categoria", {
                id: Number(id),
                categoria_id: bulkForm.categoria_id !== null ? bulkForm.categoria_id : null,
              });
            }
            setSelectedIds(new Set());
            setBulkOpen(false);
            setBulkForm({ categoria_id: null, unidade: "" });
            load();
          } catch (e) { alert("Erro ao categorizar em lote: " + String(e)); }
        }}>Aplicar</Button></>}>
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-500">Preencha apenas os campos que deseja alterar em lote.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CATEGORIA</label>
            <select value={bulkForm.categoria_id ?? ""} onChange={e => setBulkForm(f => ({ ...f, categoria_id: e.target.value ? Number(e.target.value) : null }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Manter atual</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.nome.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">UNIDADE PADRÃO</label>
            <select value={bulkForm.unidade} onChange={e => setBulkForm(f => ({ ...f, unidade: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Manter atual</option>
              {[
                { val: "un", label: "Unidade" }, { val: "cx", label: "Caixa" },
                { val: "pct", label: "Pacote" }, { val: "rl", label: "Rolo" },
                { val: "kg", label: "Quilograma" }, { val: "lt", label: "Litro" },
                { val: "mt", label: "Metro" }, { val: "dz", label: "Dúzia" },
                { val: "resma", label: "Resma" }, { val: "par", label: "Par" },
                { val: "pc", label: "Peça" }, { val: "jogo", label: "Jogo" },
                { val: "ct", label: "Cartela" },
              ].map(u => <option key={u.val} value={u.val}>{u.label}</option>)}
            </select>
          </div>
        </div>
      </Window>

      <Window
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar Produto" : "Novo Produto"}
        size="lg"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Código</label>
              <input value={form.codigo || ""} readOnly className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Produto</label>
              <input value={form.nome || ""} onChange={(e) => { const v = e.target.value.toUpperCase(); setForm(f => ({ ...f, nome: v })); }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-uppercase text-sm" spellCheck />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Marca</label>
              <input value={form.marca || ""} onChange={(e) => { const v = e.target.value.toUpperCase(); setForm(f => ({ ...f, marca: v })); }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-uppercase text-sm" placeholder="Ex: BIC" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Modelo</label>
              <input value={form.modelo || ""} onChange={(e) => { const v = e.target.value.toUpperCase(); setForm(f => ({ ...f, modelo: v })); }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-uppercase text-sm" placeholder="Ex: CRISTAL" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">CATEGORIA</label>
              <select value={showNewCat ? "new" : String(form.categoria_id || "")} onChange={(e) => {
                if (e.target.value === "new") { setShowNewCat(true); }
                else { setForm({ ...form, categoria_id: e.target.value ? Number(e.target.value) : null }); }
              }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Selecione...</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.nome.toUpperCase()}</option>)}
                <option value="new" className="text-blue-600 font-medium">+ NOVA CATEGORIA</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">UNIDADE PADRÃO</label>
              {["UNIDADE / 1","CAIXA / 12","PACOTE / 100","ROLO / 50","QUILORGRAMA / 1","LITRO / 1","METRO / 1","DÚZIA / 12","RESMA / 500","PAR / 2","PEÇA / 1","JOGO / 1"].includes(unidadeLabel(form.unidade || "")) ? (
              <select value={unidadeLabel(form.unidade || "") || "UNIDADE / 1"} onChange={(e) => {
                if (e.target.value === "new") { setShowNewUnid(true); }
                else setForm({ ...form, unidade: e.target.value });
              }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="UNIDADE / 1">UNIDADE / 1</option>
                <option value="CAIXA / 12">CAIXA / 12</option>
                <option value="PACOTE / 100">PACOTE / 100</option>
                <option value="ROLO / 50">ROLO / 50</option>
                <option value="QUILOGRAMA / 1">QUILORGRAMA / 1</option>
                <option value="LITRO / 1">LITRO / 1</option>
                <option value="METRO / 1">METRO / 1</option>
                <option value="DÚZIA / 12">DÚZIA / 12</option>
                <option value="RESMA / 500">RESMA / 500</option>
                <option value="PAR / 2">PAR / 2</option>
                <option value="PEÇA / 1">PEÇA / 1</option>
                <option value="JOGO / 1">JOGO / 1</option>
                <option value="new" className="text-blue-600 font-medium">+ Nova Unidade</option>
              </select>
              ) : (
              <div className="mt-1 flex gap-1">
                <input value={unidadeLabel(form.unidade || "") || "—"} readOnly
                  className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700" />
                <button onClick={() => setShowNewUnid(true)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">Alterar</button>
              </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Estoque Mínimo</label>
              <input type="number" value={form.estoque_minimo ?? 0} onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-center" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Estoque Atual</label>
              <input value={form.estoque ?? 0} readOnly
                className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 text-center" />
            </div>
          </div>
        </div>
      </Window>

      {/* Janela flutuante: Nova Categoria */}
      <Window open={showNewCat} onClose={() => { setShowNewCat(false); setNovaCat(""); }} title="Nova Categoria" size="sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">NOME DA CATEGORIA</label>
            <input value={novaCat} onChange={(e) => setNovaCat(e.target.value.toUpperCase())}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-uppercase text-sm" placeholder="EX: PAPELARIA" autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setShowNewCat(false); setNovaCat(""); }} variant="ghost">Cancelar</Button>
            <Button onClick={async () => {
              if (!novaCat.trim()) return;
              const c = await api.categorias.create({ nome: novaCat.trim().toUpperCase(), descricao: null, ativa: true });
              if (c) { cats.push(c); setCats([...cats]); }
              setForm({ ...form, categoria_id: c?.id ?? null });
              setShowNewCat(false); setNovaCat("");
            }} disabled={!novaCat.trim()}>Salvar</Button>
          </div>
        </div>
      </Window>

      {/* Janela flutuante: Nova Unidade */}
      <Window open={showNewUnid} onClose={() => setShowNewUnid(false)} title="Nova Unidade" size="md">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Selecione uma unidade e ajuste a quantidade por unidade:</p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {[
              { val: "un", label: "UNIDADE", qtd: 1 },
              { val: "cx", label: "CAIXA", qtd: 12 },
              { val: "pct", label: "PACOTE", qtd: 100 },
              { val: "rl", label: "ROLO", qtd: 50 },
              { val: "kg", label: "QUILOGRAMA", qtd: 1 },
              { val: "lt", label: "LITRO", qtd: 1 },
              { val: "mt", label: "METRO", qtd: 1 },
              { val: "dz", label: "DÚZIA", qtd: 12 },
              { val: "resma", label: "RESMA", qtd: 500 },
              { val: "par", label: "PAR", qtd: 2 },
              { val: "pc", label: "PEÇA", qtd: 1 },
              { val: "jogo", label: "JOGO", qtd: 1 },
              { val: "ct", label: "CARTUCHA", qtd: 1 },
            ].map((u) => (
              <div key={u.val}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition ${form.unidade === u.val ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"}`}>
                <button onClick={() => setForm({ ...form, unidade: u.val })}
                  className="flex-1 text-left">
                  <div className="text-sm font-medium text-gray-900">{u.label}</div>
                </button>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-gray-500">qtd:</span>
                  <input type="number" min="1" value={unidadesQtd[u.val] ?? u.qtd} onChange={(e) => {
                    const novaQtd = Number(e.target.value) || 1;
                    setUnidadesQtd(prev => ({ ...prev, [u.val]: novaQtd }));
                  }}
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm"
                    onClick={(e) => e.stopPropagation()} />
                </div>
                <button onClick={() => { setForm({ ...form, unidade: `${u.label} / ${unidadesQtd[u.val] ?? u.qtd}` }); setShowNewUnid(false); }}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Selecionar</button>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-gray-100">
            <label className="block text-xs font-medium text-gray-500 mb-1">Ou digite personalizado:</label>
            <div className="flex gap-2">
              <input value={form.unidade ? (unidadeLabel(form.unidade.split(" / ")[0].trim()) || form.unidade.split(" / ")[0]) : ""} onChange={(e) => {
                const nome = unidadeLabel(e.target.value.trim()) || e.target.value;
                const qtd = unidadesQtd["_personalizado"] ?? 1;
                setForm({ ...form, unidade: nome ? `${nome.toUpperCase()} / ${qtd}` : "" });
              }}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ex: BARRA" />
              <input type="number" min="1" value={unidadesQtd["_personalizado"] ?? 1} onChange={(e) => {
                const qtd = Number(e.target.value) || 1;
                setUnidadesQtd(prev => ({ ...prev, "_personalizado": qtd }));
                if (form.unidade && !form.unidade.includes(" / ")) {
                  setForm({ ...form, unidade: `${form.unidade} / ${qtd}` });
                } else if (form.unidade) {
                  const nome = form.unidade.split(" / ")[0];
                  setForm({ ...form, unidade: `${nome} / ${qtd}` });
                }
              }}
                className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm text-center" placeholder="qtd" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowNewUnid(false)} variant="ghost">Fechar</Button>
          </div>
        </div>
      </Window>
    </Layout>
  );
}
