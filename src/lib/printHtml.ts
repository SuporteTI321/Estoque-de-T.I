

/**
 * Salva HTML em arquivo temporario e abre no navegador para impressao.
 * Funciona tanto no Tauri (desktop) quanto no browser (web).
 */

let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let tauriChecked = false;

async function getTauriInvoke() {
  if (tauriChecked) return tauriInvoke;
  tauriChecked = true;
  try {
    if (typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || !!(window as any).__TAURI__)) {
      const mod = await import("@tauri-apps/api/core");
      tauriInvoke = mod.invoke;
    }
  } catch {}
  return tauriInvoke;
}

export async function printHtml(html: string, titulo: string = "Impressao") {
  const invoke = await getTauriInvoke();

  // Tenta via Tauri (desktop) — caminho rapido
  if (invoke) {
    try {
      await invoke("save_and_open_html", { html, titulo });
      return;
    } catch (err) {
      console.warn("[printHtml] Tauri falhou, usando fallback browser:", err);
    }
  }

  // Fallback: blob URL + window.open
  try {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { try { win.print(); } catch {} };
    } else {
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;";
      iframe.src = url;
      iframe.onload = () => {
        try { iframe.contentWindow?.print(); } catch {}
        setTimeout(() => { URL.revokeObjectURL(url); iframe.remove(); }, 2000);
      };
      document.body.appendChild(iframe);
    }
  } catch (err) {
    console.error("[printHtml] Falha:", err);
  }
}

/** Escapa caracteres especiais para interpolação segura em HTML */
function esc(s: string): string {
  // Reutiliza a função de security.ts para consistência
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type TamanhoEtiqueta = "pequena" | "media" | "grande";


/**
 * [LEGADO] Monta HTML de etiquetas (simples, sem barcode).
 */
export function montarHtmlEtiquetas(opts: {
  produtos: { id: number; nome: string; codigo: string; marca?: string | null; modelo?: string | null; categoria_nome?: string | null }[];
  quantidades: Record<number, number>;
  empresa: string;
  tamanho: TamanhoEtiqueta;
}): string {
  const dims: Record<string, {w:number;h:number}> = { pequena:{w:50,h:25}, media:{w:70,h:35}, grande:{w:100,h:50} }
  const d = dims[opts.tamanho] ?? dims.media
  const etiquetas = opts.produtos.map(p=> `<div style="width:${d.w}mm;height:${d.h}mm;border:1px solid #333;padding:2mm;margin:1mm;box-sizing:border-box;font-family:sans-serif;display:inline-block;vertical-align:top;overflow:hidden"><div style="font-weight:bold;font-size:2.1mm">${esc(p.codigo)}</div><div style="font-weight:bold;font-size:2.8mm">${esc(p.nome)}</div><div style="font-size:1.8mm">${esc(p.marca||'')} ${esc(p.modelo||'')}</div></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas ${esc(opts.empresa)}</title><style>@page{size:A4 portrait;margin:5mm}body{margin:0;font-family:sans-serif}</style></head><body>${etiquetas}</body></html>`
}

/**
 * Monta HTML de romaneio basico (80mm termica) e imprime.
 */
export function imprimirRomaneio(opts: {
  titulo: string;
  pedido: string;
  codigo?: string;
  loja?: string;
  solicitante?: string;
  dataSolicitacao?: string;
  dataSaida?: string;
  itens: { produto: string; qtd: number }[];
  setor?: string;
  cssExtra?: string;
}) {
  const css = `@page{size:80mm 297mm;margin:0}body{font-family:monospace;font-size:10px;margin:0;padding:6mm;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1{font-size:13px;text-align:center;margin:0 0 2mm;font-weight:bold}hr{border:none;border-top:1px dashed #000;margin:1mm 0}p{margin:0}b{font-weight:bold}${opts.cssExtra || ""}`;

  const h: string[] = [];
  h.push(`<h1>${esc(opts.titulo)}</h1>`);
  h.push(`<hr>`);
  h.push(`<p><b>PEDIDO:</b> ${esc(opts.pedido)}</p>`);
  if (opts.codigo) h.push(`<p><b>CODIGO:</b> ${esc(opts.codigo)}</p>`);
  if (opts.loja) h.push(`<p><b>LOJA:</b> ${esc(opts.loja)}</p>`);
  if (opts.solicitante) h.push(`<p><b>SOLICITANTE:</b> ${esc(opts.solicitante)}</p>`);
  if (opts.setor) h.push(`<p><b>SETOR:</b> ${esc(opts.setor)}</p>`);
  if (opts.dataSolicitacao) h.push(`<p><b>SOLICITACAO:</b> ${esc(opts.dataSolicitacao)}</p>`);
  if (opts.dataSaida) h.push(`<p><b>SAIDA:</b> ${esc(opts.dataSaida)}</p>`);
  h.push(`<hr>`);
  h.push(`<p style="display:flex;justify-content:space-between"><b>ITEM</b><span style="text-align:center;min-width:20px"><b>QTD</b></span></p>`);
  const total = opts.itens.reduce((s, i) => s + i.qtd, 0);
  for (const item of opts.itens) {
    const nome = esc(item.produto);
    h.push(`<p style="display:flex;justify-content:space-between"><span>${nome}</span><span style="text-align:center;min-width:20px">${item.qtd}</span></p>`);
  }
  h.push(`<hr>`);
  h.push(`<p><b>TOTAL DE ITENS:</b> ${opts.itens.length}</p>`);
  h.push(`<p><b>QUANTIDADE TOTAL:</b> ${total}</p>`);
  h.push(`<hr>`);
  h.push(`<br><br>`);
  h.push(`<p style="text-align:center">_________________________________</p>`);
  h.push(`<p style="text-align:center"><b>ASSINATURA DO RECEBEDOR</b></p>`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.titulo)} ${esc(opts.pedido)}</title><style>${css}</style></head><body>${h.join(String.fromCharCode(10))}</body></html>`;

  printHtml(html, `${opts.titulo} ${opts.pedido}`);
}
