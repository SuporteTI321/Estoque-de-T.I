import { useEffect, useState } from "react";
import { UserCog, Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import Button from "../components/Button";
import Window from "../components/Window";
import type { Usuario } from "../lib/types";
import { api } from "../lib/api";

export default function Usuarios() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Usuario[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState<Partial<Usuario>>({ perfil: "operador", ativo: true });

  function load() {
    api.usuarios.list().then(setItems).catch(() => setItems([]));
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm({ perfil: "operador", ativo: true }); setOpen(true); }
  function openEdit(u: Usuario) { setEditing(u); setForm({ ...u, senha: "" }); setOpen(true); } // nunca pré-preenche o hash

  async function save() {
    try {
      if (!form.nome?.trim()) { alert("Informe o nome do usuário."); return; }
      if (editing?.id) {
        // Envia senha vazia quando não digitada — backend trata "" como "manter a senha atual"
        const u = await api.usuarios.update(editing.id, { ...form, senha: form.senha || "" });
        setItems((p) => p.map((x) => (x.id === editing.id ? { ...x, ...u } : x)));
      } else {
        if (!form.senha) { alert("A senha é obrigatória para novos usuários."); return; }
        const n = await api.usuarios.create(form as Omit<Usuario, "id">);
        if (n) setItems((p) => [...p, n]);
      }
      setOpen(false);
    } catch (e) { alert("Erro ao salvar usuário: " + (e instanceof Error ? e.message : "")); }
  }

  function del(u: Usuario) {
    if (!confirm(`Excluir ${u.nome}?`)) return;
    api.usuarios.delete(u.id!)
      .then(() => setItems((p) => p.filter((x) => x.id !== u.id)))
      .catch((e) => alert("Falha ao excluir usuário: " + (e instanceof Error ? e.message : e)));
  }

  const perfilBadge = (p: string) => {
    const map: Record<string, string> = {
      admin: "bg-violet-50 text-violet-700",
      filial: "bg-blue-50 text-blue-700",
      operador: "bg-gray-100 text-gray-700",
    };
    return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[p] || "bg-gray-100"}`}>{p}</span>;
  };

  const cols: Column<Usuario>[] = [
    { key: "nome", label: "Nome" },
    { key: "perfil", label: "Perfil", render: (r) => perfilBadge(r.perfil) },
  ];

  return (
    <Layout title="Usuários" subtitle="Gerencie usuários e permissões">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate("/perfil")} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
      </div>
      <PageHeader
        title="Usuários"
        subtitle="Usuários do sistema e suas permissões"
        icon={<UserCog className="h-5 w-5" />}
        action={<Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>Novo Usuário</Button>}
      />
      <DataTable<Usuario>
        data={items}
        columns={cols}
        searchKey="nome"
        searchPlaceholder="Buscar usuário..."
        actions={(r) => (
          <div className="flex justify-end gap-1">
            <button onClick={() => openEdit(r)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => del(r)} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      />

      <Window
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar Usuário" : "Novo Usuário"}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome</label>
            <input value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Senha</label>
            <input type="password" value={form.senha || ""} onChange={(e) => setForm({ ...form, senha: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder={editing ? "Deixe vazio para manter a senha atual" : "Senha do usuário"} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Perfil</label>
            <select value={form.perfil || "operador"} onChange={(e) => setForm({ ...form, perfil: e.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="admin">Administrador</option>
              <option value="filial">Filial</option>
              <option value="operador">Operador</option>
            </select>
          </div>
        </div>
      </Window>
    </Layout>
  );
}
