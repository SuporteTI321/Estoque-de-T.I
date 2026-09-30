import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package as PackageIcon, Plus, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, RotateCcw, Search, ScanBarcode } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type { Produto, Categoria, Movimentacao } from "../lib/types";
import { api, store } from "../lib/api";
import { useAuth } from "../lib/useAuth";
import { renumerar, siglaCategoria, migrarCodigos } from "../lib/utils";
import { previewCodigo } from "../lib/regrasCodigo";
import { CATS_PADRAO, normCat } from "../lib/constants";

// Linha da janela de retorno: uma saída registrada ainda não devolvida (integralmente)
type LinhaRetorno = {
  mov: Movimentacao;
  codigo: string;
  solicitante: string;
  devolvido: number;
  saldo: number;
};

// Monta a lista de saídas com saldo pendente de retorno.
// Saldo = quantidade da saída original menos o que já foi devolvido:
// cada devolução é uma movimentação tipo "entrada" com saida_ref:<id> na observação.
function calcularLinhas(retMovs: Movimentacao[], retProdFiltro: number | null, retBusca: string): LinhaRetorno[] {
  const devolvidos = new Map<number, number>();
  for (const m of retMovs) {
    if (m.tipo !== "entrada") continue;
    const ref = m.observacao?.match(/saida_ref:\s*(\d+)/)?.[1];
    if (!ref) continue;
    const id = Number(ref);
    devolvidos.set(id, (devolvidos.get(id) || 0) + Number(m.quantidade || 0));
  }
  const termo = retBusca.trim().toLowerCase();
  const saidas: LinhaRetorno[] = [];
  for (const m of retMovs) {
    if (m.tipo !== "saida") continue;
    if (retProdFiltro !== null && m.produto_id !== retProdFiltro) continue;
    const total = Number(m.quantidade || 0);
    const devolvido = Math.min(devolvidos.get(m.id) || 0, total);
    const saldo = total - devolvido;
    if (saldo <= 0) continue;
    const codigo = m.observacao?.match(/^cod_produto:(.+)$/m)?.[1]?.trim() || "";
    const solicitante = m.observacao?.match(/por ([^-]+) - /)?.[1]?.trim() || "";
    const nome = m.produto_nome || "";
    if (termo && !(
      nome.toLowerCase().includes(termo) ||
      codigo.toLowerCase().includes(termo) ||
      solicitante.toLowerCase().includes(termo)
    )) continue;
    saidas.push({ mov: m, codigo, solicitante, devolvido, saldo });
  }
  return saidas.sort((a, b) =>
    new Date(b.mov.data_movimento).getTime() - new Date(a.mov.data_movimento).getTime()
  );
}

export default function Produtos() {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  // ── Retorno de saída (devolução de produtos que já saíram) ──
  const [retOpen, setRetOpen] = useState(false);
  const [retProdFiltro, setRetProdFiltro] = useState<number | null>(null);
  const [retMovs, setRetMovs] = useState<Movimentacao[]>([]);
  const [retBusca, setRetBusca] = useState("");
  const [retSel, setRetSel] = useState<Set<number>>(new Set());
  const [retQtd, setRetQtd] = useState<Record<number, number>>({});
  const [retData, setRetData] = useState<string>(() => hojeISO());
  const [retCarregando, setRetCarregando] = useState(false);
  const [retSalvando, setRetSalvando] = useState(false);
  // Leitura de código de barras
  const [retBarcode, setRetBarcode] = useState("");
  const [retBarcodeMsg, setRetBarcodeMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  function hojeISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }



  async function syncCategorias(sqliteCats: Categoria[]): Promise<Categoria[]> {
    const existentes = sqliteCats && sqliteCats.length > 0 ? sqliteCats : [];
    const sqlNormSet = new Set(existentes.map((c) => normCat(c.nome)));
    // Sincronizar categorias padrao para o SQLite
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      for (const p of CATS_PADRAO) {
        if (!sqlNormSet.has(normCat(p.nome))) {
          const created = await invoke<any>("create_categoria", { nome: p.nome, descricao: p.descricao });
          if (created?.id) existentes.push(created);
          sqlNormSet.add(normCat(p.nome));
        }
      }
    } catch {}
    // Merge final: categorias do banco primeiro; padrão apenas as que não existirem (por nome)
    const porNorm = new Map<string, Categoria>();
    for (const c of [...existentes, ...CATS_PADRAO]) {
      const n = normCat(c.nome);
      if (!porNorm.has(n)) porNorm.set(n, c);
    }
    return Array.from(porNorm.values());
  }

  function load() {
    Promise.all([api.produtos.list(), api.categorias.list()])
      .then(async ([p, c]) => {
        // 1. Renumera produtos sem código
        const renum = renumerar(p);
        // 2. Migra siglas antigas para oficiais
        const { lista: migrados, alterados } = migrarCodigos(renum);
        if (alterados > 0) {
          console.log(`[Produtos] ${alterados} código(s) migrado(s) para siglas oficiais`);
          // Persistir migração no backend
          for (const prod of migrados) {
            const original = p.find(x => x.id === prod.id);
            if (original && original.codigo !== prod.codigo) {
              try {
                await api.produtos.update(prod.id, {
                  codigo: prod.codigo,
                  nome: prod.nome,
                  marca: prod.marca ?? null,
                  modelo: prod.modelo ?? null,
                  descricao: prod.descricao ?? null,
                  categoria_id: prod.categoria_id ?? null,
                  fornecedor_id: prod.fornecedor_id ?? null,
                  unidade: prod.unidade,
                  localizacao: prod.localizacao ?? null,
                  preco_compra: prod.preco_compra || 0,
                  preco_venda: prod.preco_venda || 0,
                  estoque: prod.estoque || 0,
                  estoque_minimo: prod.estoque_minimo || 0,
                  custo_total: prod.custo_total ?? 0,
                });
              } catch (e) { console.error(`[Migração] Erro ao atualizar produto ${prod.id}:`, e); }
            }
          }
        }
        setItems(migrados);
        // Sincronizar categorias com Configuracoes (32 padrao)
        const catsFinal = await syncCategorias(c || []);
        setCats(catsFinal);
        localStorage.setItem("almox_categorias", JSON.stringify(catsFinal));
      }).catch(() => { setItems([]); setCats([]); });
  }
  useEffect(() => { load(); }, []);

  function unidadeLabel(u?: string): string {
    if (!u) return "";
    if (u.includes(" / ")) return u;
    const nomes: Record<string, string> = {
      un: "UNIDADE", cx: "CAIXA", pct: "PACOTE", rl: "ROLO", kg: "QUILOGRAMA",
      lt: "LITRO", mt: "METRO", dz: "DÚZIA", resma: "RESMA", par: "PAR",
      pc: "PEÇA", jogo: "JOGO", ct: "CARTUCHO",
    };
    return nomes[u.toLowerCase()] || u;
  }



  // Calcula próximo número sequencial baseado em todos os códigos existentes
  function proximoNumero(): number {
    let max = 0;
    for (const p of items) {
      const m = p.codigo?.match(/^(\d+)-/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return max + 1;
  }

  function openNew() {
    setEditing(null);
    // Gera código imediatamente para o usuário VER (número = max+1, sigla PROD até escolher categoria)
    setForm({ codigo: previewCodigo(proximoNumero(), 'PROD'), unidade: 'un', estoque: 0, estoque_minimo: 0, ativo: true, preco_compra: 0, preco_venda: 0, custo_total: 0, localizacao: "Setor de TI" });
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
        const catSel = cats.find(c => c.id === form.categoria_id);
        const catNome = catSel?.nome || null;
        // Gera código automaticamente se estiver vazio (fallback de segurança)
        let codigo = form.codigo;
        if (!codigo || codigo.trim() === '') {
          const sigla = siglaCategoria(catNome, form.categoria_id ?? undefined);
          codigo = previewCodigo(proximoNumero(), sigla);
        }
        const n = await api.produtos.create({ ...form, codigo, categoria_nome: catNome } as Omit<Produto, "id">);
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

  // ─────────────────────────────────────────────────────────────
  //  Retorno de saída — devolve ao estoque produtos que já saíram
  // ─────────────────────────────────────────────────────────────

  const linhasRetorno = useMemo<LinhaRetorno[]>(
    () => calcularLinhas(retMovs, retProdFiltro, retBusca),
    [retMovs, retProdFiltro, retBusca]
  );

  async function carregarRetornos() {
    setRetCarregando(true);
    try {
      setRetMovs(await api.movimentacoes.list());
    } catch (e) {
      console.error("[Retorno] falha ao carregar movimentações:", e);
      setRetMovs([]);
    } finally {
      setRetCarregando(false);
    }
  }

  async function abrirRetorno(produtoId: number | null = null) {
    setRetProdFiltro(produtoId);
    setRetBusca("");
    setRetSel(new Set());
    setRetQtd({});
    setRetData(hojeISO());
    setRetBarcode("");
    setRetBarcodeMsg(null);
    setRetOpen(true);
    await carregarRetornos();
    // Leitor de código de barras já pronto para a primeira leitura
    setTimeout(() => barcodeRef.current?.focus(), 250);
  }

  function toggleRetorno(id: number) {
    setRetSel(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setRetQtd(prev => {
      if (id in prev) return prev;
      const l = linhasRetorno.find(x => x.mov.id === id);
      return l ? { ...prev, [id]: l.saldo } : prev;
    });
  }

  // Marca/desmarca todas as linhas (inclusive as filtradas pela busca)
  function alternarTodosRetorno() {
    const todos = linhasRetorno.map(l => l.mov.id);
    const todosMarcados = todos.length > 0 && todos.every(id => retSel.has(id));
    if (todosMarcados) {
      setRetSel(new Set());
      setRetQtd({});
      return;
    }
    setRetSel(new Set(todos));
    const qtds: Record<number, number> = {};
    for (const l of linhasRetorno) qtds[l.mov.id] = l.saldo;
    setRetQtd(prev => ({ ...qtds, ...prev }));
  }

  // ── Leitura por código de barras ──────────────────────────────
  // Localiza a saída pendente daquele código e a auto-seleciona.
  // Cada leitura soma 1 unidade (ler de novo incrementa até o saldo).
  function processarCodigo(bruto: string) {
    const cod = bruto.trim().toUpperCase();
    if (!cod) return;

    // 1) Procura entre as linhas visíveis (com os filtros atuais)
    let alvo = linhasRetorno.find(l => (l.codigo || "").trim().toUpperCase() === cod);
    // 2) Não achou: procura ignorando o texto de busca digitado e limpa esse filtro
    if (!alvo) {
      const semFiltroTexto = calcularLinhas(retMovs, retProdFiltro, "");
      alvo = semFiltroTexto.find(l => (l.codigo || "").trim().toUpperCase() === cod);
      if (alvo) setRetBusca("");
    }

    if (!alvo) {
      setRetBarcodeMsg({ tipo: "erro", texto: `Código ${cod} não encontrado entre as saídas pendentes de retorno.` });
      setRetBarcode("");
      barcodeRef.current?.focus();
      return;
    }

    const alvoFinal: LinhaRetorno = alvo;
    const id = alvoFinal.mov.id;
    const atual = Number(retQtd[id] ?? 0);
    const nova = Math.max(1, Math.min(alvoFinal.saldo, atual + 1));
    setRetSel(prev => new Set(prev).add(id));
    setRetQtd(prev => ({ ...prev, [id]: nova }));
    setRetBarcodeMsg({
      tipo: "ok",
      texto: `✓ ${alvoFinal.codigo || "s/ código"} — ${alvoFinal.mov.produto_nome} · ${nova} de ${alvoFinal.saldo} unidade(s) a devolver`,
    });
    setRetBarcode("");
    barcodeRef.current?.focus();
  }

  // Leitores que não enviam Enter: dispara quando o valor digitado/lido
  // bater exatamente com um código de produto já cadastrado na saída.
  useEffect(() => {
    if (!retOpen) return;
    const v = retBarcode.trim().toUpperCase();
    if (!v) return;
    const existe = calcularLinhas(retMovs, retProdFiltro, "")
      .some(l => (l.codigo || "").trim().toUpperCase() === v);
    if (existe) processarCodigo(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retBarcode, retOpen, retMovs, retProdFiltro]);

  // A confirmação de leitura bem-sucedida some sozinha
  useEffect(() => {
    if (retBarcodeMsg?.tipo !== "ok") return;
    const t = setTimeout(() => setRetBarcodeMsg(null), 4000);
    return () => clearTimeout(t);
  }, [retBarcodeMsg]);

  async function devolver() {
    const alvos = linhasRetorno.filter(l => retSel.has(l.mov.id));
    if (alvos.length === 0) { alert("Selecione ao menos uma saída para devolver."); return; }

    const qtds = alvos.map(l => Number(retQtd[l.mov.id] ?? l.saldo));
    if (qtds.some(q => !Number.isFinite(q) || q <= 0)) {
      alert("Quantidades devem ser números maiores que zero."); return;
    }
    const acimaDoSaldo = alvos.filter((l, i) => qtds[i] > l.saldo);
    if (acimaDoSaldo.length > 0) {
      alert("Quantidade maior que a saída registrada em:\n" +
        acimaDoSaldo.map(l => `• ${l.mov.produto_nome}${l.codigo ? ` (${l.codigo})` : ""} — saldo ${l.saldo}`).join("\n"));
      return;
    }
    const totalUn = qtds.reduce((s, q) => s + q, 0);
    if (!confirm(
      `Confirmar retorno de ${alvos.length} saída(s), totalizando ${totalUn} unidade(s)?\n\n` +
      `O estoque dos produtos será atualizado.`
    )) return;

    setRetSalvando(true);
    const falhas: string[] = [];
    let gravados = 0;
    for (let i = 0; i < alvos.length; i++) {
      const l = alvos[i];
      try {
        await api.movimentacoes.create({
          tipo: "entrada",
          produto_id: l.mov.produto_id,
          produto_nome: l.mov.produto_nome,
          quantidade: qtds[i],
          loja_origem_id: null,
          loja_origem_nome: null,
          loja_destino_id: null,
          loja_destino_nome: null,
          usuario_id: user?.id ?? null,
          observacao: [
            `Retorno de saida - ${l.mov.produto_nome || ""}`,
            `solicitante:${l.solicitante || "desconhecido"}`,
            l.codigo ? `cod_produto:${l.codigo}` : null,
            `saida_ref:${l.mov.id}`,
          ].filter(Boolean).join("\n"),
          // A saída original não reduziu custo_total: o retorno devolve só a quantidade,
          // para não duplicar o valor em estoque.
          preco_compra: 0,
          unidade: l.mov.unidade ?? 1,
          data_movimento: `${retData || hojeISO()}T12:00:00`,
        });
        gravados++;
      } catch (e) {
        falhas.push(`${l.mov.produto_nome}${l.codigo ? ` (${l.codigo})` : ""}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setRetSalvando(false);

    if (falhas.length > 0) {
      alert(`Retorno concluído parcialmente.\n\nGravados: ${gravados}\nFalhas: ${falhas.length}\n\n${falhas.join("\n").slice(0, 800)}`);
    }

    setRetSel(new Set());
    setRetQtd({});
    await carregarRetornos(); // linhas totalmente devolvidas somem da lista
    load();                   // atualiza estoque na tabela de produtos
  }

  const cols: Column<Produto>[] = [
    { key: "codigo", label: "CÓDIGO", width: "130px", align: "center", render: (r) => (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{r.codigo || <span className="text-gray-300">—</span>}</span>
    ) },
    { key: "nome", label: "PRODUTO", width: "auto", headerAlign: "center" },
    { key: "marca", label: "MARCA", width: "130px", render: (r) => r.marca || <span className="text-gray-300">—</span> },
    { key: "modelo", label: "MODELO", width: "130px", render: (r) => r.modelo || <span className="text-gray-300">—</span> },
    { key: "categoria_nome", label: "CATEGORIA", width: "150px", render: (r) => r.categoria_nome ? String(r.categoria_nome).toUpperCase() : <span className="text-gray-300">—</span> },
    { key: "estoque_minimo", label: "ESTOQUE MÍNIMO", width: "120px", align: "center" },
    { key: "estoque", label: "ESTOQUE", width: "100px", align: "center" },
    { key: "acoes", label: "Ação", align: "center", width: "140px", render: (r) => (
      <div className="flex justify-center gap-1">
        <button onClick={() => navigate("/entradas?novo=true&produto=" + r.id)} title="Nova Entrada" className="rounded p-1.5 text-green-600 hover:bg-green-50"><ArrowDownToLine className="h-3.5 w-3.5" /></button>
        <button onClick={() => navigate("/saida-registro?novo=true&produto=" + r.id)} title="Nova Saída" className="rounded p-1.5 text-orange-600 hover:bg-orange-50"><ArrowUpFromLine className="h-3.5 w-3.5" /></button>
        <button onClick={() => abrirRetorno(r.id)} title="Retorno de Saída (devolver ao estoque)" className="rounded p-1.5 text-teal-600 hover:bg-teal-50"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button onClick={() => openEdit(r)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
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
        pageSize={16}
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
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("update_produto_categoria", {
                id: Number(id),
                categoria_id: bulkForm.categoria_id !== null ? bulkForm.categoria_id : null,
              });
              // update_produto exige payload completo (campos obrigatórios no backend)
              if (bulkForm.unidade) {
                await api.produtos.update(Number(id), {
                  codigo: prod.codigo || "",
                  nome: prod.nome,
                  marca: prod.marca ?? null,
                  modelo: prod.modelo ?? null,
                  descricao: prod.descricao ?? null,
                  categoria_id: bulkForm.categoria_id !== null ? bulkForm.categoria_id : (prod.categoria_id ?? null),
                  fornecedor_id: prod.fornecedor_id ?? null,
                  unidade: bulkForm.unidade,
                  preco_compra: prod.preco_compra || 0,
                  preco_venda: prod.preco_venda || 0,
                  estoque: prod.estoque || 0,
                  estoque_minimo: prod.estoque_minimo || 0,
                  custo_total: prod.custo_total ?? 0,
                });
              }
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
              <label className="block text-sm font-medium text-gray-700">Código <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">AUTO</span></label>
              <input value={form.codigo || ""} onChange={(e) => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm uppercase font-mono font-semibold text-slate-700" placeholder="00001-PROD"
                title="Código gerado automaticamente (número + sigla da categoria). Pode editar se precisar." />
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
              <label className="block text-sm font-medium text-gray-700">Categoria</label>
              <select value={showNewCat ? "new" : String(form.categoria_id || "")} onChange={(e) => {
                if (e.target.value === "new") { setShowNewCat(true); }
                else {
                  const catId = e.target.value ? Number(e.target.value) : null;
                  const cat = cats.find(c => c.id === catId);
                  const sigla = siglaCategoria(cat?.nome, catId);
                  // Novo produto: preserva o número e troca só a sigla (não pula sequência ao trocar de categoria)
                  let novoCodigo = form.codigo;
                  if (!editing) {
                    const m = form.codigo?.match(/^(\d+)-/);
                    const num = m ? m[1] : String(proximoNumero()).padStart(5, '0');
                    novoCodigo = `${num}-${sigla}`;
                  }
                  setForm(f => ({ ...f, categoria_id: catId, codigo: novoCodigo }));
                }
              }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Selecione...</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.nome.toUpperCase()}</option>)}
                <option value="new" className="text-blue-600 font-medium">+ NOVA CATEGORIA</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Unidade Padrão</label>
{["UNIDADE / 1","CAIXA / 12","PACOTE / 100","ROLO / 50","QUILORGRAMA / 1","LITRO / 1","METRO / 1","D�sZIA / 12","RESMA / 500","PAR / 2","PE��A / 1","JOGO / 1"].includes(unidadeLabel(form.unidade || "")) ? (
              <select value={unidadeLabel(form.unidade || "") || "UNIDADE / 1"} onChange={(e) => {
                if (e.target.value === "new") { setShowNewUnid(true); }
                else setForm({ ...form, unidade: e.target.value });
              }} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="UNIDADE / 1">UNIDADE / 1</option>
                <option value="CAIXA / 12">CAIXA / 12</option>
                <option value="PACOTE / 100">PACOTE / 100</option>
                <option value="ROLO / 50">ROLO / 50</option>
                <option value="QUILOGRAMA / 1">QUILOGRAMA / 1</option>
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
          <div>
            <label className="block text-sm font-medium text-gray-700">Localização</label>
            <input
              value={form.localizacao ?? ""}
              onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
              placeholder="Ex.: Setor de TI"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Onde o item fica guardado (sala, prateleira, armário). É diferente da
              loja, que controla entrada, saída e transferência.
            </p>
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
              if (c) {
                setCats(prev => [...prev, c]);
                // Regenera sigla do código com a nova categoria (preserva número)
                const sigla = siglaCategoria(c?.nome, c?.id);
                const m = form.codigo?.match(/^(\d+)-/);
                const num = m ? m[1] : String(proximoNumero()).padStart(5, '0');
                setForm({ ...form, categoria_id: c?.id ?? null, codigo: !editing ? `${num}-${sigla}` : form.codigo });
              }
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

      {/* Janela flutuante: Retorno de Saída (devolução, individual ou em lote) */}
      <Window
        open={retOpen}
        onClose={() => setRetOpen(false)}
        title="Retorno de Saída"
        subtitle={retProdFiltro !== null
          ? `Produto: ${items.find(p => p.id === retProdFiltro)?.nome || "—"}`
          : "Devolva ao estoque produtos que já tiveram saída"}
        size="xl"
        footer={<>
          <span className="mr-auto text-xs text-gray-500">
            {retSel.size > 0
              ? `${retSel.size} saída(s) selecionada(s) · ${linhasRetorno.filter(l => retSel.has(l.mov.id)).reduce((s, l) => s + Number(retQtd[l.mov.id] ?? l.saldo), 0)} unidade(s)`
              : "Selecione as saídas para devolver"}
          </span>
          <Button variant="secondary" onClick={() => setRetOpen(false)}>Fechar</Button>
          <Button variant="success" icon={<RotateCcw className="h-4 w-4" />} onClick={devolver}
            disabled={retSalvando || retCarregando || retSel.size === 0}>
            {retSalvando ? "Devolvendo..." : `Devolver${retSel.size > 0 ? ` (${retSel.size})` : ""}`}
          </Button>
        </>}
      >
        <div className="space-y-3">
          {/* Barra de ferramentas: código de barras, busca, data e seleção em lote */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Leitura por código de barras — auto-seleciona o produto */}
            <div className="flex min-w-[230px] flex-1 items-center gap-2 rounded-lg border-2 border-teal-500/70 bg-teal-50/60 px-3 py-1.5 focus-within:border-teal-600 focus-within:bg-white">
              <ScanBarcode className="h-4 w-4 shrink-0 text-teal-600" />
              <input
                ref={barcodeRef}
                value={retBarcode}
                onChange={(e) => setRetBarcode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); processarCodigo(retBarcode); } }}
                placeholder="Leia o código de barras do produto..."
                autoFocus
                className="w-full min-w-0 bg-transparent font-mono text-sm text-gray-900 outline-none placeholder:font-sans placeholder:text-teal-700/70"
                title="Aproxime o leitor: ao ler o código, a saída correspondente é selecionada automaticamente (cada leitura soma 1 unidade)"
              />
            </div>
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={retBusca}
                onChange={(e) => setRetBusca(e.target.value)}
                placeholder="Buscar por produto, código ou solicitante..."
                className="w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Data do retorno</label>
              <input
                type="date"
                value={retData}
                onChange={(e) => setRetData(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={alternarTodosRetorno}
              disabled={linhasRetorno.length === 0}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {linhasRetorno.length > 0 && linhasRetorno.every(l => retSel.has(l.mov.id)) ? "Desmarcar todos" : "Marcar todos"}
            </button>
          </div>

          {/* Feedback da leitura do código de barras */}
          {retBarcodeMsg && (
            <div role="status" className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              retBarcodeMsg.tipo === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}>
              {retBarcodeMsg.texto}
            </div>
          )}

          {/* Resumo */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>{linhasRetorno.length} saída(s) disponível(is) para retorno</span>
            {retProdFiltro !== null && (
              <button onClick={() => setRetProdFiltro(null)}
                className="rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-700 hover:bg-blue-100">
                filtro: {items.find(p => p.id === retProdFiltro)?.nome || "produto"} ✕
              </button>
            )}
          </div>

          {/* Lista de saídas pendentes */}
          {retCarregando ? (
            <div className="py-10 text-center text-sm text-gray-400">Carregando saídas...</div>
          ) : linhasRetorno.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-gray-500">Nenhuma saída pendente de retorno</p>
              <p className="mt-1 text-xs text-gray-400">
                {retProdFiltro !== null ? "Este produto não tem saídas em aberto." : "Todas as saídas já foram devolvidas."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-500">
                  <tr>
                    <th className="w-10 px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={linhasRetorno.every(l => retSel.has(l.mov.id))}
                        onChange={alternarTodosRetorno}
                        className="h-4 w-4 cursor-pointer accent-teal-600"
                        title="Marcar todas as linhas listadas"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left">Código</th>
                    <th className="px-3 py-2.5 text-left">Produto</th>
                    <th className="px-3 py-2.5 text-left">Solicitante</th>
                    <th className="px-3 py-2.5 text-left">Data Saída</th>
                    <th className="px-3 py-2.5 text-center">Saída</th>
                    <th className="px-3 py-2.5 text-center">Devolvido</th>
                    <th className="px-3 py-2.5 text-center">Saldo</th>
                    <th className="px-3 py-2.5 text-center">Devolver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {linhasRetorno.map((l) => {
                    const marcado = retSel.has(l.mov.id);
                    const qtd = retQtd[l.mov.id] ?? l.saldo;
                    return (
                      <tr key={l.mov.id} className={marcado ? "bg-teal-50/70" : "transition hover:bg-gray-50"}>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={marcado}
                            onChange={() => toggleRetorno(l.mov.id)}
                            className="h-4 w-4 cursor-pointer accent-teal-600"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                            {l.codigo || "—"}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2" title={l.mov.produto_nome || ""}>
                          {l.mov.produto_nome || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{l.solicitante || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-500">
                          {l.mov.data_movimento ? new Date(l.mov.data_movimento).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600">{l.mov.quantidade}</td>
                        <td className="px-3 py-2 text-center text-gray-400">{l.devolvido}</td>
                        <td className="px-3 py-2 text-center font-semibold text-gray-900">{l.saldo}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            max={l.saldo}
                            value={qtd}
                            disabled={!marcado}
                            onChange={(e) => setRetQtd(prev => ({
                              ...prev,
                              [l.mov.id]: Math.max(1, Math.min(l.saldo, Number(e.target.value) || 1)),
                            }))}
                            title={marcado ? "Quantidade a devolver" : "Marque a linha para informar a quantidade"}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-center text-sm disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-gray-400">
            Cada retorno é gravado como uma <strong>entrada</strong> ligada à saída original
            (campo <span className="font-mono">saida_ref</span>), atualizando o estoque do produto.
            Saídas com todo o saldo devolvido deixam de aparecer nesta lista.
          </p>
        </div>
      </Window>
    </Layout>
  );
}
