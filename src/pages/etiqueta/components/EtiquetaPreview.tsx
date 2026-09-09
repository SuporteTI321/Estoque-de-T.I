/**
 * EtiquetaPreview — Componente de Preview da Etiqueta
 * Extraído e convertido de: controle-estoque-tauri (Next.js) → React/Vite/Tauri
 */
import { useEffect, useRef } from 'react'

interface BarcodeProps {
  codigo: string
  altura?: number
  maxWidthMm?: number
  compacto?: boolean
}

const MM_PX = 3.7795275591

// Espaçamento interno (módulo): prioriza barras bem separadas.
// Modo normal: mínimo 1.3. Modo compacto (etiquetas <30mm): mínimo 0.85.
// CODE128: ~11 módulos por caractere + overhead de start/stop.
function escolherModulo(codigo: string, maxWidthMm?: number, compacto?: boolean): number {
  if (!maxWidthMm || maxWidthMm <= 0) return 2
  const availPx = maxWidthMm * MM_PX
  const totalModulos = 11 * (codigo.length + 3) + 2
  const quiet = compacto ? 4 * 2 : 8 * 2
  const prefs = compacto ? [2, 1.7, 1.4, 1.2, 1, 0.85] : [2.8, 2.5, 2.2, 2, 1.8, 1.6, 1.4, 1.3]
  for (const m of prefs) {
    if (totalModulos * m + quiet <= availPx) return m
  }
  // Etiqueta muito estreita: melhor ajuste contínuo (cabe sem cortar).
  return Math.max(compacto ? 0.8 : 1, (availPx - quiet) / totalModulos)
}

function Barcode({ codigo, altura = 15, maxWidthMm, compacto }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const modulo = escolherModulo(codigo, maxWidthMm, compacto)
  const quiet = compacto ? 4 : 8

  useEffect(() => {
    if (!svgRef.current || !codigo) return
    let cancelled = false
    import('jsbarcode').then(mod => {
      if (!cancelled && svgRef.current) {
        try {
          mod.default(svgRef.current, codigo, {
            format: 'CODE128',
            width: modulo,
            height: Math.max(20, altura * MM_PX),
            displayValue: false,
            background: '#ffffff',
            lineColor: '#000000',
            margin: 0,
            marginTop: 0,
            marginBottom: 0,
            marginLeft: quiet,
            marginRight: quiet,
            flat: true,
          })
          svgRef.current!.style.setProperty('shape-rendering', 'crispEdges')
        } catch {}
      }
    })
    return () => { cancelled = true }
  }, [codigo, altura, modulo, quiet])

  return codigo ? <svg ref={svgRef} style={{ width: 'auto', maxWidth: '100%', height: `${altura}mm`, display: 'block', margin: '0 auto', padding: 0 }} /> : null
}

interface EtiquetaItemProps {
  p: any
  cfg: any
  campos: string[]
  mostrarBarra: boolean
  borda: any
  posicoes: any
  negritos: any
  tamanhoProd: number
  tamanhoCod: number
  tamanhoMarca: number
  tamanhoModelo: number
  tamanhoMarcaEtq: number
  alturaBarra: number
  etiquetasIndividuais: any
}

function EtiquetaItem({ p, cfg, campos, mostrarBarra, borda, posicoes, negritos, tamanhoProd, tamanhoCod, tamanhoMarca, tamanhoModelo, tamanhoMarcaEtq, alturaBarra, etiquetasIndividuais }: EtiquetaItemProps) {
  const custom = etiquetasIndividuais[p.uid]
  const camposAtivos = custom?.campos ?? campos
  const barcodeAtivo = custom?.mostrarBarra ?? mostrarBarra
  const bordaFinal = { ...borda, ...custom?.borda }
  const pos = { ...posicoes, ...custom?.posicoes }
  const neg = { ...negritos, ...custom?.negritos }
  const tProd = custom?.tamanhoProd ?? tamanhoProd
  const tCod = custom?.tamanhoCod ?? tamanhoCod
  const tMarca = custom?.tamanhoMarca ?? tamanhoMarca
  const tModelo = custom?.tamanhoModelo ?? tamanhoModelo
  const tMarcaEtq = custom?.tamanhoMarcaEtq ?? tamanhoMarcaEtq
  const h = custom?.alturaBarra ?? alturaBarra
  const barraLeft = pos.barra?.left ?? 1

  const textStyle = (posField: any, size: number, bold: boolean): React.CSSProperties => ({
    position: 'absolute',
    top: `${posField?.top ?? 0}mm`,
    left: `${posField?.left ?? 0}mm`,
    maxWidth: `${cfg.largura - (posField?.left ?? 0)}mm`,
    fontSize: `${size}mm`,
    fontWeight: bold ? 'bold' : 'normal',
    margin: 0,
    zIndex: 1,
    lineHeight: 1.3,
    letterSpacing: '0.02em',
    fontFamily: 'sans-serif',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  })

  return (
    <div
      className="etq-item"
      style={{
        width: `${cfg.largura}mm`, height: `${cfg.altura}mm`,
        position: 'relative', background: '#fff',
        border: bordaFinal.ativa ? `${bordaFinal.largura}mm ${bordaFinal.estilo} ${bordaFinal.cor}` : '0.05mm solid #e2e8f0',
        boxSizing: 'border-box', overflow: 'hidden',
      }}
    >
      {camposAtivos.includes('codigo') && <p style={textStyle(pos.codigo, tCod, neg.codigo)}>{p.codigo}</p>}
      {camposAtivos.includes('produto') && <p style={textStyle(pos.produto, tProd, neg.produto)}>{p.nome}</p>}
      {camposAtivos.includes('marca') && <p style={textStyle(pos.marca, tMarca, neg.marca)}>{p.marca}</p>}
      {camposAtivos.includes('modelo') && <p style={textStyle(pos.modelo, tModelo, neg.modelo)}>{p.modelo}</p>}
      {camposAtivos.includes('marcaEtiqueta') && p.marcaEtiqueta && <p style={textStyle(pos.marcaEtiqueta, tMarcaEtq, neg.marcaEtiqueta)}>{p.marcaEtiqueta}</p>}
      {barcodeAtivo && p.codigo && (() => {
        const dispMm = Math.max(5, cfg.largura - (barraLeft ?? 1) * 2)
        // Etiqueta estreita (<30mm, ex. 20x10): codifica só a parte numérica (única por produto)
        // para o CODE128 caber com barras legíveis. Busca por número continua funcionando.
        const compacto = dispMm < 30
        const conteudo = compacto ? (String(p.codigo).match(/^\d+/)?.[0] ?? p.codigo) : p.codigo
        return (
          <div className="barcode-wrap" style={{ position: 'absolute', top: `${pos.barra?.top ?? 60}mm`, left: `${barraLeft}mm`, width: `calc(100% - ${(barraLeft ?? 1) * 2}mm)`, lineHeight: 0, margin: 0, padding: 0, textAlign: 'center', zIndex: 0 }}>
            <Barcode codigo={conteudo} altura={h} maxWidthMm={dispMm} compacto={compacto} />
          </div>
        )
      })()}
    </div>
  )
}

interface EtiquetaPreviewProps {
  cfg: any
  colunas: number
  espacoH: number
  espacoV: number
  margemSup: number
  margemEsq: number
  margemDir: number
  margemInf: number
  pagina: number
  setPagina: (v: number | ((p: number) => number)) => void
  totalPaginas: number
  etqPorPagina: number
  papel: string
  zoom: number
  setZoom: (v: number | ((z: number) => number)) => void
  buscaPreview: string
  setBuscaPreview: (v: string) => void
  etiquetasPagina: any[]
  todasPaginas: any[]
  inicioLinha: number
  alinhamentoH: string
  alinhamentoV: string
  campos: string[]
  mostrarBarra: boolean
  borda: any
  posicoes: any
  negritos: any
  tamanhoProd: number
  tamanhoCod: number
  tamanhoMarca: number
  tamanhoModelo: number
  tamanhoMarcaEtq: number
  alturaBarra: number
  etiquetasIndividuais: any
  TAMANHO_PAPEL: any
}

export default function EtiquetaPreview({
  cfg, colunas, espacoH, espacoV, margemSup, margemEsq, margemDir, margemInf,
  pagina, setPagina, totalPaginas, papel, zoom, setZoom,
  buscaPreview, setBuscaPreview, etiquetasPagina, todasPaginas,
  inicioLinha, alinhamentoH, alinhamentoV, campos, mostrarBarra, borda,
  posicoes, negritos, tamanhoProd, tamanhoCod, tamanhoMarca, tamanhoModelo,
  tamanhoMarcaEtq, alturaBarra, etiquetasIndividuais, TAMANHO_PAPEL,
}: EtiquetaPreviewProps) {
  const emptyCells = (start: boolean) => start ? Array.from({ length: (inicioLinha - 1) * colunas }, (_, i) => i) : []
  const EmptyCell = ({ idx }: { idx: number }) => (
    <div key={`vazia-${idx}`} style={{ width: `${cfg.largura}mm`, height: `${cfg.altura}mm`, boxSizing: 'border-box' }} />
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-3 py-1.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setPagina((p: number) => Math.max(1, p - 1))} disabled={pagina <= 1}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 transition-all">◀</button>
            <span className="text-xs text-slate-700 min-w-[50px] text-center font-semibold">{pagina} / {totalPaginas}</span>
            <button onClick={() => setPagina((p: number) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 transition-all">▶</button>
          </div>
          <span className="text-xs text-slate-400">{TAMANHO_PAPEL[papel].nome} · {cfg.papelLargura}×{cfg.papelAltura}mm</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setZoom((z: number) => Math.max(0.3, z - 0.1))} className="p-1 hover:bg-white hover:shadow-sm rounded-md transition-all">−</button>
            <span className="text-[10px] text-slate-600 font-semibold min-w-[32px] text-center">{Math.round(100 * zoom)}%</span>
            <button onClick={() => setZoom((z: number) => Math.min(2, z + 0.1))} className="p-1 hover:bg-white hover:shadow-sm rounded-md transition-all">+</button>
          </div>
          <div className="relative">
            <input type="text" value={buscaPreview} onChange={e => setBuscaPreview(e.target.value)} placeholder="Buscar..."
              className="pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-400 outline-none transition-all w-40" />
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-auto bg-slate-200"
        style={{ backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
        <div className="flex justify-center py-8 min-h-full items-start">
          <div className="relative bg-white shadow-xl rounded-sm"
            style={{ width: `${cfg.papelLargura}mm`, minHeight: `${cfg.papelAltura}mm`, transform: `scale(${zoom})`, transformOrigin: 'top center', flexShrink: 0 }}>

            {/* Margin guides */}
            <div className="absolute -top-7 left-0 right-0 flex justify-between px-1">
              <span className="text-[9px] text-slate-400 font-medium">{margemEsq}mm</span>
              <span className="text-[9px] text-slate-400 font-medium">{TAMANHO_PAPEL[papel].nome} {cfg.papelLargura}×{cfg.papelAltura}mm</span>
              <span className="text-[9px] text-slate-400 font-medium">{margemDir}mm</span>
            </div>
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-medium">{margemSup}mm</div>
            <div className="absolute -right-10 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-medium">{margemInf}mm</div>

            {/* Grid */}
            <div style={{
              position: 'relative', height: `${cfg.papelAltura}mm`,
            }}>
              <div style={{
                display: 'grid', gridTemplateColumns: `repeat(${colunas}, ${cfg.largura}mm)`,
                gridAutoRows: `${cfg.altura}mm`,
                gap: `${espacoV}mm ${espacoH}mm`,
                padding: `${margemSup}mm ${margemDir}mm ${margemInf}mm ${margemEsq}mm`,
                boxSizing: 'border-box', width: `${cfg.papelLargura}mm`, height: `${cfg.papelAltura}mm`,
                margin: '0 auto',
                justifyContent: alinhamentoH === 'center' ? 'center' : alinhamentoH === 'right' ? 'end' : 'start',
                alignContent: alinhamentoV === 'center' ? 'center' : alinhamentoV === 'end' ? 'end' : 'start',
              }}>
                {emptyCells(pagina === 1).map(idx => <EmptyCell key={idx} idx={idx} />)}
                {etiquetasPagina.map((etq, i) => (
                  <EtiquetaItem key={etq.uid ?? i} p={etq} cfg={cfg} campos={campos} mostrarBarra={mostrarBarra}
                    borda={borda} posicoes={posicoes} negritos={negritos}
                    tamanhoProd={tamanhoProd} tamanhoCod={tamanhoCod} tamanhoMarca={tamanhoMarca}
                    tamanhoModelo={tamanhoModelo} tamanhoMarcaEtq={tamanhoMarcaEtq} alturaBarra={alturaBarra}
                    etiquetasIndividuais={etiquetasIndividuais} />
                ))}
                {etiquetasPagina.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                    <span className="text-xs font-medium">Nenhuma etiqueta para exibir</span>
                    <span className="text-[10px]">Selecione produtos no painel</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden print area */}
      <div id="area" className="hidden">
        {todasPaginas.map((pag, pgIdx) => (
          <div key={pgIdx} className="folha" style={{ width: `${cfg.papelLargura}mm`, minHeight: `${cfg.papelAltura}mm`, background: '#fff', margin: '0 auto', boxSizing: 'border-box', position: 'relative' }}>
            <div className="etq-grid" style={{
              display: 'grid', gridTemplateColumns: `repeat(${colunas}, ${cfg.largura}mm)`,
              gridAutoRows: `${cfg.altura}mm`,
              gap: `${espacoV}mm ${espacoH}mm`,
              padding: `${margemSup}mm ${margemDir}mm ${margemInf}mm ${margemEsq}mm`,
              boxSizing: 'border-box', width: `${cfg.papelLargura}mm`, height: `${cfg.papelAltura}mm`, margin: '0 auto',
              justifyContent: alinhamentoH === 'center' ? 'center' : alinhamentoH === 'right' ? 'end' : 'start',
              alignContent: alinhamentoV === 'center' ? 'center' : alinhamentoV === 'end' ? 'end' : 'start',
            }}>
              {emptyCells(pgIdx === 0).map(idx => <EmptyCell key={idx} idx={idx} />)}
              {pag.map((etq: any, i: number) => (
                <EtiquetaItem key={etq.uid ?? i} p={etq} cfg={cfg} campos={campos} mostrarBarra={mostrarBarra}
                  borda={borda} posicoes={posicoes} negritos={negritos}
                  tamanhoProd={tamanhoProd} tamanhoCod={tamanhoCod} tamanhoMarca={tamanhoMarca}
                  tamanhoModelo={tamanhoModelo} tamanhoMarcaEtq={tamanhoMarcaEtq} alturaBarra={alturaBarra}
                  etiquetasIndividuais={etiquetasIndividuais} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
