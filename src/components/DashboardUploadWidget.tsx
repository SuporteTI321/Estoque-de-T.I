import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileCheck2, X, Loader2 } from "lucide-react";
import type { Loja } from "../lib/types";
import { api } from "../lib/api";
import { useFilePicker, humanSize } from "../lib/useFilePicker";

/** Compact Upload widget embedded in the Dashboard.
 *  - click button or drop a file → readFile via Tauri
 *  - need to choose a Loja
 *  - creates a Pedido via api.pedidos.create() and refreshes local state
 */
export default function DashboardUploadWidget() {
  const navigate = useNavigate();
  const { file, error, fallbackRef, pick, onFallbackChange, clear, setError } = useFilePicker();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [lojaId, setLojaId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { api.lojas.list().then(setLojas); }, []);

  async function handlePick(e: React.MouseEvent) {
    e.stopPropagation();
    await pick();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const dt = new DataTransfer();
      dt.items.add(f);
      if (fallbackRef.current) {
        fallbackRef.current.files = dt.files;
        fallbackRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  async function handleImport() {
    if (!file) return;
    if (!lojaId) {
      setError("Selecione uma loja");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const loja = lojas.find((l) => l.id === Number(lojaId));
      const codigoLoja = loja?.codigo || "PED";
      const ano = new Date().getFullYear();
      const prefixo = `${codigoLoja}-${ano}-`;
      const todosPeds = await api.pedidos.list();
      const existentes = todosPeds
        .filter(p => p.numero?.startsWith(prefixo))
        .map(p => parseInt((p.numero ?? "").split("-").pop() || "0", 10))
        .filter(n => !isNaN(n));
      const prox = (existentes.length > 0 ? Math.max(...existentes) : 0) + 1;
      const numero = `${prefixo}${String(prox).padStart(6, "0")}`;
      await api.pedidos.create({
        numero,
        loja_id: Number(lojaId),
        solicitante: loja?.nome ?? "—",
        setor: null,
        origem: "manual",
        arquivo_pdf: file.name,
        loja_nome: loja?.nome ?? null,
        loja_codigo: loja?.codigo ?? null,
        data_pedido: undefined as any,
      });
      setMsg({ ok: true, text: `${numero} importado (${humanSize(file.size)})` });
      clear();
      setLojaId("");
    } catch (e) {
      setMsg({ ok: false, text: "Erro: " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col-span-12 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
      <h3 className="text-sm font-semibold text-gray-900">Upload de Pedido (PDF)</h3>

      <div
        className={`mt-3 rounded-lg border-2 border-dashed p-3 text-center transition ${
          dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"
        }`}
        onClick={handlePick}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="flex justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Upload className="h-4 w-4" />
          </div>
        </div>
        {file ? (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
            <FileCheck2 className="h-3 w-3 shrink-0 text-emerald-600" />
            <span className="truncate font-semibold">{file.name}</span>
            <span className="text-emerald-700">({humanSize(file.size)})</span>
            <button onClick={(e) => { e.stopPropagation(); clear(); }} className="ml-auto rounded p-0.5 hover:bg-emerald-100">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[11px] text-gray-600">Arraste o PDF aqui</p>
            <p className="text-[10px] text-gray-400">ou</p>
            <button
              onClick={handlePick}
              className="mt-1 inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
            >
              <Upload className="h-3 w-3" /> Selecionar PDF
            </button>
          </>
        )}
        <p className="mt-2 text-[10px] text-gray-500">
          Itens extraídos automaticamente
        </p>
      </div>

      <input ref={fallbackRef} type="file" accept="application/pdf" className="hidden" onChange={onFallbackChange} />

      {file && (
        <div className="mt-3 space-y-2">
          <select
            value={lojaId}
            onChange={(e) => setLojaId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">Loja...</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <button
            onClick={(e) => { e.stopPropagation(); handleImport(); }}
            disabled={!lojaId || busy}
            className="flex w-full items-center justify-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCheck2 className="h-3 w-3" />}
            {busy ? "Importando..." : "Importar agora"}
          </button>
        </div>
      )}

      {error && <div className="mt-2 text-[11px] text-red-600">{error}</div>}
      {msg && (
        <div className={`mt-2 text-[11px] ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <button
        onClick={() => navigate("/upload")}
        className="mt-3 w-full text-[11px] font-medium text-blue-600 hover:underline"
      >
        Abrir página completa →
      </button>
    </div>
  );
}
