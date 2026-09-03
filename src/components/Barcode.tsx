import { useEffect, useRef, memo } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  width?: number;
  fontSize?: number;
}

// Largura ótima auto-ajustada para qualquer etiqueta (nunca muito junto)
function calcOptimalWidth(value: string, larguraMm = 70): number {
  const margin = 10
  const disponivelMm = Math.max(8, larguraMm - 3)
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

// Cache global de barcodes renderizados — barcode identico = SVG identico
const barcodeCache = new Map<string, string>()

function generateBarcodeSvg(value: string, width: number, fontSize: number): string {
  const w = calcOptimalWidth(value, 70) // auto para etiquetas médias; se width explícito for maior, respeita
  const useW = width && width !== 1.5 ? Math.min(width, 2.6) : w
  const key = `${value}|${useW}|${fontSize}`
  if (barcodeCache.has(key)) return barcodeCache.get(key)!

  const svgNs = "http://www.w3.org/2000/svg"
  const el = document.createElementNS(svgNs, "svg")
  try {
    JsBarcode(el, value, {
      format: "CODE128",
      width: useW,
      height: 50,
      fontSize,
      displayValue: false,
      background: "#FFFFFF",
      lineColor: "#000000",
      margin: 10,
      flat: true,
    })
    el.style.backgroundColor = "#FFFFFF"
    el.style.padding = "0"
    el.style.shapeRendering = "crispEdges" as any
    const html = el.outerHTML
    barcodeCache.set(key, html)
    return html
  } catch {
    return ""
  }
}

const Barcode = memo(function Barcode({ value, width, fontSize = 10 }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        const w = width ? Math.min(width, 2.6) : calcOptimalWidth(value, 70)
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width: w,
          height: 50,
          fontSize,
          displayValue: false,
          background: "#FFFFFF",
          lineColor: "#000000",
          margin: 10,
          flat: true,
        });
        svgRef.current.style.backgroundColor = "#FFFFFF";
        (svgRef.current.style as any).shapeRendering = "crispEdges";
      } catch {
        // fallback: mostra o codigo como texto
      }
    }
  }, [value, width, fontSize]);


  return <svg ref={svgRef} style={{ display: "block", width: "auto", maxWidth: "100%", height: "auto", backgroundColor: "#FFFFFF", shapeRendering: "crispEdges" as any, margin: "0 auto" }} />;
});

export { generateBarcodeSvg }
export default Barcode
