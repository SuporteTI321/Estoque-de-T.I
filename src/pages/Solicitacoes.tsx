import { useEffect, useState, useMemo } from "react";
import {
  ClipboardList, Plus, Check, X, Eye, Trash2, Package,
  Search, Calendar, Building2, User, Pencil,
} from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type { Solicitacao, SolicitacaoItem, Loja, Produto } from "../lib/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";

type Status = "pendente" | "em_analise" | "aprovado" | "rejeitado";

const STATUS_LABEL: Record<Status, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    pendente: "bg-orange-100 text-orange-700",
    em_analise: "bg-blue-100 text-blue-700",
    aprovado: "bg-emerald-100 text-emerald-700",
    rejeitado: "bg-red-100 text-red-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[s] || "bg-gray-100 text-gray-700"}`}>{STATUS_LABEL[s as Status] || s}</span>;
}

export default function Solicitacoes() {
  const { user } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [statusFilter, setStatusFilter] = useState<Status | "todos">("todos");
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Solicitacao | null>(null);
  const [editing, setEditing] = useState<Solicitacao | null>(null);
  const [itens, setItens] = useState<SolicitacaoItem[]>([]);
  const [form, setForm] = useState({ loja_id: "", observacao: "" });
  const [newItem, setNewItem] = useState({ produto_id: "", quantidade: 1 });
  const [loadingItens, setLoadingItens] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function loadData() {
    Promise.all([api.solicitacoes.list(), api.lojas.list(), api.produtos.list()])
      .then(([s, l, p]) => { setSolicitacoes(s); setLojas(l); setProdutos(p); })
      .catch(() => { setSolicitacoes([]); setLojas([]); setProdutos([]); });
  }
  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "todos") return solicitacoes;
    return solicitacoes.filter((s) => s.status === statusFilter);
  }, [solicitacoes, statusFilter]);

  // stats
  const stats = useMemo(() => ({
    total: solicitacoes.length,
    pendente: solicitacoes.filter((s) => s.status === "pendente").length,
    em_analise: solicitacoes.filter((s) => s.status === "em_analise").length,
    aprovado: solicitacoes.filter((s) => s.status === "aprovado").length,
    rejeitado: solicitacoes.filter((s) => s.status === "rejeitado").length,
  }), [solicitacoes]);

  // ---------------- CRUD Solicitação ----------------
  function openNew() {
    setEditing(null);
    setForm({ loja_id: user?.loja_id ? String(user.loja_id) : "", observacao: "" });
    setItens([]);
    setNewItem({ produto_id: "", quantidade: 1 });
    setOpen(true);
  }

  function openEdit(s: Solicitacao) {
    setEditing(s);
    setForm({ loja_id: String(s.loja_id), observacao: s.observacao ?? "" });
    setOpen(true);
    setLoadingItens(true);
    api.solicitacoes.listItens(s.id)
      .then((it) => setItens(it))
      .catch(() => showToast(false, "Erro ao carregar os itens da solicitação."))
      .finally(() => setLoadingItens(false));
  }

  async function handleSave() {
    if (!form.loja_id) {
      showToast(false, "Selecione uma loja");
      return;
    }
    if (!editing && itens.length === 0) {
      showToast(false, "Adicione ao menos 1 item à solicitação");
      return;
    }
    try {
      let solicitacaoId = editing?.id;
      if (editing) {
        // Update observacao
        await api.solicitacoes.updateObservacao(editing.id, form.observacao);
        showToast(true, `Solicitação #${editing.id} atualizada`);
      } else {
        const novo = await api.solicitacoes.create({
          loja_id: Number(form.loja_id),
          usuario_id: user?.id ?? null,
          observacao: form.observacao || null,
          loja_nome: null, usuario_nome: null, total_itens: 0,
        });
        if (!novo) throw new Error("Não foi possível criar a solicitação.");
        solicitacaoId = novo.id;
        setSolicitacoes((prev) => [novo, ...prev]);
        showToast(true, `Solicitação #${solicitacaoId} criada`);
      }
      // Add pending items (only on create, for simplicity)
      if (!editing && solicitacaoId) {
        let falhas = 0;
        for (const it of itens) {
          try {
            await api.solicitacoes.addItem(solicitacaoId, it.produto_id, it.quantidade);
          } catch (err) {
            falhas++;
            showToast(false, `Erro ao adicionar "${it.produto_nome ?? it.produto_id}": ` + (err instanceof Error ? err.message : ""));
          }
        }
        if (falhas > 0) {
          // Não cria outra solicitação: a criada fica parcial e pode ser complementada na edição
          loadData();
          setOpen(false);
          showToast(false, `${itens.length - falhas} de ${itens.length} item(ns) adicionado(s). A solicitação #${solicitacaoId} foi criada — edite-a para incluir os itens que faltaram.`);
          return;
        }
      }
      setOpen(false);
      loadData();
    } catch (e) {
      showToast(false, "Erro: " + (e instanceof Error ? e.message : ""));
    }
  }

  async function setStatus(id: number, status: Status) {
    try {
      await api.solicitacoes.updateStatus(id, status);
      setSolicitacoes((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
      showToast(true, `Status atualizado para "${STATUS_LABEL[status]}"`);
    } catch (e) {
      showToast(false, "Erro: " + (e instanceof Error ? e.message : ""));
    }
  }

  async function deleteSolicitacao(s: Solicitacao) {
    if (!confirm(`Excluir a solicitação #${s.id} (${s.loja_nome ?? ""})?\nEsta ação não pode ser desfeita.`)) {
      return;
    }
    try {
      await api.solicitacoes.delete(s.id);
      setSolicitacoes((prev) => prev.filter((x) => x.id !== s.id));
      showToast(true, `Solicitação #${s.id} excluída`);
    } catch (e) {
      showToast(false, "Erro: " + (e instanceof Error ? e.message : ""));
    }
  }

  // ---------------- Visualizar ----------------
  function openView(s: Solicitacao) {
    setViewing(s);
    setLoadingItens(true);
    api.solicitacoes.listItens(s.id)
      .then((it) => setItens(it))
      .catch(() => showToast(false, "Erro ao carregar os itens da solicitação."))
      .finally(() => setLoadingItens(false));
  }

  // ---------------- Itens ----------------
  function addItemToForm() {
    if (!newItem.produto_id || newItem.quantidade < 1) {
      showToast(false, "Selecione um produto e quantidade ≥ 1");
      return;
    }
    const prod = produtos.find((p) => p.id === Number(newItem.produto_id));
    if (!prod) return;
    setItens((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        solicitacao_id: editing?.id ?? 0,
        produto_id: prod.id,
        produto_nome: prod.nome,
        produto_codigo: prod.codigo,
        unidade: prod.unidade,
        quantidade: newItem.quantidade,
      },
    ]);
    setNewItem({ produto_id: "", quantidade: 1 });
  }

  function removeItemFromForm(id: number) {
    setItens((prev) => prev.filter((i) => i.id !== id));
  }

  // ---------------- Table ----------------
  const cols: Column<Solicitacao>[] = [
    { key: "id", label: "ID", render: (r) => `#${r.id}` },
    { key: "loja_nome", label: "Loja" },
    { key: "usuario_nome", label: "Solicitante" },
    { key: "data_solicitacao", label: "Data", render: (r) => new Date(r.data_solicitacao).toLocaleString("pt-BR") },
    { key: "total_itens", label: "Itens", align: "right", render: (r) => (
      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
        {r.total_itens ?? 0}
      </span>
    )},
    { key: "status", label: "Status", render: (r) => statusBadge(r.status) },
  ];

  return (
    <Layout title="Solicitações de Pedidos" subtitle="Gerencie as solicitações de pedidos das filiais">
      <PageHeader
        title="Solicitações de Pedidos"
        subtitle="Análise e aprovação de pedidos"
        icon={<ClipboardList className="h-5 w-5" />}
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Nova Solicitação</Button>}
      />

      {/* Toast */}
      {toast && (
        <div className={`mb-3 rounded-lg p-3 text-sm ${toast.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {toast.msg}
        </div>
      )}

      {/* Filtros + Stats */}
      <div className="mb-4 grid gap-4 lg:grid-cols-5">
        <button
          onClick={() => setStatusFilter("todos")}
          className={`rounded-xl border p-3 text-left transition ${
            statusFilter === "todos" ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
          }`}
        >
          <div className="text-xs font-semibold uppercase text-gray-500">Total</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</div>
        </button>
        {(["pendente", "em_analise", "aprovado", "rejeitado"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-xl border p-3 text-left transition ${
              statusFilter === s ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <div className="text-xs font-semibold uppercase text-gray-500">{STATUS_LABEL[s]}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{stats[s]}</div>
          </button>
        ))}
      </div>

      <DataTable<Solicitacao>
        data={filtered}
        columns={cols}
        searchKey="loja_nome"
        searchPlaceholder="Buscar por loja..."
        emptyMessage="Nenhuma solicitação encontrada"
        actions={(r) => (
          <div className="flex justify-end gap-1">
            <button
              onClick={() => openView(r)}
              className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
              title="Visualizar"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => openEdit(r)}
              className="rounded p-1.5 text-gray-600 hover:bg-gray-100"
              title="Editar observação"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setStatus(r.id, "em_analise")}
              disabled={r.status === "em_analise"}
              className="rounded p-1.5 text-violet-600 hover:bg-violet-50 disabled:opacity-30"
              title="Marcar como em análise"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setStatus(r.id, "aprovado")}
              disabled={r.status === "aprovado"}
              className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-30"
              title="Aprovar"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setStatus(r.id, "rejeitado")}
              disabled={r.status === "rejeitado"}
              className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"
              title="Rejeitar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => deleteSolicitacao(r)}
              className="rounded p-1.5 text-red-700 hover:bg-red-50"
              title="Excluir solicitação"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      />

      {/* Modal Criar/Editar */}
      <Window
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Editar Solicitação #${editing.id}` : "Nova Solicitação"}
        subtitle={editing ? "Atualize a observação ou visualize os itens" : "Selecione a loja, adicione os itens e descreva o motivo"}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? "Salvar Alterações" : "Criar Solicitação"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Loja *</label>
              <select
                value={form.loja_id}
                onChange={(e) => setForm({ ...form, loja_id: e.target.value })}
                disabled={!!editing}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
              >
                <option value="">Selecione...</option>
                {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Observação</label>
              <input
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Motivo / contexto da solicitação"
              />
            </div>
          </div>

          {/* Itens (apenas no create) */}
          {!editing && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Itens da Solicitação *</label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                {itens.length === 0 ? (
                  <div className="rounded-md border border-dashed border-gray-300 bg-white p-3 text-center text-xs text-gray-500">
                    Nenhum item adicionado
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {itens.map((it) => (
                      <li key={it.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2">
                        <Package className="h-4 w-4 text-gray-400" />
                        <span className="flex-1 text-sm">
                          <span className="font-mono text-xs text-gray-500">{it.produto_codigo}</span>{" "}
                          {it.produto_nome}
                        </span>
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {it.quantidade} {it.unidade}
                        </span>
                        <button
                          onClick={() => removeItemFromForm(it.id)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={newItem.produto_id}
                    onChange={(e) => setNewItem({ ...newItem, produto_id: e.target.value })}
                    className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Selecionar produto...</option>
                    {produtos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} — {p.nome} (estoque: {p.estoque})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={newItem.quantidade}
                    onChange={(e) => setNewItem({ ...newItem, quantidade: Number(e.target.value) })}
                    className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="Qtd"
                  />
                  <Button size="sm" onClick={addItemToForm} icon={<Plus className="h-3 w-3" />}>
                    Adicionar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {editing && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Itens já solicitados</label>
              {loadingItens ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-center text-xs text-gray-500">
                  Carregando...
                </div>
              ) : itens.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-center text-xs text-gray-500">
                  Esta solicitação não tem itens registrados
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {itens.map((it) => (
                    <li key={it.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-sm">
                      <Package className="h-4 w-4 text-gray-400" />
                      <span className="flex-1">
                        <span className="font-mono text-xs text-gray-500">{it.produto_codigo}</span>{" "}
                        {it.produto_nome}
                      </span>
                      <span className="text-xs font-medium text-gray-700">
                        {it.quantidade} {it.unidade}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Window>

      {/* Modal Visualizar */}
      <Window
        open={!!viewing}
        onClose={() => { setViewing(null); setItens([]); }}
        title={viewing ? `Solicitação #${viewing.id}` : ""}
        subtitle="Detalhes e itens da solicitação"
        size="lg"
        footer={
          viewing ? (
            <>
              <Button variant="secondary" onClick={() => { setViewing(null); setItens([]); }}>
                Fechar
              </Button>
              {viewing.status !== "aprovado" && (
                <Button variant="success" onClick={() => { setStatus(viewing.id, "aprovado"); setViewing(null); setItens([]); }} icon={<Check className="h-4 w-4" />}>
                  Aprovar
                </Button>
              )}
            </>
          ) : null
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div className="space-y-0.5">
                <div className="text-xs uppercase text-gray-500">Status</div>
                <div>{statusBadge(viewing.status)}</div>
              </div>
              <div className="text-right text-xs text-gray-500">
                {new Date(viewing.data_solicitacao).toLocaleString("pt-BR")}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DetailRow icon={<Building2 className="h-4 w-4" />} label="Loja" value={viewing.loja_nome ?? "—"} />
              <DetailRow icon={<User className="h-4 w-4" />} label="Solicitante" value={viewing.usuario_nome ?? "—"} />
              <DetailRow icon={<Calendar className="h-4 w-4" />} label="Data" value={new Date(viewing.data_solicitacao).toLocaleString("pt-BR")} />
              <DetailRow icon={<Package className="h-4 w-4" />} label="Itens" value={String(viewing.total_itens ?? 0)} />
            </div>

            {viewing.observacao && (
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="text-xs font-semibold uppercase text-gray-500">Observação</div>
                <div className="mt-1 text-sm text-gray-700">{viewing.observacao}</div>
              </div>
            )}

            <div>
              <div className="mb-2 text-sm font-semibold text-gray-700">Itens da solicitação</div>
              {loadingItens ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-center text-xs text-gray-500">
                  Carregando...
                </div>
              ) : itens.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-center text-xs text-gray-500">
                  Nenhum item registrado
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {itens.map((it) => (
                    <li key={it.id} className="flex items-center gap-3 p-3 text-sm">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-gray-900">{it.produto_nome}</div>
                        <div className="font-mono text-[11px] text-gray-500">{it.produto_codigo}</div>
                      </div>
                      <div className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                        {it.quantidade} {it.unidade}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Window>
    </Layout>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
