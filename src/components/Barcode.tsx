import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  width?: number;
  height?: number;
  fontSize?: number;
}

export default function Barcode({ value, width = 1.5, height = 40, fontSize = 10 }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width,
          height,
          fontSize,
          displayValue: true,
          background: "transparent",
          lineColor: "#000",
          margin: 0,
        });
      } catch {
        // fallback: mostra o código como texto
      }
    }
  }, [value, width, height, fontSize]);

  return <svg ref={svgRef} />;
}
