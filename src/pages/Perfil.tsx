import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, User, Lock, Save } from "lucide-react";
import Layout from "../components/Layout";
import PageHeader from "../components/PageHeader";
import Button from "../components/Button";
import { api } from "../lib/api";
import { useAuth } from "../lib/useAuth";

export default function Perfil() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [nome, setNome] = useState(user?.nome || "");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setMsg(null);
    try {
      if (senhaNova && senhaNova.length < 4) {
        setMsg({ ok: false, text: "A nova senha deve ter no mínimo 4 caracteres." });
        setSaving(false);
        return;
      }
      await api.usuarios.update(user.id!, { nome });
      if (senhaNova && senhaAtual) {
        await api.usuarios.update(user.id!, { senha: senhaNova });
      }
      setMsg({ ok: true, text: "Perfil atualizado com sucesso!" });
      setSenhaAtual("");
      setSenhaNova("");
    } catch (e) {
      setMsg({ ok: false, text: "Erro: " + (e instanceof Error ? e.message : "") });
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <Layout title="Meu Perfil" subtitle="Suas informações de acesso">
      <PageHeader
        title="Meu Perfil"
        subtitle="Dados do usuário logado"
        icon={<User className="h-5 w-5" />}
        action={
          <button
            onClick={() => navigate("/configuracoes")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </button>
        }
      />

      {msg && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}



      <div className="max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <div className="space-y-5">
          {/* Informações fixas */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Email:</span>
              <span className="font-semibold text-gray-900">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Perfil:</span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 capitalize">{user.perfil}</span>
            </div>
            {user.loja_nome && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Loja:</span>
                <span className="font-medium text-gray-900">{user.loja_nome}</span>
              </div>
            )}
          </div>

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Nome completo</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>

          {/* Senha */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
              <Lock className="h-4 w-4 text-gray-500" /> Alterar Senha
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Senha atual</label>
                <input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Deixe em branco para manter" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Nova senha</label>
                <input type="password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Mínimo 4 caracteres" />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button icon={<Save className="h-4 w-4" />} onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </div>
      </div>

      
    </Layout>
  );
}
