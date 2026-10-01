// ============================================================================
//  TRANSFERÊNCIAS ENTRE LOJAS
// ----------------------------------------------------------------------------
//  Tela do sistema de transferências com base de produtos interligada.
//
//  Lista de transferências + ações de status
//  (pendente → em trânsito → concluída | cancelada).
//  O ESTOQUE SÓ MOVE quando a transferência é CONCLUÍDA.
//  (O estoque por loja ficou integrado ao menu Produtos.)
//
//  Modal "Nova Transferência": campo "Itens da transferência" no mesmo
//  modelo do "Itens da Solicitação" (Solicitações) — lista de cards com
//  os itens adicionados e, embaixo, <select> de produtos cadastrados +
//  quantidade + botão "Adicionar".
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftRight, Plus, Eye, Send, CheckCircle2, XCircle, Trash2,
  Package, AlertTriangle,
} from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type {
  Loja, Produto, Transferencia, TransferenciaItem, EstoqueLojaItem,
} from "../lib/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";

// ============================================================================
//  AUXILIARES
// ============================================================================

/** Rótulos e cores de status das transferências. */
const STATUS: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-amber-100 text-amber-700" },
  em_transito: { label: "Em trânsito", cls: "bg-blue-100 text-blue-700" },
  concluida: { label: "Concluída", cls: "bg-emerald-100 text-emerald-700" },
  cancelada: { label: "Cancelada", cls: "bg-gray-200 text-gray-600" },
};

function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso || "—";
  }
}

/** Item da lista de itens da transferência (modelo "Itens da Solicitação"). */
type ItemForm = { produto_id: string; quantidade: number };

// ============================================================================
//  PÁGINA
// ============================================================================

export default function Transferencias() {
  const { user } = useAuth();

  // ---- Estado geral ----
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  // ---- Modal: nova transferência ----
  const [novoAberto, setNovoAberto] = useState(false);
  const [origemId, setOrigemId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [observacao, setObservacao] = useState("");
  /** Itens já adicionados à transferência (cards da lista). */
  const [itensForm, setItensForm] = useState<ItemForm[]>([]);
  /** Rascunho da linha de adição (<select> de produto + quantidade). */
  const [novoItem, setNovoItem] = useState<ItemForm>({ produto_id: "", quantidade: 1 });
  const [salvando, setSalvando] = useState(false);

  // ---- Modal: detalhe ----
  const [detalhe, setDetalhe] = useState<Transferencia | null>(null);
  const [detalheItens, setDetalheItens] = useState<TransferenciaItem[]>([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  /** Ação aguardando confirmação na janela do app (substitui o window.confirm). */
  const [acao, setAcao] = useState<
    { tipo: "status"; t: Transferencia; status: string } | { tipo: "excluir"; t: Transferencia } | null
  >(null);
  const [executando, setExecutando] = useState(false);

  // ---- Cadastro rápido de loja dentro do modal (Origem/Destino) ----
  /** Qual campo pediu a nova loja (sistema "＋ Novo" replicado nas duas colunas). */
  const [novoCampo, setNovoCampo] = useState<"origem" | "destino" | null>(null);
  const [novaLojaNome, setNovaLojaNome] = useState("");
  const [novaLojaCodigo, setNovaLojaCodigo] = useState("");
  const [salvandoLoja, setSalvandoLoja] = useState(false);

  // ---- Saldo das lojas (usado só pelo modal de nova transferência) ----
  /** Saldo da loja de origem escolhida no modal. */
  const [saldoOrigemLista, setSaldoOrigemLista] = useState<EstoqueLojaItem[]>([]);
  /** true enquanto o saldo da loja de origem escolhida ainda está sendo carregado. */
  const [saldoCarregando, setSaldoCarregando] = useState(false);
  /** Sequência das requisições de saldo — descarta respostas atrasadas. */
  const seqSaldo = useRef(0);

  // ------------------------------------------------------------------------
  //  Carga de dados
  // ------------------------------------------------------------------------
  function recarregar() {
    Promise.all([api.lojas.list(), api.produtos.list(), api.transferencias.list()])
      .then(([l, p, t]) => {
        setLojas(l);
        setProdutos(p);
        setTransferencias(t);
        setErro(null);
      })
      .catch((e) => {
        console.error("[Transferencias] falha ao carregar:", e);
        setErro("Não foi possível carregar as transferências.");
      });
  }

  useEffect(() => { recarregar(); }, []);

  // Saldo da loja de origem assim que ela é selecionada no modal.
  // Guarda de corrida (seqSaldo): se o usuário trocar de origem rápido, só a
  // resposta da ÚLTIMA origem escolhida é aplicada — evita exibir o estoque
  // da loja anterior como se fosse o da nova.
  useEffect(() => {
    const meu = ++seqSaldo.current;
    if (!origemId) { setSaldoOrigemLista([]); setSaldoCarregando(false); return; }
    setSaldoCarregando(true);
    api.estoqueLoja.list(Number(origemId))
      .then((lista) => { if (seqSaldo.current === meu) setSaldoOrigemLista(lista); })
      .catch(() => { if (seqSaldo.current === meu) setSaldoOrigemLista([]); })
      .finally(() => { if (seqSaldo.current === meu) setSaldoCarregando(false); });
  }, [origemId]);

  // ------------------------------------------------------------------------
  //  Derivados
  // ------------------------------------------------------------------------
  /** Mapa produto_id → saldo na loja de origem do modal. */
  const saldoOrigem = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const e of saldoOrigemLista) mapa.set(e.produto_id, e.quantidade);
    return mapa;
  }, [saldoOrigemLista]);

  const temDuasLojas = lojas.length >= 2;

  // ------------------------------------------------------------------------
  //  Nova transferência
  // ------------------------------------------------------------------------
  /** Abre o formulário sempre — se faltar loja, o aviso aparece dentro dele. */
  function abrirNovo() {
    setErro(null);
    setOrigemId("");
    setDestinoId("");
    setObservacao("");
    setItensForm([]);
    setNovoItem({ produto_id: "", quantidade: 1 });
    setNovoCampo(null);
    setNovaLojaNome("");
    setNovaLojaCodigo("");
    setNovoAberto(true);
  }

  // ------------------------------------------------------------------------
  //  Cadastro rápido de loja ("＋ Novo" nas colunas Origem e Destino)
  // ------------------------------------------------------------------------
  /** Gera um código no padrão das lojas existentes (ex.: "LC-001"). */
  function gerarCodigoLoja(nome: string): string {
    const iniciais = nome.trim().split(/\s+/)
      .map(p => p[0] ?? "")
      .join("")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3) || "LJ";
    let maior = 0;
    for (const l of lojas) {
      const m = (l.codigo || "").match(/(\d+)$/);
      if (m) maior = Math.max(maior, Number(m[1]));
    }
    return `${iniciais}-${String(maior + 1).padStart(3, "0")}`;
  }

  /** Abre o painel de nova loja vindo do campo informado. */
  function abrirNovaLoja(campo: "origem" | "destino") {
    setNovoCampo(campo);
    setNovaLojaNome("");
    setNovaLojaCodigo("");
  }

  /** Cria a loja e seleciona no campo que abriu o cadastro.
   *  A loja criada passa a aparecer nas DUAS colunas (Origem e Destino). */
  async function salvarNovaLoja() {
    const nome = novaLojaNome.trim();
    if (!nome) { alert("Informe o nome da loja."); return; }
    const codigo = novaLojaCodigo.trim() || gerarCodigoLoja(nome);
    if (lojas.some(l => (l.codigo || "").toUpperCase() === codigo.toUpperCase())) {
      alert(`Já existe uma loja com o código "${codigo}". Informe outro código.`);
      return;
    }
    try {
      setSalvandoLoja(true);
      const criada = await api.lojas.create({ nome, codigo, endereco: null, contato: null, ativo: true });
      const atualizadas = await api.lojas.list();
      setLojas(atualizadas);
      const id = String(criada?.id ?? atualizadas.find(l => l.codigo === codigo)?.id ?? "");
      if (!id) throw new Error("Loja criada, mas não foi possível selecioná-la.");
      if (novoCampo === "origem") setOrigemId(id);
      else setDestinoId(id);
      setNovoCampo(null);
      setNovaLojaNome("");
      setNovaLojaCodigo("");
    } catch (e) {
      alert("Erro ao criar loja: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvandoLoja(false);
    }
  }

  // ------------------------------------------------------------------------
  // ------------------------------------------------------------------------
  //  Itens do formulário (modelo "Itens da Solicitação" de Solicitações)
  // ------------------------------------------------------------------------

  /** Saldo bruto do produto na loja de origem — o "estoque correto" da loja.
   *  null enquanto a origem não é definida ou o saldo ainda está carregando. */
  function saldoBruto(pid: number): number | null {
    if (!origemId || saldoCarregando) return null;
    return saldoOrigem.get(pid) ?? 0;
  }

  /** Quantidade do produto já listada em OUTROS cards (exclui o card `excetoIdx`). */
  function usadoEmOutros(pid: number, excetoIdx: number | null = null): number {
    return itensForm.reduce(
      (soma, it, j) => soma + (Number(it.produto_id) === pid && j !== excetoIdx ? it.quantidade : 0),
      0,
    );
  }

  /** Saldo ainda disponível para ADICIONAR (bruto − já listado nos cards). */
  function saldoLivre(pid: number): number | null {
    const bruto = saldoBruto(pid);
    return bruto === null ? null : bruto - usadoEmOutros(pid, null);
  }

  /** Move o rascunho (<select> + qtd) para a lista de cards. */
  function adicionarItem() {
    if (!novoItem.produto_id) { alert("Selecione um produto."); return; }
    const qtd = Number(novoItem.quantidade);
    if (!Number.isFinite(qtd) || qtd < 1) { alert("Informe uma quantidade maior que zero."); return; }
    if (origemId && saldoCarregando) {
      alert("Carregando o saldo da loja de origem — aguarde um instante e tente novamente.");
      return;
    }
    const pid = Number(novoItem.produto_id);
    const livre = saldoLivre(pid);
    if (livre !== null && qtd > livre) {
      const nome = produtos.find(p => p.id === pid)?.nome ?? "produto";
      alert(`Saldo insuficiente na loja de origem para "${nome}": disponível ${Math.max(livre, 0)}, informado ${qtd}.`);
      return;
    }
    setItensForm(prev => [...prev, { produto_id: novoItem.produto_id, quantidade: qtd }]);
    setNovoItem({ produto_id: "", quantidade: 1 });
  }

  function removerItem(idx: number) {
    setItensForm(prev => prev.filter((_, j) => j !== idx));
  }

  async function criarTransferencia() {
    if (lojas.length < 2) {
      alert("Cadastre ao menos 2 lojas em Configurações → Lojas para criar a transferência.");
      return;
    }
    if (!origemId || !destinoId) { alert("Selecione as lojas de origem e destino."); return; }
    if (Number(origemId) === Number(destinoId)) { alert("A loja de origem e a de destino devem ser diferentes."); return; }
    if (saldoCarregando) { alert("Carregando o saldo da loja de origem — aguarde um instante e tente novamente."); return; }
    if (itensForm.length === 0) { alert("Adicione ao menos um item à transferência."); return; }

    // Consolida por produto e revalida quantidade/saldo da origem
    const exigido = new Map<number, number>();
    for (const item of itensForm) {
      const qtd = Number(item.quantidade);
      if (!Number.isFinite(qtd) || qtd <= 0) {
        alert("Todas as quantidades devem ser maiores que zero.");
        return;
      }
      const pid = Number(item.produto_id);
      exigido.set(pid, (exigido.get(pid) ?? 0) + qtd);
    }
    for (const [pid, total] of exigido) {
      const saldo = saldoOrigem.get(pid) ?? 0;
      if (total > saldo) {
        const nome = produtos.find(p => p.id === pid)?.nome ?? "produto";
        alert(`Saldo insuficiente na loja de origem para "${nome}": disponível ${saldo}, solicitado ${total}.`);
        return;
      }
    }

    const itens = Array.from(exigido.entries()).map(([produto_id, quantidade]) => ({ produto_id, quantidade }));
    try {
      setSalvando(true);
      await api.transferencias.create({
        loja_origem_id: Number(origemId),
        loja_destino_id: Number(destinoId),
        observacao: observacao.trim() || null,
        usuario_id: user?.id ?? null,
        itens,
      });
      setNovoAberto(false);
      recarregar();
    } catch (e) {
      alert("Erro ao criar transferência: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  // ------------------------------------------------------------------------
  //  Detalhe / status / exclusão
  // ------------------------------------------------------------------------
  async function verDetalhe(t: Transferencia) {
    setDetalhe(t);
    setDetalheItens([]);
    setCarregandoDetalhe(true);
    try {
      setDetalheItens(await api.transferencias.listItens(t.id));
    } catch {
      setDetalheItens([]);
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  /**
   * Confirmação dentro do app.
   *
   * Não usamos `window.confirm`: dentro do WebView do Tauri ele responde
   * sozinho, sem mostrar a pergunta — o clique executava a ação na hora, sem
   * o usuário ver nada. Aqui a confirmação é uma janela do próprio sistema,
   * que mostra exatamente o que vai acontecer com o estoque.
   */
  function pedirStatus(t: Transferencia, novoStatus: string) {
    setAcao({ tipo: "status", t, status: novoStatus });
  }

  function pedirExclusao(t: Transferencia) {
    setAcao({ tipo: "excluir", t });
  }

  /** Texto da confirmação, montado conforme a ação escolhida. */
  function textoConfirmacao(): { titulo: string; texto: string; rotulo: string; perigo: boolean } | null {
    if (!acao) return null;
    if (acao.tipo === "excluir") {
      const t = acao.t;
      return t.status === "concluida"
        ? {
            titulo: `Excluir a transferência #${t.id}?`,
            texto:
              `Esta transferência JÁ CONCLUÍU e o estoque já foi movido. Ao excluir, o sistema vai:\n\n` +
              `• devolver os itens à loja de origem (${t.loja_origem_nome ?? `#${t.loja_origem_id}`})\n` +
              `• debitar da loja de destino (${t.loja_destino_nome ?? `#${t.loja_destino_id}`})\n` +
              `• apagar a baixa registrada no histórico\n\n` +
              `As duas lojas voltam ao saldo anterior.`,
            rotulo: "Excluir e estornar estoque",
            perigo: true,
          }
        : {
            titulo: `Excluir a transferência #${t.id}?`,
            texto:
              `Esta transferência ainda não moveu o estoque, então nada é alterado nas lojas.\n\n` +
              `O registro e os itens serão apagados definitivamente.`,
            rotulo: "Excluir",
            perigo: true,
          };
    }
    const t = acao.t;
    const mapa: Record<string, { titulo: string; texto: string; rotulo: string; perigo: boolean }> = {
      em_transito: {
        titulo: `Marcar a transferência #${t.id} como em trânsito`,
        texto: `O status passa para EM TRÂNSITO.\n\nO estoque só sai da loja de origem quando a transferência for concluída.`,
        rotulo: "Marcar em trânsito",
        perigo: false,
      },
      concluida: {
        titulo: `Concluir a transferência #${t.id}?`,
        texto:
          `O estoque será movido entre as lojas:\n\n` +
          `• sai de ${t.loja_origem_nome ?? `#${t.loja_origem_id}`}\n` +
          `• entra em ${t.loja_destino_nome ?? `#${t.loja_destino_id}`}\n` +
          `• a baixa é registrada no histórico\n\n` +
          `O saldo da origem é conferido antes de mover.`,
        rotulo: "Concluir e mover estoque",
        perigo: false,
      },
      cancelada: {
        titulo: `Cancelar a transferência #${t.id}?`,
        texto: `O status passa para CANCELADA.\n\nComo ela não moveu o estoque, os saldos das lojas não mudam.`,
        rotulo: "Cancelar transferência",
        perigo: true,
      },
    };
    const info = mapa[acao.status];
    if (!info) return null;
    return info;
  }

  /** Executa a ação escolhida na janela de confirmação. */
  async function executarAcao() {
    if (!acao) return;
    setExecutando(true);
    try {
      if (acao.tipo === "status") {
        await api.transferencias.updateStatus(acao.t.id, acao.status);
        setDetalhe(null);
      } else {
        await api.transferencias.delete(acao.t.id);
        setDetalhe(null);
      }
      setAcao(null);
      recarregar();
    } catch (e) {
      alert("Não foi possível concluir a ação:\n\n" + (e instanceof Error ? e.message : String(e)));
      setAcao(null);
    } finally {
      setExecutando(false);
    }
  }

  // ------------------------------------------------------------------------
  //  Colunas das tabelas
  // ------------------------------------------------------------------------
  const cols: Column<Transferencia>[] = [
    { key: "id", label: "#", width: "70px", align: "center" },
    { key: "loja_origem_nome", label: "Origem", width: "auto", render: (r) => r.loja_origem_nome ?? `Loja #${r.loja_origem_id}` },
    { key: "loja_destino_nome", label: "Destino", width: "auto", render: (r) => r.loja_destino_nome ?? `Loja #${r.loja_destino_id}` },
    { key: "total_itens", label: "Itens", width: "80px", align: "center" },
    { key: "total_quantidade", label: "Qtd Total", width: "100px", align: "center" },
    { key: "status", label: "Status", width: "120px", align: "center", render: (r) => <Badge status={r.status} /> },
    { key: "data_criacao", label: "Criada em", width: "150px", align: "center", render: (r) => formatarData(r.data_criacao) },
  ];

  // ------------------------------------------------------------------------
  //  Render
  // ------------------------------------------------------------------------
  return (
    <Layout title="Transferências" subtitle="Transfira produtos entre lojas com estoque por loja">
      <PageHeader
        title="Transferências entre Lojas"
        subtitle="Base de produtos interligada — o mesmo catálogo para todas as lojas"
        icon={<ArrowLeftRight className="h-5 w-5" />}
        action={<Button onClick={abrirNovo} icon={<Plus className="h-4 w-4" />}>Nova Transferência</Button>}
      />

      {erro && <div className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">{erro}</div>}

      <DataTable<Transferencia>
        data={transferencias}
        columns={cols}
        searchPlaceholder="Buscar por loja de origem ou destino..."
        searchKeys={["loja_origem_nome", "loja_destino_nome", "status", "observacao"]}
        emptyMessage="Nenhuma transferência registrada"
        pageSize={14}
        actions={(r) => (
          <div className="flex items-center justify-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); verDetalhe(r); }}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 transition" title="Ver detalhes">
              <Eye className="h-3.5 w-3.5" />
            </button>
            {r.status === "pendente" && (
              <button onClick={(e) => { e.stopPropagation(); pedirStatus(r, "em_transito"); }}
                className="rounded p-1.5 text-blue-600 hover:bg-blue-50 transition" title="Enviar (em trânsito)">
                <Send className="h-3.5 w-3.5" />
              </button>
            )}
            {(r.status === "pendente" || r.status === "em_transito") && (
              <>
                <button onClick={(e) => { e.stopPropagation(); pedirStatus(r, "concluida"); }}
                  className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 transition" title="Concluir (move o estoque)">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); pedirStatus(r, "cancelada"); }}
                  className="rounded p-1.5 text-orange-500 hover:bg-orange-50 transition" title="Cancelar">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {/* Lixeira em todos os status. Em "concluída" a exclusão estorna o
                estoque (devolve à origem, debita do destino) e apaga a baixa. */}
            <button onClick={(e) => { e.stopPropagation(); pedirExclusao(r); }}
              className={`rounded p-1.5 transition ${r.status === "concluida"
                ? "text-red-600 hover:bg-red-50"
                : "text-gray-500 hover:bg-red-50 hover:text-red-600"}`}
              title={r.status === "concluida" ? "Excluir e estornar o estoque" : "Excluir"}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      />

      {/* ================================================================ */}
      {/*  Modal: nova transferência (layout do "Nova Saída")               */}
      {/* ================================================================ */}
      <Window
        open={novoAberto}
        onClose={() => setNovoAberto(false)}
        title="Nova Transferência"
        size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => setNovoAberto(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={criarTransferencia} disabled={salvando}>
            {salvando ? "Salvando..." : "Criar Transferência"}
          </Button>
        </>}
      >
        <div className="space-y-4 py-1">
          {/* Lojas (com sistema "＋ Novo" replicado nas duas colunas) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Loja de origem</label>
              <select
                value={origemId}
                onChange={(e) => {
                  if (e.target.value === "__nova__") { abrirNovaLoja("origem"); return; }
                  setOrigemId(e.target.value);
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                <option value="__nova__">＋ Nova loja...</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Loja de destino</label>
              <select
                value={destinoId}
                onChange={(e) => {
                  if (e.target.value === "__nova__") { abrirNovaLoja("destino"); return; }
                  setDestinoId(e.target.value);
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {lojas.filter(l => String(l.id) !== origemId).map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                <option value="__nova__">＋ Nova loja...</option>
              </select>
            </div>
          </div>

          {/* Painel: cadastro rápido de loja */}
          {novoCampo && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-900">
                <Plus className="h-4 w-4" /> Nova loja — cadastro rápido
                <span className="ml-auto text-[11px] font-normal text-blue-600">
                  será usada como {novoCampo === "origem" ? "ORIGEM" : "DESTINO"}
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <label className="block text-xs font-medium text-blue-800">Nome *</label>
                  <input
                    value={novaLojaNome}
                    onChange={(e) => setNovaLojaNome(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarNovaLoja(); } }}
                    placeholder="Ex.: Loja Centro"
                    autoFocus
                    className="mt-1 w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="w-40">
                  <label className="block text-xs font-medium text-blue-800">Código</label>
                  <input
                    value={novaLojaCodigo}
                    onChange={(e) => setNovaLojaCodigo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarNovaLoja(); } }}
                    placeholder="automático"
                    className="mt-1 w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <Button onClick={salvarNovaLoja} disabled={salvandoLoja}>
                  {salvandoLoja ? "Salvando..." : "Criar loja"}
                </Button>
                <Button variant="secondary" onClick={() => setNovoCampo(null)} disabled={salvandoLoja}>
                  Cancelar
                </Button>
              </div>
              <div className="mt-2 text-[11px] text-blue-700">
                A loja criada fica disponível nas duas colunas (Origem e Destino).
                Código vazio é gerado automaticamente (ex.: <b>{gerarCodigoLoja(novaLojaNome || "Loja")}</b>).
              </div>
            </div>
          )}

          {/* Aviso: menos de 2 lojas */}
          {!temDuasLojas && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Cadastre ao menos 2 lojas para escolher origem e destino.</span>
              <Link
                to="/configuracoes"
                onClick={() => setNovoAberto(false)}
                className="ml-auto shrink-0 underline"
              >
                Abrir Configurações
              </Link>
            </div>
          )}

          {/* ── Itens da transferência (modelo "Itens da Solicitação") ── */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Itens da transferência *</label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              {itensForm.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-white p-3 text-center text-xs text-gray-500">
                  Nenhum item adicionado
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {itensForm.map((item, i) => {
                    const prod = produtos.find(p => p.id === Number(item.produto_id));
                    return (
                      <li key={i} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2">
                        <Package className="h-4 w-4 text-gray-400" />
                        <span className="flex-1 text-sm">
                          <span className="font-mono text-xs text-gray-500">{prod?.codigo || "—"}</span>{" "}
                          {prod?.nome ?? `#${item.produto_id}`}
                        </span>
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {item.quantidade} {prod?.unidade || "un"}
                        </span>
                        <button
                          onClick={() => removerItem(i)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-2 flex items-center gap-2">
                <select
                  value={novoItem.produto_id}
                  onChange={(e) => setNovoItem({ ...novoItem, produto_id: e.target.value })}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Selecionar produto...</option>
                  {/* O produto vem do catálogo do menu Produtos (já cadastrado),
                      mostrando o estoque registrado do item. */}
                  {produtos.filter(p => p.ativo).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.codigo ? `${p.codigo} — ` : ""}{p.nome} ({p.estoque || 0} {p.unidade || "un"})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={novoItem.quantidade}
                  onChange={(e) => setNovoItem({ ...novoItem, quantidade: Number(e.target.value) })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarItem(); } }}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="Qtd"
                />
                <Button size="sm" onClick={adicionarItem} icon={<Plus className="h-3 w-3" />}>
                  Adicionar
                </Button>
              </div>
            </div>
          </div>

          {/* ── Observação (posição do "Solicitante" no Nova Saída) ── */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)}
                placeholder="Opcional — ex.: reposição da loja X"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-400 outline-none" />
            </div>
          </div>
        </div>
      </Window>

      {/* ================================================================ */}
      {/*  Modal: detalhe da transferência                                  */}
      {/* ================================================================ */}
      <Window
        open={!!detalhe}
        onClose={() => setDetalhe(null)}
        title={detalhe ? `Transferência #${detalhe.id}` : ""}
        subtitle={detalhe ? `${detalhe.loja_origem_nome ?? "?"} → ${detalhe.loja_destino_nome ?? "?"}` : undefined}
        size="lg"
        footer={
          detalhe ? (
            <>
              <Button variant="secondary" onClick={() => setDetalhe(null)}>Fechar</Button>
              {detalhe.status === "pendente" && (
                <Button variant="secondary" onClick={() => pedirStatus(detalhe, "em_transito")} icon={<Send className="h-4 w-4" />}>
                  Enviar
                </Button>
              )}
              {(detalhe.status === "pendente" || detalhe.status === "em_transito") && (
                <>
                  <Button variant="danger" onClick={() => pedirStatus(detalhe, "cancelada")} icon={<XCircle className="h-4 w-4" />}>
                    Cancelar
                  </Button>
                  <Button variant="success" onClick={() => pedirStatus(detalhe, "concluida")} icon={<CheckCircle2 className="h-4 w-4" />}>
                    Concluir
                  </Button>
                </>
              )}
            </>
          ) : null
        }
      >
        {detalhe && (
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-[11px] uppercase text-gray-400">Status</div>
                <Badge status={detalhe.status} />
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-[11px] uppercase text-gray-400">Criada em</div>
                <div className="font-medium text-gray-900">{formatarData(detalhe.data_criacao)}</div>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-[11px] uppercase text-gray-400">Origem</div>
                <div className="font-medium text-gray-900">{detalhe.loja_origem_nome ?? `Loja #${detalhe.loja_origem_id}`}</div>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-[11px] uppercase text-gray-400">Destino</div>
                <div className="font-medium text-gray-900">{detalhe.loja_destino_nome ?? `Loja #${detalhe.loja_destino_id}`}</div>
              </div>
            </div>

            {detalhe.observacao && (
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <b>Observação:</b> {detalhe.observacao}
              </div>
            )}

            <div className="rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase text-gray-600">
                Itens ({detalhe.total_itens} produto(s) · {detalhe.total_quantidade} un)
              </div>
              {carregandoDetalhe ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">Carregando itens...</div>
              ) : detalheItens.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">Nenhum item</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 uppercase">
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">Un.</th>
                      <th className="w-20 px-3 py-2 text-center">Qtd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detalheItens.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500">{item.produto_codigo || "—"}</td>
                        <td className="px-3 py-2 text-gray-900">{item.produto_nome ?? `#${item.produto_id}`}</td>
                        <td className="px-3 py-2 text-gray-500">{item.unidade || "un"}</td>
                        <td className="px-3 py-2 text-center font-semibold">{item.quantidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <p className="text-[11px] text-gray-400">
              {detalhe.status === "concluida"
                ? "Transferência concluída: o estoque já foi movido da origem para o destino."
                : "O estoque só é movido ao concluir a transferência."}
            </p>
          </div>
        )}
      </Window>

      {/* Confirmação da ação — janela do app, não o confirm() do navegador,
          que no WebView do Tauri responde sozinho sem perguntar nada. */}
      <Window
        open={!!acao}
        onClose={() => { if (!executando) setAcao(null); }}
        title={textoConfirmacao()?.titulo || "Confirmar"}
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setAcao(null)} disabled={executando}>
            Voltar sem fazer nada
          </Button>
          <Button variant={textoConfirmacao()?.perigo ? "danger" : "primary"} onClick={executarAcao} disabled={executando}>
            {executando ? "Processando..." : textoConfirmacao()?.rotulo || "Confirmar"}
          </Button>
        </>}
      >
        <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
          {textoConfirmacao()?.texto}
        </p>
      </Window>

    </Layout>
  );
}
