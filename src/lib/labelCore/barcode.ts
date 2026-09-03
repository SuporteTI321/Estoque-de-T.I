/**
 * LabelCore — Barcode com auto-ajuste para qualquer tamanho
 */
import JsBarcode from 'jsbarcode'

export function calcBarcodeWidth(value: string, larguraMm: number, leftMm: number): number {
  const margin = 10
  const disponivelMm = Math.max(8, larguraMm - (leftMm ?? 1) - 2)
  const disponivelPx = disponivelMm * 3.78
  const modulos = value.length * 11 + 35
  const raw = (disponivelPx - 2 * margin) / modulos
  if (larguraMm <= 30) {
    if (value.length > 8) return Math.max(0.7, Math.min(1.4, raw))
    return Math.max(0.8, Math.min(1.6, raw))
  }
  if (value.length > 12) return Math.max(0.9, Math.min(2.0, raw))
  if (value.length > 8) return Math.max(1.0, Math.min(2.2, raw))
  return Math.max(1.2, Math.min(2.6, raw))
}

export function getBarcodeSvg(value: string, width?: number, height?: number): string {
  const w = width ?? 2.0
  const h = height ?? 48
  try {
    const svgNs = 'http://www.w3.org/2000/svg'
    const el = document.createElementNS(svgNs, 'svg')
    JsBarcode(el, value, {
      format: 'CODE128',
      width: w,
      height: h,
      fontSize: 10,
      displayValue: false,
      background: '#FFFFFF',
      lineColor: '#000000',
      margin: 10,
      flat: true,
      textMargin: 0,
    })
    el.setAttribute('style', 'display:block;width:auto;max-width:100%;height:100%;background:#FFFFFF;shape-rendering:crispEdges;image-rendering:crisp-edges;padding:0;margin:0 auto')
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    el.style.backgroundColor = '#FFFFFF'
    return el.outerHTML
  } catch {
    return `<span style="font-family:monospace;font-size:8px">${value}</span>`
  }
}

export function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
