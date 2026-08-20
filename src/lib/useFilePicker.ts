import { useRef, useState, useEffect } from "react";

export interface PickedFile {
  name: string;
  path: string | null;
  size: number;
  bytes: Uint8Array | null;
  preview: string;
}

export function useFilePicker() {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);

  async function buildFromPath(path: string): Promise<PickedFile> {
    const name = path.split(/[\\/]/).pop() || "pedido.pdf";
    let size = 0;
    let bytes: Uint8Array | null = null;
    let preview = "";
    try {
      const { readFile } = await import("@tauri-apps/plugin-fs");
      bytes = await readFile(path);
      size = bytes.byteLength;
      preview = Array.from(bytes.slice(0, 64))
        .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
        .join("");
    } catch (e) {
      console.warn("Falha ao ler arquivo:", e);
    }
    return { name, path, size, bytes, preview };
  }

  async function buildFromBrowserFile(f: File): Promise<PickedFile> {
    let bytes: Uint8Array | null = null;
    try {
      const buf = await f.arrayBuffer();
      bytes = new Uint8Array(buf);
    } catch (e) {
      console.warn("Falha ao ler arquivo no browser:", e);
    }
    const preview = bytes && bytes.length > 0
      ? Array.from(bytes.slice(0, 64)).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("")
      : `(browser) ${f.name} (${f.size} bytes)`;
    return {
      name: f.name,
      path: null,
      size: f.size,
      bytes,
      preview,
    };
  }

  const fileRef = useRef<PickedFile | null>(null);
  useEffect(() => { fileRef.current = file; }, [file]);

  async function pick(opts: { validatePdf?: boolean } = {}): Promise<PickedFile | null> {
    setError(null);

    // Tenta via Tauri dialog
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const sel = await openDialog({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        title: "Selecionar pedido em PDF",
      });
      if (sel && typeof sel === "string") {
        const pf = await buildFromPath(sel);
        if (pf.size === 0) {
          setError(`Arquivo vazio ou não pôde ser lido: ${pf.name}`);
          return null;
        }
        if (opts.validatePdf && !pf.preview.startsWith("%PDF-")) {
          setError(`Aviso: arquivo não parece ser PDF (cabeçalho: "${pf.preview.slice(0, 8)}")`);
        }
        setFile(pf);
        return pf;
      }
    } catch (e) {
      console.warn("Tauri dialog falhou, usando seletor HTML:", e);
    }

    // Fallback: seletor HTML
    fallbackRef.current?.click();
    return null;
  }

  function onFallbackChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      buildFromBrowserFile(f).then(pf => setFile(pf));
      setError(null);
    }
    e.target.value = "";
  }

  function clear() {
    setFile(null);
    fileRef.current = null;
    setError(null);
  }

  return { file, error, fallbackRef, pick, onFallbackChange, clear, setFile, setError, fileRef };
}

export function humanSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}
