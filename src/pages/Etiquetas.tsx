import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Printer, Search, Package, X, GripVertical,
  ArrowUp, ArrowDown, Trash2, Minus, Plus, ChevronDown, Check
} from "lucide-react";
import Layout from "../components/Layout";
import Button from "../components/Button";
import type { Produto } from "../lib/types";
import { api } from "../lib/api";
import { printHtml } from "../lib/printHtml";
import { renumerar } from "../lib/utils";
import JsBarcode from "jsbarcode";

/* ────────── Tipos ────────── */

interface ItemConfig {
  visivel: boolean;
  fontSize: number;
  negrito: boolean;
  cor: string;
  alinhamento: "esquerda" | "centro" | "direita";
  posX: number;
  posY: number;
  largura: number;
}

interface EtiquetaConfig {
  largura: number;
  altura: number;
  colunas: number;
  margem: number;
  borda: boolean;
  colunaInicial: number; // coluna de início (1-based)
  linhaInicial: number;  // linha de início (1-based)
  itemCodigo: ItemConfig;
  itemNome: ItemConfig;
  itemMarca: ItemConfig;
  itemModelo: ItemConfig;
  itemBarras: ItemConfig;
}

interface EtiquetaTemplate {
  id: string;
  nome: string;
  dimensoes: string;
  descricao: string;
  config: Partial<EtiquetaConfig>;
}

/* ────────── Config padrão de cada item ────────── */

const DEFAULT_ITEM_CODIGO: ItemConfig = {
  visivel: true, fontSize: 14, negrito: true, cor: "#000000",
  alinhamento: "centro", posX: 0, posY: 1, largura: 100,
};

const DEFAULT_ITEM_NOME: ItemConfig = {
  visivel: true, fontSize: 12, negrito: false, cor: "#000000",
  alinhamento: "centro", posX: 0, posY: 8, largura: 100,
};

const DEFAULT_ITEM_MARCA: ItemConfig = {
  visivel: true, fontSize: 10, negrito: false, cor: "#000000",
  alinhamento: "centro", posX: 0, posY: 14, largura: 100,
};

const DEFAULT_ITEM_MODELO: ItemConfig = {
  visivel: true, fontSize: 10, negrito: false, cor: "#000000",
  alinhamento: "centro", posX: 0, posY: 19, largura: 100,
};

const DEFAULT_ITEM_BARRAS: ItemConfig = {
  visivel: true, fontSize: 6, negrito: false, cor: "#000000",
  alinhamento: "centro", posX: 10, posY: 24, largura: 80,
};

/* ────────── Templates ────────── */

const TEMPLATES: EtiquetaTemplate[] = [
  { id: "pequena", nome: "Pequena", dimensoes: "38 × 25", descricao: "Etiqueta compacta para prateleira",
    config: {
      largura: 38, altura: 25,
      itemCodigo: { visivel: true, fontSize: 10, negrito: true, cor: "#000000", alinhamento: "centro", posX: 0, posY: 1, largura: 100 },
      itemNome: { visivel: true, fontSize: 9, negrito: false, cor: "#000000", alinhamento: "centro", posX: 0, posY: 7, largura: 100 },
      itemMarca: { visivel: false, fontSize: 8, negrito: false, cor: "#000000", alinhamento: "centro", posX: 0, posY: 12, largura: 100 },
      itemModelo: { visivel: false, fontSize: 8, negrito: false, cor: "#000000", alinhamento: "centro", posX: 0, posY: 16, largura: 100 },
      itemBarras: { visivel: true, fontSize: 8, negrito: false, cor: "#000000", alinhamento: "centro", posX: 9, posY: 18, largura: 80 },
    } },
  { id: "media", nome: "Média", dimensoes: "50 × 30", descricao: "Tamanho padrão para produtos",
    config: {
      largura: 50, altura: 30,
      itemCodigo: { visivel: true, fontSize: 14, negrito: true, cor: "#000000", alinhamento: "centro", posX: 0, posY: 1, largura: 100 },
      itemNome: { visivel: true, fontSize: 11, negrito: false, cor: "#000000", alinhamento: "centro", posX: 0, posY: 8, largura: 100 },
      itemMarca: { visivel: true, fontSize: 9, negrito: false, cor: "#000000", alinhamento: "centro", posX: 0, posY: 15, largura: 100 },
      itemModelo: { visivel: true, fontSize: 9, negrito: false, cor: "#000000", alinhamento: "centro", posX: 0, posY: 20, largura: 100 },
      itemBarras: { visivel: true, fontSize: 10, negrito: false, cor: "#000000", alinhamento: "centro", posX: 10, posY: 24, largura: 80 },
    } },
  { id: "grande", nome: "Grande", dimensoes: "63 × 38", descricao: "Produtos grandes ou exposição",
    config: {
      largura: 63, altura: 38,
      itemCodigo: { visivel: true, fontSize: 16, negrito: true, cor: "#000000", alinhamento: "centro", posX: 0, posY: 2, largura: 100 },
      itemNome: { visivel: true, fontSize: 13, negrito: false, cor: "#000000", alinhamento: "centro", posX: 0, posY: 10, largura: 100 },
      itemMarca: { visivel: true, fontSize: 10, negrito: false, cor: "#000000", alinhamento: "centro", posX: 0, posY: 20, largura: 100 },
      itemModelo: { visivel: true, fontSize: 10, negrito: false, cor: "#000000", alinhamento: "centro", posX: 0, posY: 26, largura: 100 },
      itemBarras: { visivel: true, fontSize: 12, negrito: false, cor: "#000000", alinhamento: "centro", posX: 12, posY: 30, largura: 80 },
    } },
  { id: "extra", nome: "Extra Grande", dimensoes: "100 × 50", descricao: "Caixas ou pallets",
    config: {
      largura: 100, altura: 50,
      itemCodigo: { visivel: true, fontSize: 20, negrito: true, cor: "#000000", alinhamento: "esquerda", posX: 2, posY: 2, largura: 96 },
      itemNome: { visivel: true, fontSize: 16, negrito: false, cor: "#000000", alinhamento: "esquerda", posX: 2, posY: 14, largura: 96 },
      itemMarca: { visivel: true, fontSize: 12, negrito: false, cor: "#000000", alinhamento: "esquerda", posX: 2, posY: 26, largura: 96 },
      itemModelo: { visivel: true, fontSize: 12, negrito: false, cor: "#000000", alinhamento: "esquerda", posX: 2, posY: 34, largura: 96 },
      itemBarras: { visivel: true, fontSize: 14, negrito: false, cor: "#000000", alinhamento: "centro", posX: 10, posY: 40, largura: 80 },
    } },
];

const DEFAULT_CONFIG: EtiquetaConfig = {
  largura: 50, altura: 30, colunas: 4, margem: 5, borda: true,
  colunaInicial: 1, linhaInicial: 1,
  itemCodigo: { ...DEFAULT_ITEM_CODIGO },
  itemNome: { ...DEFAULT_ITEM_NOME },
  itemMarca: { ...DEFAULT_ITEM_MARCA },
  itemModelo: { ...DEFAULT_ITEM_MODELO },
  itemBarras: { ...DEFAULT_ITEM_BARRAS },
};

/* ────────── Componente Mini Barcode (para preview) ────────── */

function MiniBarcode({ value, width = 1, height = 12, color = "#000" }: { value: string; width?: number; height?: number; color?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width,
          height,
          displayValue: false,
          background: "transparent",
          lineColor: color,
          margin: 0,
        });
      } catch {
        // fallback silencioso
      }
    }
  }, [value, width, height, color]);

  return <svg ref={svgRef} style={{ maxWidth: "100%", height: "auto" }} />;
}

/* ────────── Configurador de Item ────────── */

const ITEM_DEFAULTS: Record<string, ItemConfig> = {
  itemCodigo: DEFAULT_ITEM_CODIGO,
  itemNome: DEFAULT_ITEM_NOME,
  itemMarca: DEFAULT_ITEM_MARCA,
  itemModelo: DEFAULT_ITEM_MODELO,
  itemBarras: DEFAULT_ITEM_BARRAS,
};

function ItemConfigurator({ label, itemKey, item, onChange }: {
  label: string;
  itemKey: string;
  item: ItemConfig;
  onChange: (item: ItemConfig) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border transition-all ${
      item.visivel ? "border-gray-200 bg-gray-50" : "border-gray-100 bg-gray-50/50 opacity-60"
    }`}>
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-700 flex-1 text-left">
          <span className={`text-[8px] transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
          {label}
          <span className="text-[9px] text-gray-400 ml-auto mr-1">
            {item.fontSize}px · ({item.posX},{item.posY})
          </span>
        </button>
        <button onClick={() => onChange({ ...item, visivel: !item.visivel })}
          className={`h-4 w-7 rounded-full transition ${item.visivel ? "bg-gray-900" : "bg-gray-200"}`}>
          <div className={`h-3 w-3 rounded-full transition-transform mt-0.5 ${
            item.visivel ? "ml-[14px] bg-white" : "ml-0.5 bg-white"
          }`} />
        </button>
      </div>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-gray-100 pt-2">
          {/* Posição X, Y e Largura */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">X (mm)</label>
              <input type="number" min={0} max={100} step={0.5} value={item.posX}
                onChange={(e) => onChange({ ...item, posX: Math.max(0, Number(e.target.value)) })}
                className="w-full rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-center outline-none focus:border-gray-900" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Y (mm)</label>
              <input type="number" min={0} max={100} step={0.5} value={item.posY}
                onChange={(e) => onChange({ ...item, posY: Math.max(0, Number(e.target.value)) })}
                className="w-full rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-center outline-none focus:border-gray-900" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-0.5">Largura %</label>
              <input type="number" min={10} max={100} step={5} value={item.largura}
                onChange={(e) => onChange({ ...item, largura: Math.max(10, Math.min(100, Number(e.target.value))) })}
                className="w-full rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-center outline-none focus:border-gray-900" />
            </div>
          </div>

          {/* Tamanho da fonte (oculto para Barras) */}
          {itemKey !== "itemBarras" && (
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] text-gray-500">Fonte</label>
              <span className="text-[10px] text-gray-400">{item.fontSize}px</span>
            </div>
            <input type="range" min={3} max={24} value={item.fontSize}
              onChange={(e) => onChange({ ...item, fontSize: Number(e.target.value) })}
              className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900" />
          </div>
          )}

          {/* Alinhamento */}
          <div>
            <label className="text-[10px] text-gray-500 block mb-0.5">Alinhamento</label>
            <div className="flex gap-1">
              {(["esquerda", "centro", "direita"] as const).map((a) => (
                <button key={a} onClick={() => onChange({ ...item, alinhamento: a })}
                  className={`flex-1 py-0.5 rounded text-[10px] transition ${
                    item.alinhamento === a ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}>
                  {a === "esquerda" ? "←" : a === "centro" ? "↔" : "→"}
                </button>
              ))}
            </div>
          </div>

          {/* Restaurar padrão */}
          <button onClick={() => onChange({ ...(ITEM_DEFAULTS[itemKey] || DEFAULT_ITEM_CODIGO) })}
            className="w-full text-[10px] text-gray-400 hover:text-gray-600 py-0.5 transition">
            Restaurar padrão
          </button>
        </div>
      )}
    </div>
  );
}

/* ────────── Componente ────────── */

export default function Etiquetas() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [ordem, setOrdem] = useState<number[]>([]);
  const [config, setConfig] = useState<EtiquetaConfig>(() => {
    const saved = localStorage.getItem("almox_etiqueta_config_v5");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge com defaults para garantir que todos os campos existam
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          itemCodigo: { ...DEFAULT_ITEM_CODIGO, ...parsed.itemCodigo },
          itemNome: { ...DEFAULT_ITEM_NOME, ...parsed.itemNome },
          itemMarca: { ...DEFAULT_ITEM_MARCA, ...parsed.itemMarca },
          itemModelo: { ...DEFAULT_ITEM_MODELO, ...parsed.itemModelo },
          itemBarras: { ...DEFAULT_ITEM_BARRAS, ...parsed.itemBarras },
        };
      } catch { return DEFAULT_CONFIG; }
    }
    return DEFAULT_CONFIG;
  });
  const [qtd, setQtd] = useState<Record<number, number>>({});
  const [busca, setBusca] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [produtosOpen, setProdutosOpen] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    api.produtos.list().then((p) => {
      const r = renumerar(p);
      setProdutos(r);
      setOrdem(r.map((x) => x.id!));
      const produtoId = searchParams.get("produto");
      if (produtoId) {
        const id = Number(produtoId);
        setSelecionados(new Set([id]));
      }
    }).catch(() => {});
  }, []);

  const produtosFiltrados = useMemo(() => {
    if (!busca) return produtos;
    const b = busca.toLowerCase();
    return produtos.filter((p) =>
      p.nome.toLowerCase().includes(b) ||
      (p.codigo && p.codigo.toLowerCase().includes(b)) ||
      (p.marca && p.marca.toLowerCase().includes(b))
    );
  }, [produtos, busca]);

  const selecionadosArr = useMemo(() =>
    produtos.filter((p) => selecionados.has(p.id!)),
  [produtos, selecionados]);

  /* ─── Drag & Drop ─── */

  function onDragStart(idx: number) {
    dragItem.current = idx;
    setDragIdx(idx);
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragItem.current === null || dragItem.current === idx) return;
    const nova = [...ordem];
    const item = nova.splice(dragItem.current, 1)[0];
    nova.splice(idx, 0, item);
    setOrdem(nova);
    dragItem.current = idx;
  }

  function onDragEnd() {
    dragItem.current = null;
    setDragIdx(null);
  }

  /* ─── Seleção ─── */

  function toggleSel(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selecionados.size === produtosFiltrados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(produtosFiltrados.map((p) => p.id!)));
    }
  }

  function removerDaFila(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function atualizarQtd(id: number, delta: number) {
    setQtd((prev) => {
      const atual = prev[id] || 1;
      const nova = Math.max(1, atual + delta);
      return { ...prev, [id]: nova };
    });
  }

  /* ─── Ordenação ─── */

  function moverCima(id: number) {
    setOrdem((prev) => {
      const i = prev.indexOf(id);
      if (i <= 0) return prev;
      const nova = [...prev];
      [nova[i - 1], nova[i]] = [nova[i], nova[i - 1]];
      return nova;
    });
  }

  function moverBaixo(id: number) {
    setOrdem((prev) => {
      const i = prev.indexOf(id);
      if (i < 0 || i >= prev.length - 1) return prev;
      const nova = [...prev];
      [nova[i], nova[i + 1]] = [nova[i + 1], nova[i]];
      return nova;
    });
  }

  /* ─── Config ─── */

  useEffect(() => {
    localStorage.setItem("almox_etiqueta_config_v5", JSON.stringify(config));
  }, [config]);

  function applyTemplate(t: EtiquetaTemplate) {
    setConfig((prev) => ({
      ...DEFAULT_CONFIG,
      ...t.config,
      itemCodigo: { ...DEFAULT_ITEM_CODIGO, ...t.config.itemCodigo },
      itemNome: { ...DEFAULT_ITEM_NOME, ...t.config.itemNome },
      itemMarca: { ...DEFAULT_ITEM_MARCA, ...t.config.itemMarca },
      itemModelo: { ...DEFAULT_ITEM_MODELO, ...t.config.itemModelo },
      itemBarras: { ...DEFAULT_ITEM_BARRAS, ...t.config.itemBarras },
    }));
  }

  /* ─── Cálculo do preview ─── */
  const ESPACO = 2; // espaço fixo entre etiquetas (mm)
  const posXFolha = config.margem + (config.colunaInicial - 1) * (config.largura + ESPACO);
  const posYFolha = config.margem + (config.linhaInicial - 1) * (config.altura + ESPACO);
  const totalLinhasPreview = Math.max(1, Math.floor((297 - posYFolha) / (config.altura + ESPACO)));
  const totalEtiquetasFolha = totalLinhasPreview * config.colunas;
  const alignCss = { esquerda: "left" as const, centro: "center" as const, direita: "right" as const };

  /* ─── Impressão ─── */

  function gerarEtiquetas() {
    const itensOrdem = ordem
      .filter((id) => selecionados.has(id))
      .map((id) => produtos.find((p) => p.id === id)!)
      .filter(Boolean);

    if (itensOrdem.length === 0) { alert("Selecione ao menos um produto"); return; }

    const alignMap = { esquerda: "left", centro: "center", direita: "right" } as const;

    /* ── Helpers ── */
    function itemHtml(
      item: { visivel: boolean; posX: number; posY: number; largura: number; fontSize: number; negrito: boolean; cor: string; alinhamento: string },
      texto: string,
    ) {
      if (!item.visivel || !texto) return "";
      return `<div class="item" style="left:${item.posX}%;top:${item.posY}mm;width:${item.largura}%;font-size:${item.fontSize}px;font-weight:${item.negrito ? "bold" : "normal"};color:${item.cor};text-align:${alignMap[item.alinhamento as keyof typeof alignMap]};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${texto}</div>`;
    }

    function barcodeSvg(codigo: string) {
      const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      try {
        JsBarcode(tmp, codigo, {
          format: "CODE128",
          width: 2,
          height: 40,
          displayValue: false,
          background: "transparent",
          lineColor: config.itemBarras.cor,
          margin: 0,
        });
        // Remove atributos width/height fixos e usa style para escalar no container
        tmp.removeAttribute("width");
        tmp.removeAttribute("height");
        tmp.setAttribute("style", "max-width:100%;height:auto;");
        return tmp.outerHTML;
      } catch {
        return "";
      }
    }

    /* ── Monta HTML — barcode SVG inline, sem CDN ── */
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @page { size: 210mm 297mm; margin: 0 !important; }
  html { margin: 0; padding: 0; }
  body { margin: 0; padding: 0; }
  .folha { position: relative; width: 210mm; height: 297mm; margin: 0; padding: 0; }
  .etiqueta { position: absolute; overflow: hidden; margin: 0; padding: 0; }
  .item { position: absolute; margin: 0; padding: 0; }
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; width: 210mm !important; height: 297mm !important; overflow: hidden !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    .folha { margin: 0 !important; padding: 0 !important; }
    .etiqueta, .item { color: #000 !important; }
    svg { color: #000 !important; }
  }
</style>
</head><body><div class="folha">`;

    for (const p of itensOrdem) {
      const q = qtd[p.id!] || 1;
      for (let i = 0; i < q; i++) {
        html += `<div class="etiqueta" style="left:${posXFolha}mm;top:${posYFolha}mm;width:${config.largura}mm;height:${config.altura}mm;${config.borda ? "border:0.5px solid #d1d5db;" : ""}">`;
        html += itemHtml(config.itemCodigo, p.codigo || "");
        html += itemHtml(config.itemNome, p.nome);
        const marcaModelo = [p.marca, p.modelo].filter(Boolean).join(" ");
        html += itemHtml(config.itemMarca, marcaModelo);
        if (config.itemBarras.visivel && p.codigo) {
          html += `<div class="item" style="left:${config.itemBarras.posX}%;top:${config.itemBarras.posY}mm;width:${config.itemBarras.largura}%;overflow:hidden;">${barcodeSvg(p.codigo)}</div>`;
        }
        html += `</div>`;
      }
    }

    html += `</div></body></html>`;

    printHtml(html, "Etiquetas");
  }

  /* ─── Dados para preview dinâmico ─── */
  const previewItens = useMemo(() => {
    const itens: Produto[] = [];
    for (const id of ordem) {
      if (selecionados.has(id)) {
        const p = produtos.find((x) => x.id === id);
        if (p) itens.push(p);
      }
    }
    return itens;
  }, [ordem, selecionados, produtos]);

  return (
    <Layout title="Etiquetas" subtitle="Gere etiquetas para impressão">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px] overflow-hidden h-[calc(100vh-120px)]">

        {/* ── Coluna principal: Produtos ── */}
        <div className="space-y-4">
          {/* Seleção de produtos — botão trigger */}
          <button
            onClick={() => setProdutosOpen(true)}
            className="w-full flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm shadow-sm hover:border-gray-300 transition"
          >
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-400" />
              {selecionados.size > 0 ? (
                <span className="font-medium text-gray-900">
                  {selecionados.size} produto{selecionados.size !== 1 ? "s" : ""} selecionado{selecionados.size !== 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-gray-400">Selecionar produtos...</span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>

          {/* Janela flutuante de seleção */}
          {produtosOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              {/* Fundo escurecido */}
              <div className="absolute inset-0 bg-black/40" onClick={() => setProdutosOpen(false)} />

              {/* Janela */}
              <div ref={dropdownRef} className="relative z-10 flex w-[560px] max-h-[80vh] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl">
                {/* Cabeçalho */}
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">Selecionar Produtos</h3>
                  <button onClick={() => setProdutosOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Busca + selecionar todos */}
                <div className="border-b border-gray-100 px-5 py-3">
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar por nome, código ou marca..."
                      className="w-full rounded-lg border border-gray-200 pl-8 pr-8 py-2 text-sm focus:outline-none focus:border-blue-400"
                    />
                    {busca && (
                      <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={toggleAll}
                    className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-800"
                  >
                    {selecionados.size === produtosFiltrados.length && produtosFiltrados.length > 0 ? (
                      <Package className="h-3.5 w-3.5 text-blue-600" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded border-2 border-gray-300" />
                    )}
                    {selecionados.size === produtosFiltrados.length && produtosFiltrados.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
                  </button>
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-auto px-2 py-1">
                  {produtosFiltrados.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400">
                      {busca ? "Nenhum produto encontrado" : "Nenhum produto disponível"}
                    </div>
                  ) : (
                    produtosFiltrados.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => toggleSel(p.id!)}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition cursor-pointer ${
                          selecionados.has(p.id!) ? "bg-blue-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-center">
                          {selecionados.has(p.id!) ? (
                            <div className="h-4 w-4 rounded bg-blue-600 flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          ) : (
                            <div className="h-4 w-4 rounded border-2 border-gray-300" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-gray-800">{p.nome}</div>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">
                            <span className="font-mono">{p.codigo}</span>
                            {p.marca && <span>| {p.marca}</span>}
                          </div>
                        </div>
                        {selecionados.has(p.id!) && (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => atualizarQtd(p.id!, -1)}
                              className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-medium">{qtd[p.id!] || 1}</span>
                            <button
                              onClick={() => atualizarQtd(p.id!, 1)}
                              className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Rodapé */}
                <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                  <span className="text-xs text-gray-400">
                    {selecionados.size} de {produtos.length} produto{produtos.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => setProdutosOpen(false)}
                    className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preview A4 */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Preview (Folha A4)</h3>
              <span className="text-[11px] text-gray-400">
                {previewItens.length} etiqueta{previewItens.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex justify-center bg-gray-50 rounded-lg p-4">
              <div className="border border-gray-300 bg-white shadow-sm" style={{ width: "185mm", height: "196mm" }}>
                <div className="relative origin-top-left" style={{ width: "210mm", height: "297mm", transform: "scale(0.881)" }}>
                  {(() => {
                    if (previewItens.length === 0) return null;
                    const produto = previewItens[0];
                    const etiquetaW = config.largura;
                    const etiquetaH = config.altura;
                    const baseX = posXFolha;
                    const baseY = posYFolha;

                    return (
                      <div
                        className={`absolute bg-white ${config.borda ? "border border-solid border-gray-300" : ""}`}
                        style={{
                          left: `${baseX}mm`,
                          top: `${baseY}mm`,
                        width: `${etiquetaW}mm`,
                        height: `${etiquetaH}mm`,
                      }}
                    >
                      {config.itemCodigo.visivel && produto.codigo && (
                        <div className="absolute truncate"
                          style={{
                            left: `${config.itemCodigo.posX}%`,
                            top: `${config.itemCodigo.posY}mm`,
                            width: `${config.itemCodigo.largura}%`,
                            fontSize: `${config.itemCodigo.fontSize}px`,
                            fontWeight: config.itemCodigo.negrito ? "bold" : "normal",
                            color: config.itemCodigo.cor,
                            textAlign: alignCss[config.itemCodigo.alinhamento],
                          }}>
                          {produto.codigo}
                        </div>
                      )}
                      {config.itemNome.visivel && (
                        <div className="absolute truncate"
                          style={{
                            left: `${config.itemNome.posX}%`,
                            top: `${config.itemNome.posY}mm`,
                            width: `${config.itemNome.largura}%`,
                            fontSize: `${config.itemNome.fontSize}px`,
                            fontWeight: config.itemNome.negrito ? "bold" : "normal",
                            color: config.itemNome.cor,
                            textAlign: alignCss[config.itemNome.alinhamento],
                          }}>
                          {produto.nome}
                        </div>
                      )}
                      {config.itemMarca.visivel && (produto.marca || produto.modelo) && (
                        <div className="absolute truncate"
                          style={{
                            left: `${config.itemMarca.posX}%`,
                            top: `${config.itemMarca.posY}mm`,
                            width: `${config.itemMarca.largura}%`,
                            fontSize: `${config.itemMarca.fontSize}px`,
                            fontWeight: config.itemMarca.negrito ? "bold" : "normal",
                            color: config.itemMarca.cor,
                            textAlign: alignCss[config.itemMarca.alinhamento],
                          }}>
                          {[produto.marca, produto.modelo].filter(Boolean).join(" ")}
                        </div>
                      )}
                      {config.itemBarras.visivel && produto.codigo && (
                        <div className="absolute overflow-hidden"
                          style={{
                            left: `${config.itemBarras.posX}%`,
                            top: `${config.itemBarras.posY}mm`,
                            width: `${config.itemBarras.largura}%`,
                          }}>
                           <MiniBarcode value={produto.codigo} width={2} height={40} color={config.itemBarras.cor} />
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="absolute bottom-1 right-2 text-[7px] text-gray-300">A4</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Coluna lateral: Config + Fila ── */}
        <div className="space-y-4">
          {/* Config rápida */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Configuração</h3>
              <Button onClick={gerarEtiquetas} disabled={selecionados.size === 0} icon={<Printer className="h-4 w-4" />}>
                Imprimir ({selecionados.size})
              </Button>
            </div>

            {/* Templates */}
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPLATES.map((t) => {
                const isActive = config.largura === t.config.largura && config.altura === t.config.altura;
                return (
                  <button key={t.id} onClick={() => applyTemplate(t)}
                    className={`rounded-lg p-2 text-left text-xs transition-all ${
                      isActive ? "bg-gray-900 text-white shadow" : "bg-gray-50 hover:bg-gray-100 text-gray-700"
                    }`}>
                    <div className="font-medium">{t.nome}</div>
                    <div className={`text-[10px] ${isActive ? "text-gray-400" : "text-gray-400"}`}>{t.dimensoes} mm</div>
                  </button>
                );
              })}
            </div>

            {/* Dimensões — Manual */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-500">Largura</label>
                  <div className="flex items-center gap-1">
                    <input type="number" min={10} max={300} value={config.largura}
                      onChange={(e) => setConfig((prev) => ({ ...prev, largura: Math.max(10, Number(e.target.value)) }))}
                      className="w-14 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-center focus:border-gray-900 focus:bg-white outline-none" />
                    <span className="text-[10px] text-gray-400">mm</span>
                  </div>
                </div>
                <input type="range" min={10} max={300} value={config.largura}
                  onChange={(e) => setConfig((prev) => ({ ...prev, largura: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-500">Altura</label>
                  <div className="flex items-center gap-1">
                    <input type="number" min={10} max={200} value={config.altura}
                      onChange={(e) => setConfig((prev) => ({ ...prev, altura: Math.max(10, Number(e.target.value)) }))}
                      className="w-14 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-center focus:border-gray-900 focus:bg-white outline-none" />
                    <span className="text-[10px] text-gray-400">mm</span>
                  </div>
                </div>
                <input type="range" min={10} max={200} value={config.altura}
                  onChange={(e) => setConfig((prev) => ({ ...prev, altura: Number(e.target.value) }))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Margem (mm)</label>
                <input type="number" min={0} max={50} value={config.margem}
                  onChange={(e) => setConfig((prev) => ({ ...prev, margem: Math.max(0, Math.min(50, Number(e.target.value))) }))}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm focus:border-gray-900 focus:bg-white focus:ring-1 focus:ring-gray-200 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Coluna inicial</label>
                  <input type="number" min={1} max={10} value={config.colunaInicial}
                    onChange={(e) => setConfig((prev) => ({ ...prev, colunaInicial: Math.max(1, Math.min(10, Number(e.target.value))) }))}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm focus:border-gray-900 focus:bg-white focus:ring-1 focus:ring-gray-200 outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Linha inicial</label>
                  <input type="number" min={1} max={20} value={config.linhaInicial}
                    onChange={(e) => setConfig((prev) => ({ ...prev, linhaInicial: Math.max(1, Math.min(20, Number(e.target.value))) }))}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm focus:border-gray-900 focus:bg-white focus:ring-1 focus:ring-gray-200 outline-none" />
                </div>
              </div>
            </div>

            {/* Ajuste dos Itens */}
            <div>
              <h4 className="text-[11px] font-semibold text-gray-700 mb-2">Itens da Etiqueta</h4>
              <div className="space-y-2">
                {([
                  ["itemCodigo", "Código", config.itemCodigo],
                  ["itemNome", "Nome", config.itemNome],
                  ["itemMarca", "Marca / Modelo", config.itemMarca],
                  ["itemBarras", "Barras", config.itemBarras],
                ] as const).map(([key, label, item]) => (
                  <ItemConfigurator
                    key={key}
                    label={label}
                    itemKey={key}
                    item={item}
                    onChange={(newItem) => setConfig((prev) => ({ ...prev, [key]: newItem }))}
                  />
                ))}
              </div>
            </div>

            {/* Borda */}
            <button onClick={() => setConfig((prev) => ({ ...prev, borda: !prev.borda }))}
              className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                config.borda ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}>
              <span>Borda</span>
              <div className={`h-4 w-7 rounded-full transition ${config.borda ? "bg-white/20" : "bg-gray-200"}`}>
                <div className={`h-3 w-3 rounded-full transition-transform mt-0.5 ${
                  config.borda ? "ml-[14px] bg-white" : "ml-0.5 bg-white"
                }`} />
              </div>
            </button>
          </div>

          {/* Fila de impressão (drag-and-drop) */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Fila de Impressão ({selecionadosArr.length})</h3>
            {selecionadosArr.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nenhum produto selecionado</p>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-auto">
                {selecionadosArr.map((p) => (
                  <div key={p.id}
                    draggable
                    onDragStart={() => onDragStart(ordem.indexOf(p.id!))}
                    onDragOver={(e) => onDragOver(e, ordem.indexOf(p.id!))}
                    onDragEnd={onDragEnd}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition cursor-grab ${
                      dragIdx === ordem.indexOf(p.id!) ? "border-blue-400 bg-blue-50" : "border-gray-100 hover:bg-gray-50"
                    }`}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0 truncate font-medium text-gray-800">{p.nome}</div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => moverCima(p.id!)} className="rounded p-0.5 text-gray-400 hover:text-gray-600">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button onClick={() => moverBaixo(p.id!)} className="rounded p-0.5 text-gray-400 hover:text-gray-600">
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button onClick={() => removerDaFila(p.id!)} className="rounded p-0.5 text-gray-400 hover:text-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
