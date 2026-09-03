/**
 * printWindow — Nova janela dedicada de impressão
 * Abre conteúdo em janela isolada com estilos de impressão otimizados
 */

export function openPrintWindow(htmlContent: string, title = "Impressão", options?: {
  width?: number
  height?: number
  showPreview?: boolean
}) {
  const { width = 900, height = 700, showPreview = true } = options ?? {}

  // Tenta abrir nova janela (popup)
  const printWin = window.open("", "_blank", `width=${width},height=${height},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`)

  if (!printWin) {
    // Fallback: usa iframe se popup bloqueado
    console.warn("[printWindow] Popup bloqueado, usando fallback iframe")
    const iframe = document.createElement("iframe")
    iframe.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;border:none;z-index:999999;background:#fff"
    document.body.appendChild(iframe)
    const doc = iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(htmlContent)
      doc.close()
      doc.title = title
      const doPrint = () => {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe) }, 500)
      }
      if (doc.readyState === "complete") setTimeout(doPrint, 300)
      else iframe.onload = () => setTimeout(doPrint, 300)
    }
    return null
  }

  // Escreve conteúdo na nova janela
  printWin.document.open()
  printWin.document.write(htmlContent)
  printWin.document.close()
  printWin.document.title = title

  // Injeta barra de controle se showPreview
  if (showPreview) {
    const injectControls = () => {
      try {
        const doc = printWin.document
        const bar = doc.createElement("div")
        bar.id = "print-controls"
        bar.style.cssText = "position:fixed;top:0;left:0;right:0;background:#1e293b;color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;z-index:999999;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.2);"
        bar.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-weight:600;font-size:13px;">🖨️ ${title}</span>
            <span style="font-size:11px;opacity:0.7;">Pronto para imprimir</span>
          </div>
          <div style="display:flex;gap:8px;">
            <button id="btn-print-now" style="background:#3b82f6;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">Imprimir Agora</button>
            <button id="btn-close-win" style="background:#475569;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px;">Fechar</button>
          </div>
        `
        doc.body.style.paddingTop = "48px"
        doc.body.insertBefore(bar, doc.body.firstChild)

        const style = doc.createElement("style")
        style.textContent = `
          @media print {
            #print-controls { display: none !important; }
            body { padding-top: 0 !important; }
          }
        `
        doc.head.appendChild(style)

        const btnPrint = doc.getElementById("btn-print-now")
        const btnClose = doc.getElementById("btn-close-win")
        btnPrint?.addEventListener("click", () => { printWin.focus(); printWin.print() })
        btnClose?.addEventListener("click", () => printWin.close())

        // Atalho Ctrl+P
        doc.addEventListener("keydown", (e: KeyboardEvent) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "p") {
            e.preventDefault()
            printWin.print()
          }
          if (e.key === "Escape") printWin.close()
        })
      } catch {}
    }

    if (printWin.document.readyState === "complete") setTimeout(injectControls, 100)
    else printWin.addEventListener("load", () => setTimeout(injectControls, 100))

    // Foca a nova janela
    printWin.focus()
  }

  return printWin
}

export function printViaNewWindow(htmlContent: string, title = "Impressão") {
  const win = openPrintWindow(htmlContent, title, { showPreview: true })
  return win
}
