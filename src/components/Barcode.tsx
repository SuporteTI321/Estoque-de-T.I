import { useEffect, useRef, memo } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  width?: number;
  fontSize?: number;
}

// Cache global de barcodes renderizados — barcode identico = SVG identico
const barcodeCache = new Map<string, string>()

function generateBarcodeSvg(value: string, width: number, fontSize: number): string {
  const key = `${value}|${width}|${fontSize}`
  if (barcodeCache.has(key)) return barcodeCache.get(key)!

  const svgNs = "http://www.w3.org/2000/svg"
  const el = document.createElementNS(svgNs, "svg")
  try {
    JsBarcode(el, value, {
      format: "CODE128",
      width,
      height: 40,
      fontSize,
      displayValue: false,
      background: "transparent",
      lineColor: "#000",
      margin: 0,
    })
    const html = el.outerHTML
    barcodeCache.set(key, html)
    return html
  } catch {
    return ""
  }
}

const Barcode = memo(function Barcode({ value, width = 1.5, fontSize = 10 }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width,
          height: 40,
          fontSize,
          displayValue: false,
          background: "transparent",
          lineColor: "#000",
          margin: 0,
        });
      } catch {
        // fallback: mostra o codigo como texto
      }
    }
  }, [value, width, fontSize]);

  return <svg ref={svgRef} style={{ display: "block", width: "100%", height: "100%" }} />;
});

export { generateBarcodeSvg }
export default Barcode
