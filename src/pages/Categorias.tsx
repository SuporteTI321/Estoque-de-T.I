import { useEffect, useState } from "react";
import { Tag, Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type { Categoria } from "../lib/types";
import { api } from "../lib/api";

export default function Categorias() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Categoria[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Categoria | null>(null);
  const [form, setForm] = useState<Partial<Categoria>>({});

  async function load() {
    try { setItems(await api.categorias.list()); }
    catch { setItems([]); }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm({}); setOpen(true); }
  function openEdit(c: Categoria) { setEditing(c); setForm(c); setOpen(true); }

  async function save() {
    try {
      if (editing?.id) {
        await api.categorias.update(editing.id, { nome: form.nome, descricao: form.descricao, ativa: form.ativa ?? true });
      } else {
        await api.categorias.create({ nome: form.nome || "", descricao: form.descricao || "", ativa: true });
      }
      setOpen(false);
      load();
    } catch (e) { alert("Erro: " + (e instanceof Error ? e.message : "")); }
  }

  async function del(c: Categoria) {
    if (!confirm(`Excluir ${c.nome}?`)) return;
    try { await api.categorias.remove(c.id); load(); }
    catch (e) { alert("Erro: " + (e instanceof Error ? e.message : "")); }
  }

  const cols: Column<Categoria>[] = [
    { key: "nome", label: "Nome" },
    { key: "descricao", label: "Descrição", render: (r) => r.descricao || "—" },
  ];

  return (
    <Layout title="Categorias" subtitle="Organize os produtos por categoria">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate("/configuracoes")} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
      </div>
      <PageHeader title="Categorias" subtitle="Cadastro de categorias" icon={<Tag className="h-5 w-5" />}
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Nova Categoria</Button>} />
      <DataTable<Categoria> data={items} columns={cols} searchKey="nome" searchPlaceholder="Buscar categoria..."
        actions={(r) => (
          <div className="flex justify-end gap-1">
            <button onClick={() => openEdit(r)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => del(r)} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )} />
      <Window open={open} onClose={() => setOpen(false)} title={editing ? "Editar Categoria" : "Nova Categoria"}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
        <div className="space-y-3">
          <div><label className="block text-sm font-medium text-gray-700">Nome</label>
            <input value={form.nome || ""} onChange={e => setForm({ ...form, nome: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
          <div><label className="block text-sm font-medium text-gray-700">Descrição</label>
            <textarea value={form.descricao || ""} onChange={e => setForm({ ...form, descricao: e.target.value })}
              rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
        </div>
      </Window>
    </Layout>
  );
}
