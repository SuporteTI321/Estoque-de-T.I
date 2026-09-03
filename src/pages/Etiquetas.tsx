import { useState, useEffect, useMemo, useCallback } from 'react'
import { Printer, Settings, Search, X, ChevronDown, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import Layout from '../components/Layout'
import { Vazio } from './shared'
import type { Produto } from '../lib/types'
import { api } from '../lib/api'
import JsBarcode from 'jsbarcode'

// ============================================================
//  CONSTANTS
// ============================================================

const TAMANHO_PAPEL: Record<string, { nome: string; largura: number; altura: number }> = {
  a4: { nome: 'A4', largura: 210, altura: 297 },
  letter: { nome: 'Carta', largura: 216, altura: 279 },
  rollo: { nome: 'Rolo', largura: 80, altura: 297 },
}

const TAMANHO_ETIQUETA: Record<string, { largura: number; altura: number }> = {
  pequeno: { largura: 50, altura: 25 },
  medio: { largura: 70, altura: 35 },
  grande: { largura: 100, altura: 50 },
  custom: { largura: 50, altura: 25 },
}

const PRESETS = [
  { nome: 'Etiqueta Padrão', icone: '📦', formato: 'medio', papel: 'a4', colunas: 3, margemSup: 5, margemEsq: 5, margemDir: 5, margemInf: 5, espacoH: 0, espacoV: 0, campos: ['codigo', 'produto', 'marca', 'modelo'], mostrarBarra: false, borda: { ativa: false, estilo: 'dashed' as const, largura: 0.2, cor: '#ccc' }, posicoes: { codigo: { top: 2, left: 1 }, produto: { top: 6, left: 1 }, marca: { top: 14, left: 1 }, modelo: { top: 18, left: 1 }, barra: { top: 60, left: 1 } }, negritos: { codigo: false, produto: true, marca: false, modelo: false }, tamanhos: { codigo: 2.1, produto: 2.8, marca: 1.8, modelo: 1.4, alturaBarra: 10 } },
  { nome: 'Com Código de Barras', icone: '📊', formato: 'medio', papel: 'a4', colunas: 2, margemSup: 5, margemEsq: 8, margemDir: 8, margemInf: 5, espacoH: 5, espacoV: 3, campos: ['codigo', 'produto', 'marca', 'modelo'], mostrarBarra: true, borda: { ativa: true, estilo: 'solid' as const, largura: 0.2, cor: '#333' }, posicoes: { codigo: { top: 2, left: 1 }, produto: { top: 5, left: 1 }, marca: { top: 10, left: 1 }, modelo: { top: 14, left: 1 }, barra: { top: 20, left: 1 } }, negritos: { codigo: true, produto: true, marca: false, modelo: false }, tamanhos: { codigo: 2.5, produto: 2.8, marca: 1.8, modelo: 1.4, alturaBarra: 8 } },
  { nome: 'Etiqueta Grande', icone: '🏷️', formato: 'grande', papel: 'a4', colunas: 2, margemSup: 8, margemEsq: 8, margemDir: 8, margemInf: 8, espacoH: 5, espacoV: 5, campos: ['codigo', 'produto', 'marca', 'modelo'], mostrarBarra: true, borda: { ativa: true, estilo: 'dashed' as const, largura: 0.2, cor: '#666' }, posicoes: { codigo: { top: 3, left: 2 }, produto: { top: 8, left: 2 }, marca: { top: 18, left: 2 }, modelo: { top: 24, left: 2 }, barra: { top: 35, left: 2 } }, negritos: { codigo: false, produto: true, marca: false, modelo: false }, tamanhos: { codigo: 2.8, produto: 4.2, marca: 2.5, modelo: 2.1, alturaBarra: 12 } },
  { nome: 'Rolo Térmico', icone: '🧾', formato: 'medio', papel: 'rollo', colunas: 1, margemSup: 2, margemEsq: 2, margemDir: 2, margemInf: 2, espacoH: 0, espacoV: 0, campos: ['codigo', 'produto', 'marca', 'modelo'], mostrarBarra: true, borda: { ativa: false, estilo: 'solid' as const, largura: 0.2, cor: '#ccc' }, posicoes: { codigo: { top: 2, left: 1 }, produto: { top: 6, left: 1 }, marca: { top: 12, left: 1 }, modelo: { top: 16, left: 1 }, barra: { top: 22, left: 1 } }, negritos: { codigo: false, produto: true, marca: false, modelo: false }, tamanhos: { codigo: 2.1, produto: 2.8, marca: 1.8, modelo: 1.4, alturaBarra: 10 } },
]

// ============================================================
//  HELPERS
// ============================================================

function loadAutosave() {
  try { const a = localStorage.getItem('etq_autosave'); return a ? JSON.parse(a) : null } catch { return null }
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getBarcodeSvg(value: string, width: number = 2.0): string {
  try {
    const svgNs = 'http://www.w3.org/2000/svg'
    const el = document.createElementNS(svgNs, 'svg')
    JsBarcode(el, value, { format: 'CODE128', width, height: 44, fontSize: 10, displayValue: false, background: '#FFFFFF', lineColor: '#000000', margin: 0, flat: true, textMargin: 0 })
    el.setAttribute('style', 'display:block;width:100%;height:100%;background:#FFFFFF;shape-rendering:crispEdges;image-rendering:crisp-edges;padding:0;margin:0')
    el.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    // força fundo branco em todos os rects
    el.style.backgroundColor = '#FFFFFF'
    return el.outerHTML
  } catch {
    return `<span style="font-family:monospace;font-size:8px">${escHtml(value)}</span>`
  }
}

// ============================================================
//  SUB-COMPONENTS
// ============================================================

/** Componente seguro para barcode SVG — preto 100% + fundo branco 100% para leitura */
function BarcodeSvg({ value }: { value: string }) {
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    node.innerHTML = '';
    try {
      const svgNs = 'http://www.w3.org/2000/svg'
      const el = document.createElementNS(svgNs, 'svg')
      JsBarcode(el, value, { format: 'CODE128', width: 2.0, height: 44, fontSize: 10, displayValue: false, background: '#FFFFFF', lineColor: '#000000', margin: 0, flat: true, textMargin: 0 })
      el.setAttribute('style', 'display:block;width:100%;height:100%;background:#FFFFFF;shape-rendering:crispEdges;image-rendering:crisp-edges;padding:0;margin:0')
      el.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      el.style.backgroundColor = '#FFFFFF'
      node.appendChild(el)
    } catch {
      const span = document.createElement('span')
      span.style.fontFamily = 'monospace'
      span.style.fontSize = '8px'
      span.textContent = value
      node.appendChild(span)
    }
  }, [value])
  return <div ref={ref} style={{ width: '100%', height: '100%', backgroundColor: '#FFFFFF' }} />
}

function Sec({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        <span>{title}</span>
        {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

function Field({ label, value, onChange, type = 'number', min, step, unit }: { label: string; value: number | string; onChange: (v: string) => void; type?: string; min?: number; step?: number; unit?: string }) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium text-slate-500">{label}{unit && <span className="text-slate-400"> ({unit})</span>}</label>
      <input type={type} value={String(value)} min={min} step={step} onChange={e => onChange(e.target.value)} className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none bg-white" />
    </div>
  )
}

// ============================================================
//  PRODUTO MODAL
// ============================================================

function ProdutoModal({ open, onClose, produtos, selecionados, setSelecionados, quantidades, setQuantidades }: {
  open: boolean; onClose: () => void; produtos: Produto[]; selecionados: number[]; setSelecionados: (v: number[] | ((p: number[]) => number[])) => void
  quantidades: Record<number, number>; setQuantidades: (v: Record<number, number> | ((p: Record<number, number>) => Record<number, number>)) => void
}) {
  const [busca, setBusca] = useState('')
  const filtrados = useMemo(() => {
    if (!busca.trim()) return produtos
    const q = busca.toLowerCase()
    return produtos.filter(p => (p.nome?.toLowerCase() || '').includes(q) || (p.codigo?.toLowerCase() || '').includes(q))
  }, [produtos, busca])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Selecionar Produtos</h2>
            <p className="text-[10px] text-slate-500">{selecionados.length} selecionados</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-blue-400 focus:outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtrados.map(pr => (
            <label key={pr.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${selecionados.includes(pr.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={selecionados.includes(pr.id)} onChange={() => {
                setSelecionados(p => {
                  const next = p.includes(pr.id) ? p.filter(x => x !== pr.id) : [...p, pr.id]
                  if (!p.includes(pr.id)) setQuantidades(q => ({ ...q, [pr.id]: q[pr.id] || 1 }))
                  else setQuantidades(q => { const n = { ...q }; delete n[pr.id]; return n })
                  return next
                })
              }} className="rounded w-4 h-4 text-blue-600" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-800 truncate">{pr.nome}</div>
                <div className="text-[10px] text-slate-500">{pr.codigo} {pr.marca ? `· ${pr.marca}` : ''}</div>
              </div>
              <input type="number" min={1} value={quantidades[pr.id] ?? 1} onClick={e => e.stopPropagation()}
                onChange={e => setQuantidades(q => ({ ...q, [pr.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-right text-[11px] focus:border-blue-400 focus:outline-none" />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <span className="text-[10px] text-slate-500">{selecionados.length} selecionados</span>
          <button onClick={onClose} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Confirmar</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
//  MAIN PAGE
// ============================================================

export default function Etiquetas() {
  const saved = loadAutosave()

  // ---- State ----
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [quantidades, setQuantidades] = useState<Record<number, number>>({})

  const [papel, setPapel] = useState(saved?.papel ?? 'a4')
  const [formato, setFormato] = useState(saved?.formato ?? 'medio')
  const [largura, setLargura] = useState(saved?.largura ?? 70)
  const [altura, setAltura] = useState(saved?.altura ?? 35)
  const [margemSup, setMargemSup] = useState(saved?.margemSup ?? 5)
  const [margemEsq, setMargemEsq] = useState(saved?.margemEsq ?? 5)
  const [margemDir, setMargemDir] = useState(saved?.margemDir ?? 5)
  const [margemInf, setMargemInf] = useState(saved?.margemInf ?? 5)
  const [colunas, setColunas] = useState(saved?.colunas ?? 3)
  const [espacoH, setEspacoH] = useState(saved?.espacoH ?? 0)
  const [espacoV, setEspacoV] = useState(saved?.espacoV ?? 0)
  const [inicioLinha, setInicioLinha] = useState(saved?.inicioLinha ?? 1)

  const [campos, setCampos] = useState<string[]>(saved?.campos ?? ['codigo', 'produto', 'marca', 'modelo'])
  const [mostrarBarra, setMostrarBarra] = useState(saved?.mostrarBarra ?? false)
  const [borda, setBorda] = useState(saved?.borda ?? { ativa: false, estilo: 'dashed' as const, largura: 0.2, cor: '#ccc' })

  const [tamanhoProd, setTamanhoProd] = useState(saved?.tamanhoProd ?? 2.8)
  const [tamanhoCod, setTamanhoCod] = useState(saved?.tamanhoCod ?? 2.1)
  const [tamanhoMarca, setTamanhoMarca] = useState(saved?.tamanhoMarca ?? 1.8)
  const [tamanhoModelo, setTamanhoModelo] = useState(saved?.tamanhoModelo ?? 1.4)
  const [alturaBarra, setAlturaBarra] = useState(saved?.alturaBarra ?? 10)

  const [posicoes, setPosicoes] = useState(saved?.posicoes ?? {
    codigo: { top: 2, left: 1 }, produto: { top: 6, left: 1 }, marca: { top: 14, left: 1 },
    modelo: { top: 18, left: 1 }, barra: { top: 60, left: 1 },
  })
  const [negritos, setNegritos] = useState(saved?.negritos ?? {
    codigo: false, produto: true, marca: false, modelo: false,
  })
  const [alinhamentoH, setAlinhamentoH] = useState(saved?.alinhamentoH ?? 'center')
  const [alinhamentoV, setAlinhamentoV] = useState(saved?.alinhamentoV ?? 'start')
  const [pagina, setPagina] = useState(1)
  const [folhaUnica, setFolhaUnica] = useState(saved?.folhaUnica ?? true)
  const [etiquetasIndividuais, setEtiquetasIndividuais] = useState<Record<number, any>>({})

  const [carregando, setCarregando] = useState(true)
  const [buscaPreview, setBuscaPreview] = useState('')
  const [zoom, setZoom] = useState(1)
  const [mostrarModalProdutos, setMostrarModalProdutos] = useState(false)
  const [mostrarConfig, setMostrarConfig] = useState(true)
  const [copiadoPreset, setCopiadoPreset] = useState<string | null>(null)

  const [secoesAbertas, setSecoesAbertas] = useState<Record<string, boolean>>({
    presets: true, papelFormato: true, layout: true, campos: true, posicoes: false, tamanhos: false,
  })
  const toggleSecao = useCallback((key: string) => setSecoesAbertas(p => ({ ...p, [key]: !p[key] })), [])

  // ---- Autosave ----
  useEffect(() => {
    if (carregando) return
    const t = setTimeout(() => {
      localStorage.setItem('etq_autosave', JSON.stringify({
        papel, formato, largura, altura, margemSup, margemEsq, margemDir, margemInf,
        colunas, espacoH, espacoV, inicioLinha, campos, mostrarBarra, borda,
        tamanhoProd, tamanhoCod, tamanhoMarca, tamanhoModelo, alturaBarra,
        posicoes, negritos, alinhamentoH, alinhamentoV, folhaUnica, etiquetasIndividuais,
      }))
    }, 300)
    return () => clearTimeout(t)
  }, [papel, formato, largura, altura, margemSup, margemEsq, margemDir, margemInf,
    colunas, espacoH, espacoV, inicioLinha, campos, mostrarBarra, borda,
    tamanhoProd, tamanhoCod, tamanhoMarca, tamanhoModelo, alturaBarra,
    posicoes, negritos, alinhamentoH, alinhamentoV, folhaUnica, carregando, etiquetasIndividuais])

  // ---- Load data ----
  useEffect(() => {
    api.produtos.list().then(p => { setProdutos(p); setCarregando(false) }).catch(() => setCarregando(false))
  }, [])

  // ---- Derived ----
  const cfg = useMemo(() => {
    const base = formato === 'custom' ? { largura, altura } : (TAMANHO_ETIQUETA[formato] || TAMANHO_ETIQUETA.medio)
    const papelCfg = TAMANHO_PAPEL[papel]
    return { ...base, papelLargura: papelCfg.largura, papelAltura: papelCfg.altura }
  }, [formato, largura, altura, papel])

  const listaEtq = useMemo(() => {
    const lista: Array<Produto & { uid: number; idx: number }> = []
    let uid = 0
    selecionados.forEach(id => {
      const prod = produtos.find(p => p.id === id)
      if (prod) {
        const qtd = quantidades[id] || 1
        for (let i = 0; i < qtd; i++) lista.push({ ...prod, uid: uid++, idx: i })
      }
    })
    return lista
  }, [selecionados, produtos, quantidades])

  const etqPorPagina = useMemo(() => {
    if (papel === 'rollo') return 1
    const areaUtil = cfg.papelAltura - margemSup - margemInf
    const linhas = Math.floor(areaUtil / (cfg.altura + espacoV))
    return Math.max(1, linhas * colunas - (inicioLinha - 1) * colunas)
  }, [papel, cfg, margemSup, margemInf, espacoV, colunas, inicioLinha])

  const totalPaginas = Math.max(1, Math.ceil(listaEtq.length / etqPorPagina))

  const etiquetasPagina = useMemo(() => {
    const slice = listaEtq.slice((pagina - 1) * etqPorPagina, pagina * etqPorPagina)
    if (!buscaPreview.trim()) return slice
    const q = buscaPreview.toLowerCase()
    return slice.filter(p => (p.nome?.toLowerCase() || '').includes(q) || (p.codigo?.toLowerCase() || '').includes(q))
  }, [listaEtq, pagina, etqPorPagina, buscaPreview])

  const toggleCampo = (c: string) => setCampos(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])

  // ---- Preset ----
  const aplicarPreset = (preset: typeof PRESETS[number]) => {
    setFormato(preset.formato); setPapel(preset.papel); setColunas(preset.colunas)
    setMargemSup(preset.margemSup); setMargemEsq(preset.margemEsq); setMargemDir(preset.margemDir); setMargemInf(preset.margemInf)
    setEspacoH(preset.espacoH); setEspacoV(preset.espacoV); setCampos([...preset.campos])
    setMostrarBarra(preset.mostrarBarra); setBorda({ ...preset.borda }); setPosicoes({ ...preset.posicoes })
    setNegritos({ ...preset.negritos }); setTamanhoProd(preset.tamanhos.produto); setTamanhoCod(preset.tamanhos.codigo)
    setTamanhoMarca(preset.tamanhos.marca); setTamanhoModelo(preset.tamanhos.modelo); setAlturaBarra(preset.tamanhos.alturaBarra)
    setCopiadoPreset(preset.nome); setTimeout(() => setCopiadoPreset(null), 1500)
  }

  // ---- Limpar ----
  const limpar = () => {
    setSelecionados([]); setQuantidades({})
    setFormato('medio'); setLargura(70); setAltura(35); setMargemSup(5); setMargemEsq(5); setMargemDir(5); setMargemInf(5)
    setColunas(3); setEspacoH(0); setEspacoV(0); setInicioLinha(1); setCampos(['codigo', 'produto', 'marca', 'modelo'])
    setMostrarBarra(false); setBorda({ ativa: false, estilo: 'dashed', largura: 0.2, cor: '#ccc' })
    setTamanhoProd(2.8); setTamanhoCod(2.1); setTamanhoMarca(1.8); setTamanhoModelo(1.4); setAlturaBarra(10)
    setPosicoes({ codigo: { top: 2, left: 1 }, produto: { top: 6, left: 1 }, marca: { top: 14, left: 1 }, modelo: { top: 18, left: 1 }, barra: { top: 60, left: 1 } })
    setNegritos({ codigo: false, produto: true, marca: false, modelo: false })
    setAlinhamentoH('center'); setAlinhamentoV('start'); setEtiquetasIndividuais({})
  }

  // ---- Print ----
  const handlePrint = () => {
    if (listaEtq.length === 0) return
    const pageSize = papel === 'rollo' ? `${cfg.largura}mm ${cfg.altura}mm` : papel === 'letter' ? 'letter portrait' : 'A4 portrait'
    const bordaPrint = borda.ativa ? `${borda.largura}mm ${borda.estilo} ${borda.cor}` : '0.5px solid #e2e8f0'

    // Gera todas as páginas
    const todasPaginasPrint: string[] = []
    for (let i = 0; i < totalPaginas; i++) {
      const pagEtq = listaEtq.slice(i * etqPorPagina, (i + 1) * etqPorPagina)
      const etiquetasHtml = pagEtq.map(etq => {
        const etqConfig = etiquetasIndividuais[etq.uid] || {}
        const tProd = etqConfig.tamanhoProd ?? tamanhoProd
        const tCod = etqConfig.tamanhoCod ?? tamanhoCod
        const tMarca = etqConfig.tamanhoMarca ?? tamanhoMarca
        const tModelo = etqConfig.tamanhoModelo ?? tamanhoModelo
        const pos = etqConfig.posicoes ?? posicoes
        const neg = etqConfig.negritos ?? negritos
        return `<div class="etq-item">
          ${mostrarBarra ? `<div style="position:absolute;top:${pos.barra?.top}mm;left:${pos.barra?.left}mm;right:1mm;height:${alturaBarra}mm;overflow:hidden;display:flex;align-items:center;z-index:0;background:#FFFFFF">${getBarcodeSvg(etq.codigo)}</div>` : ''}
          ${campos.includes('codigo') ? `<p style="position:absolute;top:${pos.codigo?.top}mm;left:${pos.codigo?.left}mm;font-size:${tCod}mm;font-weight:${neg.codigo ? 'bold' : 'normal'};z-index:2;background:transparent">${escHtml(etq.codigo)}</p>` : ''}
          ${campos.includes('produto') ? `<p style="position:absolute;top:${pos.produto?.top}mm;left:${pos.produto?.left}mm;font-size:${tProd}mm;font-weight:${neg.produto ? 'bold' : 'normal'};z-index:2;background:transparent">${escHtml(etq.nome || '')}</p>` : ''}
          ${campos.includes('marca') ? `<p style="position:absolute;top:${pos.marca?.top}mm;left:${pos.marca?.left}mm;font-size:${tMarca}mm;font-weight:${neg.marca ? 'bold' : 'normal'};z-index:2;background:transparent">${escHtml(etq.marca || '—')}</p>` : ''}
          ${campos.includes('modelo') ? `<p style="position:absolute;top:${pos.modelo?.top}mm;left:${pos.modelo?.left}mm;font-size:${tModelo}mm;font-weight:${neg.modelo ? 'bold' : 'normal'};z-index:2;background:transparent">${escHtml(etq.modelo || '—')}</p>` : ''}
        </div>`
      }).join('')

      todasPaginasPrint.push(
        `<div class="folha"><div class="etq-grid">${etiquetasHtml}</div></div>`
      )
    }

    const css = `
      @page{margin:0;size:${pageSize}}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
      svg{background:#FFFFFF !important;shape-rendering:crispEdges;image-rendering:crisp-edges;image-rendering:-webkit-optimize-contrast}
      svg rect[fill=\"#FFFFFF\"], svg rect[fill=\"white\"]{fill:#FFFFFF !important}
      svg rect[fill=\"#000000\"], svg rect[fill=\"#000\"], svg g rect{fill:#000000 !important;stroke:none !important}
      svg path{stroke:#000000 !important}
      body{margin:0;padding:0}
      .folha{page-break-after:${folhaUnica ? 'always' : 'auto'};position:relative;background:#fff}
      .folha:last-child{page-break-after:auto}
      .etq-grid{display:grid;grid-template-columns:repeat(${colunas},${cfg.largura}mm);gap:${espacoV}mm ${espacoH}mm;
        padding:${papel === 'rollo' ? '0' : `${margemSup}mm ${margemDir}mm ${margemInf}mm ${margemEsq}mm`};
        box-sizing:border-box;width:${cfg.papelLargura}mm;height:${cfg.papelAltura}mm;margin:0 auto;
        justify-content:${alinhamentoH === 'center' ? 'center' : alinhamentoH === 'right' ? 'end' : 'start'};
        align-content:${alinhamentoV === 'center' ? 'center' : alinhamentoV === 'end' ? 'end' : 'start'}}
      .etq-item{width:${cfg.largura}mm;height:${cfg.altura}mm;position:relative;background:#fff;border:${bordaPrint};box-sizing:border-box;overflow:hidden}
      .etq-item p{margin:0;padding:0;line-height:1.3;font-family:sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:absolute;z-index:2}
      .etq-item svg{display:block;width:100%;height:100%;background:#FFFFFF !important}
      .etq-item > div[style*="z-index:0"]{z-index:0 !important}
    `
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${todasPaginasPrint.join('\n')}</body></html>`
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;border:none;z-index:999999;background:#fff'
    document.body.appendChild(iframe)
    const d = iframe.contentWindow?.document
    if (d) { d.open(); d.write(fullHtml); d.close() }
    const w = iframe.contentWindow
    const doPrint = () => { w?.focus(); w?.print(); setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe) }, 500) }
    if (d?.readyState === 'complete') setTimeout(doPrint, 300)
    else { iframe.onload = () => setTimeout(doPrint, 300) }
  }

  // ============================================================
  //  RENDER
  // ============================================================

  return (
    <Layout title="Etiquetas" subtitle="Impressão de etiquetas de produtos">
      <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
        {carregando && <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 text-sm">Carregando produtos...</div>}

        {/* HEADER */}
        <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center"><Printer size={16} className="text-white" /></div>
            <div><h1 className="text-sm font-bold text-slate-800">Impressão de Etiquetas</h1><p className="text-[11px] text-slate-500">{listaEtq.length} etiquetas · {totalPaginas} pág · {cfg.largura}×{cfg.altura}mm</p></div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-slate-100 border border-slate-200">
              <input type="checkbox" checked={folhaUnica} onChange={e => setFolhaUnica(e.target.checked)} className="rounded w-3.5 h-3.5 text-blue-600" />
              <span className="font-medium">1 página</span>
            </label>
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-lg font-medium text-sm hover:from-rose-700 hover:to-pink-700 shadow-sm">
              <Printer size={15} /> Imprimir
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* SIDEBAR CONFIG */}
          {mostrarConfig && (
            <div className="w-80 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
              <div className="px-3 py-2 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Layout da folha</span>
                  <span className="text-[9px] text-slate-400 font-medium">{TAMANHO_PAPEL[papel].nome} · {colunas} col · {etqPorPagina} etq/pág</span>
                </div>
                {/* Mini preview */}
                <div className="flex justify-center">
                  <div className="relative bg-white rounded shadow-sm border border-slate-200 overflow-hidden" style={{ width: 120, height: 80 }}>
                    <div className="absolute inset-0 flex flex-wrap gap-[1px] p-1" style={{ alignContent: 'start' }}>
                      {Array.from({ length: Math.min(etqPorPagina, colunas * 4) }, (_, i) => (
                        <div key={i} className="bg-blue-50/60 border border-blue-200/40 rounded-sm" style={{ width: Math.min(20, (120 - 8) / colunas), height: 10 }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {/* Presets */}
                <Sec title="Presets" open={secoesAbertas.presets} onToggle={() => toggleSecao('presets')}>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRESETS.map(pr => (
                      <button key={pr.nome} onClick={() => aplicarPreset(pr)} className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-[10px] hover:border-blue-400 hover:bg-blue-50 ${copiadoPreset === pr.nome ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200'}`}>
                        <span className="text-base">{pr.icone}</span>
                        <span className="font-medium text-slate-700">{pr.nome}</span>
                      </button>
                    ))}
                  </div>
                </Sec>

                {/* Papel e Formato */}
                <Sec title="Papel e Formato" open={secoesAbertas.papelFormato} onToggle={() => toggleSecao('papelFormato')}>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(TAMANHO_PAPEL).map(([k, v]) => (
                      <button key={k} onClick={() => setPapel(k)} className={`rounded-lg border px-2 py-1.5 text-[10px] font-medium ${papel === k ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {v.nome} <span className="text-[8px] text-slate-400 block">{v.largura}x{v.altura}</span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(TAMANHO_ETIQUETA).filter(([k]) => k !== 'custom').map(([k, v]) => (
                      <button key={k} onClick={() => { setFormato(k); setLargura(v.largura); setAltura(v.altura) }} className={`rounded-lg border px-2 py-1.5 text-[10px] font-medium ${formato === k ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {k} <span className="text-[8px] text-slate-400 block">{v.largura}x{v.altura}mm</span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Field label="Largura" value={largura} onChange={v => { setFormato('custom'); setLargura(Number(v)) }} unit="mm" />
                    <Field label="Altura" value={altura} onChange={v => { setFormato('custom'); setAltura(Number(v)) }} unit="mm" />
                  </div>
                </Sec>

                {/* Layout */}
                <Sec title="Layout" open={secoesAbertas.layout} onToggle={() => toggleSecao('layout')}>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Field label="Colunas" value={colunas} onChange={v => setColunas(Math.max(1, Number(v)))} min={1} step={1} />
                    <Field label="Início" value={inicioLinha} onChange={v => setInicioLinha(Math.max(1, Number(v)))} min={1} step={1} />
                    <Field label="Espaço H" value={espacoH} onChange={v => setEspacoH(Number(v))} unit="mm" />
                    <Field label="Espaço V" value={espacoV} onChange={v => setEspacoV(Number(v))} unit="mm" />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <Field label="Sup" value={margemSup} onChange={v => setMargemSup(Number(v))} unit="mm" />
                    <Field label="Esq" value={margemEsq} onChange={v => setMargemEsq(Number(v))} unit="mm" />
                    <Field label="Dir" value={margemDir} onChange={v => setMargemDir(Number(v))} unit="mm" />
                    <Field label="Inf" value={margemInf} onChange={v => setMargemInf(Number(v))} unit="mm" />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="text-[10px] font-medium text-slate-500">Alinh. H</label>
                      <div className="flex gap-1 mt-0.5">
                        {(['left', 'center', 'right'] as const).map(a => (
                          <button key={a} onClick={() => setAlinhamentoH(a)} className={`flex-1 rounded border px-1 py-0.5 text-[10px] ${alinhamentoH === a ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
                            {a === 'left' ? '←' : a === 'center' ? '↔' : '→'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-slate-500">Alinh. V</label>
                      <div className="flex gap-1 mt-0.5">
                        {(['start', 'center', 'end'] as const).map(a => (
                          <button key={a} onClick={() => setAlinhamentoV(a)} className={`flex-1 rounded border px-1 py-0.5 text-[10px] ${alinhamentoV === a ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
                            {a === 'start' ? '↑' : a === 'center' ? '↕' : '↓'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Sec>

                {/* Produtos */}
                <Sec title="Produtos" open={true} onToggle={() => {}}>
                  <div className="text-[10px] text-slate-500 mb-1">{selecionados.length} produto(s) selecionados</div>
                  <button onClick={() => setMostrarModalProdutos(true)} className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-[11px] font-medium text-blue-700 hover:bg-blue-100">
                    Selecionar Produtos
                  </button>
                </Sec>

                {/* Campos */}
                <Sec title="Campos" open={secoesAbertas.campos} onToggle={() => toggleSecao('campos')}>
                  {['codigo', 'produto', 'marca', 'modelo'].map(c => (
                    <label key={c} className="flex items-center gap-2 py-0.5">
                      <input type="checkbox" checked={campos.includes(c)} onChange={() => toggleCampo(c)} className="rounded w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs text-slate-700">{c}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 py-0.5">
                    <input type="checkbox" checked={mostrarBarra} onChange={() => setMostrarBarra(!mostrarBarra)} className="rounded w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs text-slate-700">Barcode</span>
                  </label>
                </Sec>

                {/* Posições */}
                <Sec title="Posições" open={secoesAbertas.posicoes} onToggle={() => toggleSecao('posicoes')}>
                  {campos.map(c => (
                    <div key={c} className="mb-2">
                      <div className="text-[10px] font-semibold text-slate-600 mb-1 capitalize">{c}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Field label="Top" value={posicoes[c]?.top ?? 0} onChange={v => setPosicoes((p: typeof posicoes) => ({ ...p, [c]: { ...p[c], top: Number(v) } }))} step={0.5} unit="mm" />
                        <Field label="Left" value={posicoes[c]?.left ?? 0} onChange={v => setPosicoes((p: typeof posicoes) => ({ ...p, [c]: { ...p[c], left: Number(v) } }))} step={0.5} unit="mm" />
                      </div>
                    </div>
                  ))}
                  <div className="mb-1">
                    <div className="text-[10px] font-semibold text-slate-600 mb-1">Barcode</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Field label="Top" value={posicoes.barra?.top ?? 0} onChange={v => setPosicoes((p: typeof posicoes) => ({ ...p, barra: { ...p.barra, top: Number(v) } }))} step={0.5} unit="mm" />
                      <Field label="Left" value={posicoes.barra?.left ?? 0} onChange={v => setPosicoes((p: typeof posicoes) => ({ ...p, barra: { ...p.barra, left: Number(v) } }))} step={0.5} unit="mm" />
                    </div>
                  </div>
                </Sec>

                {/* Tamanhos */}
                <Sec title="Tamanhos" open={secoesAbertas.tamanhos} onToggle={() => toggleSecao('tamanhos')}>
                  <Field label="Produto" value={tamanhoProd} onChange={v => setTamanhoProd(Number(v))} step={0.1} unit="mm" />
                  <Field label="Código" value={tamanhoCod} onChange={v => setTamanhoCod(Number(v))} step={0.1} unit="mm" />
                  <Field label="Marca" value={tamanhoMarca} onChange={v => setTamanhoMarca(Number(v))} step={0.1} unit="mm" />
                  <Field label="Modelo" value={tamanhoModelo} onChange={v => setTamanhoModelo(Number(v))} step={0.1} unit="mm" />
                  <Field label="Barcode Altura" value={alturaBarra} onChange={v => setAlturaBarra(Number(v))} step={1} unit="mm" />
                </Sec>
              </div>
              <div className="border-t border-slate-200 px-3 py-1 flex items-center justify-between">
                <button onClick={limpar} className="text-[9px] text-slate-400 hover:text-slate-600">Limpar tudo</button>
                <button onClick={() => setMostrarConfig(false)} className="text-[9px] text-slate-400 hover:text-slate-600">Ocultar</button>
              </div>
            </div>
          )}

          {!mostrarConfig && (
            <button onClick={() => setMostrarConfig(true)} className="fixed right-4 top-24 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg hover:scale-110 z-50">
              <Settings size={20} />
            </button>
          )}

          {/* PRODUTO MODAL */}
          {mostrarModalProdutos && (
            <ProdutoModal open={mostrarModalProdutos} onClose={() => setMostrarModalProdutos(false)} produtos={produtos} selecionados={selecionados} setSelecionados={setSelecionados} quantidades={quantidades} setQuantidades={setQuantidades} />
          )}

          {/* PREVIEW */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-700">Preview</span>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1">
                  <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="text-slate-500 hover:text-slate-700"><ZoomOut size={14} /></button>
                  <span className="text-[10px] text-slate-500 w-10 text-center font-medium">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="text-slate-500 hover:text-slate-700"><ZoomIn size={14} /></button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={buscaPreview} onChange={e => { setBuscaPreview(e.target.value); setPagina(1) }} placeholder="Filtrar..." className="pl-7 pr-6 py-1 rounded-lg border border-slate-200 text-[11px] w-36 focus:border-blue-400 focus:outline-none" />
                  {buscaPreview && <button onClick={() => setBuscaPreview('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={12} /></button>}
                </div>
                <span className="text-[10px] text-slate-400">{pagina}/{totalPaginas}</span>
              </div>
            </div>

            {/* Área de preview */}
            <div className="flex-1 overflow-auto bg-slate-100 p-4 flex justify-center">
              {listaEtq.length === 0 ? (
                <div className="flex items-center justify-center h-full"><Vazio texto="Selecione produtos para visualizar" /></div>
              ) : (
                <div style={{ width: cfg.papelLargura * 96 / 25.4 * zoom, height: cfg.papelAltura * 96 / 25.4 * zoom, flexShrink: 0 }}>
                  <div id="area-impressao" className="relative bg-white shadow-lg rounded-sm" style={{
                    width: cfg.papelLargura + 'mm', height: cfg.papelAltura + 'mm',
                    padding: papel === 'rollo' ? '0' : `${margemSup}mm ${margemDir}mm ${margemInf}mm ${margemEsq}mm`,
                    transform: `scale(${zoom})`, transformOrigin: 'top left', boxSizing: 'border-box'
                  }}>
                    <div className="absolute inset-0 border border-slate-200 pointer-events-none" />
                    <div style={{
                      display: 'grid', gridTemplateColumns: `repeat(${colunas}, ${cfg.largura}mm)`,
                      gap: `${espacoV}mm ${espacoH}mm`, alignContent: 'start',
                      justifyItems: alinhamentoH === 'center' ? 'center' : alinhamentoH === 'right' ? 'end' : 'start',
                      justifyContent: 'start'
                    }}>
                      {etiquetasPagina.map(etq => {
                        const etqConfig = etiquetasIndividuais[etq.uid] || {}
                        const tProd = etqConfig.tamanhoProd ?? tamanhoProd
                        const tCod = etqConfig.tamanhoCod ?? tamanhoCod
                        const tMarca = etqConfig.tamanhoMarca ?? tamanhoMarca
                        const tModelo = etqConfig.tamanhoModelo ?? tamanhoModelo
                        const pos = etqConfig.posicoes ?? posicoes
                        const neg = etqConfig.negritos ?? negritos
                        const bordaPrint = borda.ativa ? `${borda.largura}mm ${borda.estilo} ${borda.cor}` : '0.5px solid #e2e8f0'

                        return (
                          <div key={etq.uid} style={{ width: cfg.largura + 'mm', height: cfg.altura + 'mm', position: 'relative', background: '#fff', border: bordaPrint, boxSizing: 'border-box', overflow: 'hidden' }}>
                            {mostrarBarra && (
                              <div style={{ position: 'absolute', top: pos.barra?.top + 'mm', left: pos.barra?.left + 'mm', right: '1mm', height: alturaBarra + 'mm', overflow: 'hidden', display: 'flex', alignItems: 'center', zIndex: 0, background: '#FFFFFF' }}>
                                <BarcodeSvg value={etq.codigo} />
                              </div>
                            )}
                            {campos.includes('codigo') && (
                              <p style={{ position: 'absolute', top: pos.codigo?.top + 'mm', left: pos.codigo?.left + 'mm', fontSize: tCod + 'mm', fontWeight: neg.codigo ? 'bold' : 'normal', zIndex: 2 }}>{escHtml(etq.codigo)}</p>
                            )}
                            {campos.includes('produto') && (
                              <p style={{ position: 'absolute', top: pos.produto?.top + 'mm', left: pos.produto?.left + 'mm', fontSize: tProd + 'mm', fontWeight: neg.produto ? 'bold' : 'normal', zIndex: 2 }}>{escHtml(etq.nome || '')}</p>
                            )}
                            {campos.includes('marca') && (
                              <p style={{ position: 'absolute', top: pos.marca?.top + 'mm', left: pos.marca?.left + 'mm', fontSize: tMarca + 'mm', fontWeight: neg.marca ? 'bold' : 'normal', zIndex: 2 }}>{escHtml(etq.marca || '—')}</p>
                            )}
                            {campos.includes('modelo') && (
                              <p style={{ position: 'absolute', top: pos.modelo?.top + 'mm', left: pos.modelo?.left + 'mm', fontSize: tModelo + 'mm', fontWeight: neg.modelo ? 'bold' : 'normal', zIndex: 2 }}>{escHtml(etq.modelo || '—')}</p>
                            )}
                            <div className="absolute top-0 right-0 bg-blue-600 text-white text-[7px] px-1 py-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">#{etq.uid + 1}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-center gap-3">
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} className="px-3 py-1 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">Anterior</button>
                <span className="text-[11px] text-slate-500">Página {pagina} de {totalPaginas}</span>
                <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} className="px-3 py-1 rounded border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">Próxima</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
