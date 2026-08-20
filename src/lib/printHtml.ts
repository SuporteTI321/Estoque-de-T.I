/**
 * Salva HTML em arquivo temporario e abre no navegador para impressao.
 * Funciona tanto no Tauri (desktop) quanto no browser (web).
 */

function isTauri(): boolean {
  try {
    return typeof window !== "undefined" && "__TAURI__" in window;
  } catch {
    return false;
  }
}

export async function printHtml(html: string, titulo: string = "Impressao") {
  // Injeta auto-print ao carregar a pagina
  const autoPrint = `<script>window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 500); window.onafterprint = function() { window.close(); }; });</` + `script>`;
  let htmlFinal = html;
  if (/<\/body>/i.test(htmlFinal)) {
    htmlFinal = htmlFinal.replace(/<\/body>/i, autoPrint + "</body>");
  } else {
    htmlFinal = htmlFinal + autoPrint;
  }

  // Tenta via Tauri (desktop)
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const filePath: string = await invoke("save_romaneio_html", {
        html: htmlFinal,
        numero: titulo,
      });
      await invoke("open_in_browser", { file_path: filePath });
      return;
    } catch (err) {
      console.warn("[printHtml] Tauri falhou, usando fallback browser:", err);
    }
  }

  // Fallback: abre em nova aba do navegador
  try {
    const blob = new Blob([htmlFinal], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => {
        setTimeout(() => {
          try { win.print(); } catch {}
        }, 500);
      };
    }
  } catch (err) {
    console.error("[printHtml] Falha:", err);
    alert("Nao foi possivel abrir a impressao: " + String(err));
  }
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
  h.push(`<h1>${opts.titulo}</h1>`);
  h.push(`<hr>`);
  h.push(`<p><b>PEDIDO:</b> ${opts.pedido}</p>`);
  if (opts.codigo) h.push(`<p><b>CODIGO:</b> ${opts.codigo}</p>`);
  if (opts.loja) h.push(`<p><b>LOJA:</b> ${opts.loja}</p>`);
  if (opts.solicitante) h.push(`<p><b>SOLICITANTE:</b> ${opts.solicitante}</p>`);
  if (opts.setor) h.push(`<p><b>SETOR:</b> ${opts.setor}</p>`);
  if (opts.dataSolicitacao) h.push(`<p><b>SOLICITACAO:</b> ${opts.dataSolicitacao}</p>`);
  if (opts.dataSaida) h.push(`<p><b>SAIDA:</b> ${opts.dataSaida}</p>`);
  h.push(`<hr>`);
  h.push(`<p style="display:flex;justify-content:space-between"><b>ITEM</b><span style="text-align:center;min-width:20px"><b>QTD</b></span></p>`);
  const total = opts.itens.reduce((s, i) => s + i.qtd, 0);
  for (const item of opts.itens) {
    const nome = item.produto.replace(/</g, "<");
    h.push(`<p style="display:flex;justify-content:space-between"><span>${nome}</span><span style="text-align:center;min-width:20px">${item.qtd}</span></p>`);
  }
  h.push(`<hr>`);
  h.push(`<p><b>TOTAL DE ITENS:</b> ${opts.itens.length}</p>`);
  h.push(`<p><b>QUANTIDADE TOTAL:</b> ${total}</p>`);
  h.push(`<hr>`);
  h.push(`<br><br>`);
  h.push(`<p style="text-align:center">_________________________________</p>`);
  h.push(`<p style="text-align:center"><b>ASSINATURA DO RECEBEDOR</b></p>`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${opts.titulo} ${opts.pedido}</title><style>${css}</style></head><body>${h.join(String.fromCharCode(10))}</body></html>`;

  printHtml(html, `${opts.titulo} ${opts.pedido}`);
}
