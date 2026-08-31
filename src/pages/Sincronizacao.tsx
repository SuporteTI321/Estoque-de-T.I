import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api";
import { getCloudConfig, setCloudConfig, clearCloudConfig, cloudPullAll, cloudPushAll } from "../lib/cloudDb";
import { hasVault, isUnlocked, tryRestoreSession, unlockVault, createOrUpdateVault } from "../lib/vault";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Upload, RefreshCw, FileJson, CheckCircle, AlertTriangle, Cloud, CloudOff, Database, CloudUpload } from "lucide-react";

export default function Sincronizacao() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mensagem, setMensagem] = useState("");
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [autoSync, setAutoSync] = useState(api.sync.isAutoSyncEnabled());
  const [githubConfig, setGithubConfig] = useState({ owner: "SuporteTI321", repo: "estoque-sync", path: "sync_data.json", token: "" });
  const [hasConfig, setHasConfig] = useState(() => {
    const c = api.sync.getGithubConfig();
    return !!(c && c.owner && c.repo && c.token);
  });
  const [lastSync, setLastSync] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Banco na nuvem (com cofre) ----
  const [cloudCfg, setCloudCfg] = useState({ url: "", key: "" });
  const [hasCloud, setHasCloud] = useState(() => !!getCloudConfig());
  const [cloudStatus, setCloudStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [cloudMsg, setCloudMsg] = useState("");
  const [vaultPw, setVaultPw] = useState("");
  const [vaultLocked, setVaultLocked] = useState(() => hasVault() && !isUnlocked());

  useEffect(() => {
    const c = getCloudConfig();
    if (c) setCloudCfg(c);
    // Tenta restaurar sessão do cofre
    tryRestoreSession().then((ok: boolean) => { if (ok) setVaultLocked(false); });
  }, []);

  // Carregar config existente
  useEffect(() => {
    // 1. Tenta carregar do Tauri primeiro (Desktop)
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const rustConfig: any = await invoke("read_sync_config");
        if (rustConfig && rustConfig.owner) {
          setGithubConfig(rustConfig);
          setHasConfig(true);
          setAutoSync(!!rustConfig.auto_enabled);
          // Sincroniza para localStorage tambem (sem o token, que fica só no Rust/cofre)
          localStorage.setItem("sync_github_owner", rustConfig.owner);
          localStorage.setItem("sync_github_repo", rustConfig.repo);
          localStorage.setItem("sync_github_path", rustConfig.path || "sync_data.json");
          localStorage.setItem("sync_auto_enabled", String(!!rustConfig.auto_enabled));
          setIsDesktop(true);
          return;
        }
      } catch {
        setIsDesktop(false);
      }
      // 2. Fallback: localStorage (Web)
      const config = api.sync.getGithubConfig();
      if (config && config.owner && config.repo && config.token) {
        setGithubConfig(config);
        setHasConfig(true);
      } else {
        // Mantem os valores padrao preenchidos (owner/repo/path/token)
        // hasConfig ja comeca true com os valores padrao
      }
      setAutoSync(api.sync.isAutoSyncEnabled());
    })();
    setLastSync(localStorage.getItem("sync_last_sync"));
  }, []);

  async function handleExportar() {
    setStatus("loading");
    setMensagem("Exportando dados...");
    try {
      const json = await api.sync.exportData();
      api.sync.downloadJson(json);
      setStatus("success");
      setMensagem("Arquivo de sincronizacao baixado com sucesso!");
    } catch (e: any) {
      setStatus("error");
      setMensagem(`Erro ao exportar: ${e.message || e}`);
    }
  }

  async function handleImportar() {
    if (!fileInputRef.current) return;
    fileInputRef.current.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("loading");
    setMensagem("Importando dados...");
    try {
      const json = await api.sync.readJsonFile(file);
      const dados = JSON.parse(json);
      if (!dados.versao) throw new Error("Arquivo invalido: campo 'versao' ausente");
      const resultado = await api.sync.importData(json);
      setStatus("success");
      setMensagem(`${resultado}\n\nRecarregue a pagina para ver os dados atualizados.`);
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      setStatus("error");
      setMensagem(`Erro ao importar: ${e.message || e}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSaveGithubConfig() {
    if (!githubConfig.owner || !githubConfig.repo || !githubConfig.token) {
      setStatus("error");
      setMensagem("Preencha owner, repo e token do GitHub.");
      return;
    }
    api.sync.setGithubConfig(githubConfig.owner, githubConfig.repo, githubConfig.path, githubConfig.token);
    setHasConfig(true);
    setStatus("success");
    setMensagem("Configuracao do GitHub salva!");
  }

  function handleToggleAutoSync() {
    const next = !autoSync;
    setAutoSync(next);
    api.sync.setAutoSync(next);
    if (next) {
      setStatus("success");
      setMensagem("Sync automatica habilitada! Dados serao sincronizados a cada 30s.");
    } else {
      setStatus("success");
      setMensagem("Sync automatica desabilitada.");
    }
  }

  async function handlePushNow() {
    setStatus("loading");
    setMensagem("Enviando dados para o GitHub...");
    try {
      const r = await api.sync.pushToGithub();
      setStatus(r.ok ? "success" : "error");
      setMensagem(r.message);
      if (r.ok) setLastSync(new Date().toISOString());
    } catch (e: any) {
      setStatus("error");
      setMensagem(`Erro: ${e.message || e}`);
    }
  }

  async function handlePullNow() {
    setStatus("loading");
    setMensagem("Baixando dados do GitHub...");
    try {
      const r = await api.sync.pullFromGithub();
      setStatus(r.ok ? "success" : "error");
      setMensagem(r.message);
      if (r.changed) setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setStatus("error");
      setMensagem(`Erro: ${e.message || e}`);
    }
  }

  // ---- Banco na nuvem (com cofre criptografado) ----
  async function handleSaveCloud() {
    const isUrlOk = cloudCfg.url.includes("supabase.co");
    const isKeyOk = cloudCfg.key.startsWith("ey") || cloudCfg.key.startsWith("sb_");
    if (!isUrlOk || !isKeyOk) {
      setCloudStatus("error");
      setCloudMsg("Verifique a URL (https://xxx.supabase.co) e a key (eyJ... ou sb_publishable_...).");
      return;
    }
    if (!vaultPw) {
      setCloudStatus("error");
      setCloudMsg("Defina uma senha mestra para o cofre — só você saberá. Ela criptografa as chaves localmente.");
      return;
    }
    try {
      await createOrUpdateVault({ cloud_url: cloudCfg.url, cloud_key: cloudCfg.key }, vaultPw);
      // Mantém compatibilidade legada
      setCloudConfig(cloudCfg.url, cloudCfg.key);
      setHasCloud(true);
      setVaultLocked(false);
      setCloudStatus("success");
      setCloudMsg("Cofre criado — chaves criptografadas! Recarregando...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setCloudStatus("error");
      setCloudMsg(e.message || String(e));
    }
  }

  async function handleUnlockVault() {
    try {
      const ok = await unlockVault(vaultPw);
      if (!ok) { setCloudStatus("error"); setCloudMsg("Senha incorreta"); return; }
      const c = getCloudConfig();
      if (c) setCloudCfg(c);
      setVaultLocked(false);
      setHasCloud(!!c);
      setCloudStatus("success");
      setCloudMsg("Cofre desbloqueado");
    } catch (e: any) {
      setCloudStatus("error");
      setCloudMsg(e.message || String(e));
    }
  }

  async function handleCloudPush() {
    if (!confirm("Enviar TODOS os dados locais para a nuvem? Isso SUBSTITUIRA os dados atuais da nuvem.")) return;
    setCloudStatus("loading");
    setCloudMsg("Enviando dados locais para a nuvem...");
    try {
      const total = await cloudPushAll();
      setCloudStatus("success");
      setCloudMsg(`${total} registros enviados. Outros dispositivos agora veem esses dados.`);
    } catch (e: any) {
      setCloudStatus("error");
      setCloudMsg(`Erro: ${e.message || e}`);
    }
  }

  async function handleCloudPull() {
    if (!confirm("Baixar dados da nuvem? Isso SUBSTITUIRA os dados locais deste dispositivo.")) return;
    setCloudStatus("loading");
    setCloudMsg("Baixando dados da nuvem...");
    try {
      const total = await cloudPullAll();
      setCloudStatus("success");
      setCloudMsg(`${total} registros recebidos. Recarregando...`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setCloudStatus("error");
      setCloudMsg(`Erro: ${e.message || e}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")} className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Sincronizacao</h1>
      </div>
      <p className="text-sm text-gray-600">
        Sincronize dados entre Web e Desktop automaticamente via GitHub ou manualmente via arquivo JSON.
      </p>

      {isDesktop !== null && (
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
          isDesktop ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
        }`}>
          {isDesktop ? "Desktop (SQLite)" : "Web (localStorage)"}
        </div>
      )}

      {status !== "idle" && (
        <div className={`rounded-lg p-4 ${
          status === "success" ? "bg-green-50 text-green-800" :
          status === "error" ? "bg-red-50 text-red-800" :
          "bg-blue-50 text-blue-800"
        }`}>
          <div className="flex items-center gap-2">
            {status === "success" && <CheckCircle className="h-5 w-5" />}
            {status === "error" && <AlertTriangle className="h-5 w-5" />}
            {status === "loading" && <RefreshCw className="h-5 w-5 animate-spin" />}
            <span className="whitespace-pre-wrap text-sm">{mensagem}</span>
          </div>
        </div>
      )}

      {/* === SYNC AUTOMATICA VIA GITHUB === */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {autoSync ? <Cloud className="h-5 w-5 text-green-600" /> : <CloudOff className="h-5 w-5 text-gray-400" />}
            <h3 className="text-sm font-semibold text-gray-900">Sync Automatica (GitHub)</h3>
          </div>
          <button
            onClick={handleToggleAutoSync}
            disabled={!hasConfig}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              autoSync ? "bg-green-600" : "bg-gray-300"
            } ${!hasConfig ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              autoSync ? "translate-x-6" : "translate-x-1"
            }`} />
          </button>
        </div>

        {!hasConfig ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Configure um repositorio GitHub privado para sincronizar os dados entre Web e Desktop.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Owner (ex: SuporteTI321)"
                value={githubConfig.owner}
                onChange={(e) => setGithubConfig({ ...githubConfig, owner: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Repo (ex: estoque-sync)"
                value={githubConfig.repo}
                onChange={(e) => setGithubConfig({ ...githubConfig, repo: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                placeholder="Caminho (padrao: sync_data.json)"
                value={githubConfig.path}
                onChange={(e) => setGithubConfig({ ...githubConfig, path: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="password"
                placeholder="Token GitHub (ghp_...)"
                value={githubConfig.token}
                onChange={(e) => setGithubConfig({ ...githubConfig, token: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleSaveGithubConfig}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Salvar Configuracao
            </button>
            <p className="text-[11px] text-gray-400">
              Crie um repo privado no GitHub e gere um Personal Access Token (Settings &gt; Developer settings &gt; Tokens).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-gray-600">
              <span className="font-medium">{githubConfig.owner}/{githubConfig.repo}</span>
              <span className="ml-2 text-gray-400">/ {githubConfig.path}</span>
            </div>
            {lastSync && (
              <div className="text-[11px] text-gray-400">
                Ultimo sync: {new Date(lastSync).toLocaleString("pt-BR")}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handlePushNow} disabled={status === "loading"}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                Push Agora
              </button>
              <button onClick={handlePullNow} disabled={status === "loading"}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                Pull Agora
              </button>
              <button onClick={() => { api.sync.setGithubConfig("", "", "", ""); setHasConfig(false); setAutoSync(false); api.sync.setAutoSync(false); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* === BANCO DE DADOS NA NUVEM === */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Banco de Dados na Nuvem (Supabase)</h3>
          {hasCloud && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
              <Cloud className="h-3 w-3" /> Conectado
            </span>
          )}
        </div>
        <p className="mb-4 text-xs text-gray-600">
          Configure um projeto gratuito no supabase.com, execute o script <code>supabase/schema.sql</code> no SQL Editor
          e cole aqui a URL e a anon key. Todos os dispositivos passam a compartilhar o mesmo banco.
        </p>

        {cloudStatus !== "idle" && (
          <div className={`mb-4 rounded-lg p-3 text-sm ${
            cloudStatus === "success" ? "bg-green-50 text-green-800" :
            cloudStatus === "error" ? "bg-red-50 text-red-800" : "bg-blue-50 text-blue-800"
          }`}>
            {cloudMsg}
          </div>
        )}

        {vaultLocked ? (
          <div className="space-y-3">
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-3">🔒 Cofre trancado — digite sua senha mestra para desbloquear.</p>
            <input type="password" placeholder="Senha mestra" value={vaultPw} onChange={(e) => setVaultPw(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full" />
            <button onClick={handleUnlockVault} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">Desbloquear</button>
          </div>
        ) : !hasCloud ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <input placeholder="Project URL (https://xxxx.supabase.co)" value={cloudCfg.url} onChange={(e) => setCloudCfg({ ...cloudCfg, url: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input placeholder="Anon public key (eyJ...)" value={cloudCfg.key} onChange={(e) => setCloudCfg({ ...cloudCfg, key: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs" />
              <input type="password" placeholder="Senha mestra do cofre (só você saberá)" value={vaultPw} onChange={(e) => setVaultPw(e.target.value)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm" />
            </div>
            <button onClick={handleSaveCloud} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Salvar no Cofre (criptografado)</button>
            <p className="text-[11px] text-gray-500">As chaves são criptografadas com sua senha (PBKDF2 + AES-GCM). Sem a senha ninguém lê — nem inspecionando o navegador.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button onClick={handleCloudPush} disabled={cloudStatus === "loading"}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              <CloudUpload className="h-4 w-4" /> Enviar dados locais para nuvem
            </button>
            <button onClick={handleCloudPull} disabled={cloudStatus === "loading"}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Download className="h-4 w-4" /> Baixar dados da nuvem
            </button>
            <button onClick={() => { clearCloudConfig(); setHasCloud(false); setCloudCfg({ url: "", key: "" }); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Desconectar
            </button>
          </div>
        )}
      </div>

      {/* === SYNC MANUAL VIA ARQUIVO === */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <FileJson className="h-4 w-4" />
          Sync Manual (Arquivo JSON)
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button onClick={handleExportar} disabled={status === "loading"}
            className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-5 text-center transition hover:border-blue-300 hover:shadow-md disabled:opacity-50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <Download className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Exportar</div>
              <div className="mt-1 text-xs text-gray-500">Baixar arquivo JSON</div>
            </div>
          </button>

          <button onClick={handleImportar} disabled={status === "loading"}
            className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-5 text-center transition hover:border-green-300 hover:shadow-md disabled:opacity-50">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Upload className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Importar</div>
              <div className="mt-1 text-xs text-gray-500">Selecionar arquivo JSON</div>
            </div>
          </button>

          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
        </div>
      </div>
    </div>
  );
}
