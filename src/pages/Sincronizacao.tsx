import { useState, useRef } from "react";
import { api } from "../lib/api";
import { Download, Upload, RefreshCw, FileJson, CheckCircle, AlertTriangle } from "lucide-react";

export default function Sincronizacao() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mensagem, setMensagem] = useState("");
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detectar se esta no desktop (Tauri) ou browser
  useState(() => {
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("export_all_data");
        setIsDesktop(true);
      } catch {
        setIsDesktop(false);
      }
    })();
  });

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

      // Validar estrutura basica
      if (!dados.versao) {
        throw new Error("Arquivo invalido: campo 'versao' ausente");
      }

      const resultado = await api.sync.importData(json);
      setStatus("success");
      setMensagem(`${resultado}\n\nRecarregue a pagina para ver os dados atualizados.`);

      // Recarregar apos 2 segundos
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      setStatus("error");
      setMensagem(`Erro ao importar: ${e.message || e}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Sincronizacao</h1>
      <p className="text-sm text-gray-600">
        Exporte os dados para um arquivo JSON e importe em outra versao (Web ou Desktop).
      </p>

      {/* Status badge */}
      {isDesktop !== null && (
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
          isDesktop ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
        }`}>
          {isDesktop ? "Desktop (SQLite)" : "Web (localStorage)"}
        </div>
      )}

      {/* Status message */}
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

      {/* Cards de acao */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Exportar */}
        <button
          onClick={handleExportar}
          disabled={status === "loading"}
          className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm transition hover:border-blue-300 hover:shadow-md disabled:opacity-50"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <Download className="h-7 w-7 text-blue-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Exportar Dados</div>
            <div className="mt-1 text-xs text-gray-500">
              Baixa um arquivo JSON com todos os dados do sistema
            </div>
          </div>
        </button>

        {/* Importar */}
        <button
          onClick={handleImportar}
          disabled={status === "loading"}
          className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm transition hover:border-green-300 hover:shadow-md disabled:opacity-50"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <Upload className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">Importar Dados</div>
            <div className="mt-1 text-xs text-gray-500">
              Seleciona um arquivo JSON para importar os dados
            </div>
          </div>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Instrucoes */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
          <FileJson className="h-4 w-4" />
          Como sincronizar
        </h3>
        <ol className="space-y-2 text-xs text-gray-600">
          <li><strong>1.</strong> Na versao de origem (ex: Web), clique em "Exportar Dados"</li>
          <li><strong>2.</strong> Salve o arquivo JSON gerado</li>
          <li><strong>3.</strong> Na versao de destino (ex: Desktop), clique em "Importar Dados"</li>
          <li><strong>4.</strong> Selecione o arquivo JSON salvo</li>
          <li><strong>5.</strong> O sistema sera recarregado com os dados sincronizados</li>
        </ol>
        <div className="mt-3 rounded-lg bg-yellow-50 p-2 text-[11px] text-yellow-800">
          <strong>Atencao:</strong> A importacao substitui todos os dados existentes.
          Faça um backup antes de importar.
        </div>
      </div>
    </div>
  );
}
