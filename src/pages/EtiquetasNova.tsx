import { useState, useEffect, useMemo, useCallback } from 'react'
import { Printer, Search, X, ChevronDown, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import Layout from '../components/Layout'
import { Vazio } from './shared'
import type { Produto } from '../lib/types'
import { api } from '../lib/api'
import { DEFAULT_LABEL_CONFIG, CAMPOS_ORDEM } from '../lib/labelCore/types'
import type { LabelConfig, CampoId } from '../lib/labelCore/types'
import { PRESETS } from '../lib/labelCore/presets'
import { calcBarcodeWidth, getBarcodeSvg, escHtml } from '../lib/labelCore/barcode'
import { openPrintWindow } from '../lib/printWindow'

function loadSaved(): LabelConfig | null {
  try { const a = localStorage.getItem('etq_nova_config'); return a ? JSON.parse(a) : null } catch { return null }
}

function Sec({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100">
      <button onClick={onToggle} className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        <span>{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}
function Field({ label, value, onChange, min, step, unit }: { label: string; value: number | string; onChange: (v: string) => void; min?: number; step?: number; unit?: string }) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium text-slate-500">{label}{unit && <span className="text-slate-400"> ({unit})</span>}</label>
      <input type="number" value={String(value)} min={min} step={step} onChange={e => onChange(e.target.value)} className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none bg-white" />
    </div>
  )
}

function BarcodePreview({ value, config }: { value: string; config: LabelConfig }) {
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const w = config.barcode.largura || calcBarcodeWidth(value, config.etiqueta.largura, config.barcode.left)
    const h = Math.round(config.barcode.altura * 4.8)
    node.innerHTML = getBarcodeSvg(value, w, h)
  }, [value, config])
  return <div ref={ref} style={{ width: '100%', height: '100%', background: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
}

export default function EtiquetasNova() {
  const saved = loadSaved()
  const [config, setConfig] = useState<LabelConfig>(saved ?? DEFAULT_LABEL_CONFIG)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [quantidades, setQuantidades] = useState<Record<number, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pagina, setPagina] = useState(1)
  const [mostrarModal, setMostrarModal] = useState(false)
  const [buscaProd, setBuscaProd] = useState('')
  const [secoes, setSecoes] = useState<Record<string, boolean>>({ presets: true, papel: true, etiqueta: true, layout: true, campos: true, barcode: true, borda: false })
  const toggleSec = useCallback((k: string) => setSecoes(p => ({ ...p, [k]: !p[k] })), [])
  const [copiado, setCopiado] = useState<string | null>(null)

  useEffect(() => { api.produtos.list().then(p => { setProdutos(p); setCarregando(false) }).catch(() => setCarregando(false)) }, [])
  useEffect(() => { localStorage.setItem('etq_nova_config', JSON.stringify(config)) }, [config])
  const updateConfig = (patch: Partial<LabelConfig>) => setConfig(c => ({ ...c, ...patch }))
  const updateCampo = (id: CampoId, patch: Partial<LabelConfig['campos'][CampoId]>) =>
    setConfig(c => ({ ...c, campos: { ...c.campos, [id]: { ...c.campos[id], ...patch } } }))
  const updateBarcode = (patch: Partial<LabelConfig['barcode']>) =>
    setConfig(c => ({ ...c, barcode: { ...c.barcode, ...patch } }))

  const listaEtq = useMemo(() => {
    const lista: Array<Produto & { uid: number }> = []
    let uid = 0
    selecionados.forEach(id => {
      const prod = produtos.find(p => p.id === id)
      if (prod) { const qtd = quantidades[id] || 1; for (let i = 0; i < qtd; i++) lista.push({ ...prod, uid: uid++ }) }
    })
    return lista
  }, [selecionados, produtos, quantidades])

  const { capTotal, capPrimeira, skipCells } = useMemo(() => {
    const areaUtil = config.papel.altura - config.layout.margemSup - config.layout.margemInf
    const linhas = Math.max(1, Math.floor(areaUtil / (config.etiqueta.altura + config.layout.espacoV)))
    const total = linhas * config.layout.colunas
    const skip = Math.max(0, Math.min(total - 1, (config.layout.inicioLinha - 1) * config.layout.colunas))
    return { capTotal: total, capPrimeira: Math.max(1, total - skip), skipCells: skip }
  }, [config])
  const totalPaginas = useMemo(() => {
    if (listaEtq.length === 0) return 1
    if (listaEtq.length <= capPrimeira) return 1
    return 1 + Math.ceil((listaEtq.length - capPrimeira) / capTotal)
  }, [listaEtq.length, capPrimeira, capTotal])
  const etiquetasPagina = useMemo(() => {
    let slice = pagina === 1 ? listaEtq.slice(0, capPrimeira) : listaEtq.slice(capPrimeira + (pagina - 2) * capTotal, capPrimeira + (pagina - 2) * capTotal + capTotal)
    if (!busca.trim()) return slice
    const q = busca.toLowerCase()
    return slice.filter(p => (p.nome?.toLowerCase() || '').includes(q) || (p.codigo?.toLowerCase() || '').includes(q))
  }, [listaEtq, pagina, capPrimeira, capTotal, busca])

  const aplicarPreset = (preset: typeof PRESETS[number]) => {
    setConfig(c => ({ ...c, ...preset.config } as LabelConfig))
    setCopiado(preset.nome); setTimeout(() => setCopiado(null), 1500)
  }
  const resetar = () => {
    if (!confirm('Resetar tudo para padrão de fábrica?')) return
    localStorage.removeItem('etq_nova_config')
    setConfig(DEFAULT_LABEL_CONFIG)
    setSelecionados([]); setQuantidades({}); setPagina(1)
  }

  const handlePrint = () => {
    if (listaEtq.length === 0) return
    const bordaCss = config.borda.ativa ? `${config.borda.largura}mm ${config.borda.estilo} ${config.borda.cor}` : '1px solid transparent'
    const todasPaginas: string[] = []
    for (let i = 0; i < totalPaginas; i++) {
      const pageNum = i + 1
      const pagEtq = pageNum === 1 ? listaEtq.slice(0, capPrimeira) : listaEtq.slice(capPrimeira + (pageNum - 2) * capTotal, capPrimeira + (pageNum - 2) * capTotal + capTotal)
      const vazias = pageNum === 1 ? Array.from({ length: skipCells }, () => `<div style="width:${config.etiqueta.largura}mm;height:${config.etiqueta.altura}mm;box-sizing:border-box;border:1px solid transparent;background:transparent;"></div>`).join('') : ''
      const is2510 = config.etiqueta.largura === 25 && config.etiqueta.altura === 10
      const htmlEtqs = pagEtq.map(etq => {
        if (is2510) {
          const w = config.barcode.largura || calcBarcodeWidth(etq.codigo, 25, config.barcode.left)
          return `<div style="width:25mm;height:10mm;background:#fff;border:0.3mm solid #ccc;border-radius:0.5mm;padding:0.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;overflow:hidden;">
            <div style="font-size:1.8mm;color:#8B0000;font-weight:bold;text-align:center;line-height:1.2;width:100%;">
              <div style="font-size:2mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(etq.nome || '')}</div>
              <div style="font-size:1.7mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(`${etq.marca || ''} ${etq.modelo || ''}`.trim())}</div>
            </div>
            ${config.barcode.ativo ? `<div style="margin-top:0.3mm;display:flex;align-items:flex-end;height:4mm;justify-content:center;width:100%;background:#fff;">${getBarcodeSvg(etq.codigo, w, 19)}</div>` : ''}
          </div>`
        }
        const camposHtml = CAMPOS_ORDEM.filter(id => config.campos[id].ativo).map(id => {
          const c = config.campos[id]
          const valor = id === 'codigo' ? etq.codigo : id === 'produto' ? etq.nome : id === 'marca' ? (etq.marca || '—') : id === 'modelo' ? (etq.modelo || '—') : (etq.categoria_nome || '—')
          return `<p style="position:absolute;top:${c.top}mm;left:${c.left}mm;font-size:${c.fontSize}mm;font-weight:${c.bold ? 'bold' : 'normal'};color:${c.color};text-align:${c.align};z-index:2;margin:0;padding:0;line-height:1.3;font-family:sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(valor || '')}</p>`
        }).join('')
        const barcodeHtml = config.barcode.ativo ? `<div style="position:absolute;top:${config.barcode.top}mm;left:${config.barcode.left}mm;right:${config.barcode.right}mm;height:${config.barcode.altura}mm;overflow:hidden;display:flex;align-items:center;justify-content:center;z-index:0;background:#fff;">${getBarcodeSvg(etq.codigo, config.barcode.largura || calcBarcodeWidth(etq.codigo, config.etiqueta.largura, config.barcode.left), Math.round(config.barcode.altura * 4.8))}</div>` : ''
        return `<div style="width:${config.etiqueta.largura}mm;height:${config.etiqueta.altura}mm;position:relative;background:#fff;border:${bordaCss};${config.borda.radius ? `border-radius:${config.borda.radius}mm;` : ''}box-sizing:border-box;overflow:hidden;">${barcodeHtml}${camposHtml}</div>`
      }).join('')
      todasPaginas.push(`<div class="folha"><div class="grid" style="display:grid;grid-template-columns:repeat(${config.layout.colunas},${config.etiqueta.largura}mm);gap:${config.layout.espacoV}mm ${config.layout.espacoH}mm;padding:${config.layout.margemSup}mm ${config.layout.margemDir}mm ${config.layout.margemInf}mm ${config.layout.margemEsq}mm;box-sizing:border-box;width:${config.papel.largura}mm;height:${config.papel.altura}mm;margin:0 auto;justify-content:${config.layout.alinhamentoH === 'center' ? 'center' : config.layout.alinhamentoH === 'right' ? 'end' : 'start'};align-content:${config.layout.alinhamentoV === 'center' ? 'center' : config.layout.alinhamentoV === 'end' ? 'end' : 'start'};">${vazias}${htmlEtqs}</div></div>`)
    }
    const css = `@page{margin:0;size:A4 portrait}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{margin:0;padding:0;background:#fff;font-family:sans-serif}.folha{page-break-after:always;position:relative;background:#fff}.folha:last-child{page-break-after:auto}svg{background:#fff !important;shape-rendering:crispEdges}`
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${todasPaginas.join('')}</body></html>`
    openPrintWindow(html, `Etiquetas - ${listaEtq.length} etiquetas`)
  }

  const filtrados = useMemo(() => {
    if (!buscaProd.trim()) return produtos
    const q = buscaProd.toLowerCase()
    return produtos.filter(p => (p.nome?.toLowerCase() || '').includes(q) || (p.codigo?.toLowerCase() || '').includes(q))
  }, [produtos, buscaProd])

  return (
    <Layout title="Etiquetas — Novo Sistema" subtitle="Sistema refeito do zero — configuração completa de campos">
      <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
        {carregando && <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 text-sm">Carregando produtos...</div>}
        <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center"><Printer size={16} className="text-white" /></div>
            <div><h1 className="text-sm font-bold text-slate-800">Etiquetas — Novo Sistema</h1><p className="text-[11px] text-slate-500">{listaEtq.length} etiquetas · {totalPaginas} pág · {config.etiqueta.largura}×{config.etiqueta.altura}mm</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700"><Printer size={15} /> Imprimir</button>
            <button onClick={resetar} className="p-2 text-slate-400 hover:text-red-600" title="Resetar"><RotateCcw size={16} /></button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-80 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <Sec title="Presets" open={secoes.presets} onToggle={() => toggleSec('presets')}>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESETS.map(pr => (
                    <button key={pr.nome} onClick={() => aplicarPreset(pr)} className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-[10px] hover:border-blue-400 hover:bg-blue-50 ${copiado === pr.nome ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
                      <span className="text-base">{pr.icone}</span><span className="font-medium">{pr.nome}</span>
                    </button>
                  ))}
                </div>
              </Sec>

              <Sec title="Papel" open={secoes.papel} onToggle={() => toggleSec('papel')}>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-center">
                  <div className="text-[11px] font-bold text-blue-700">📄 Folha A4</div><div className="text-[9px] text-blue-600">210 × 297 mm</div>
                </div>
              </Sec>

              <Sec title="Etiqueta" open={secoes.etiqueta} onToggle={() => toggleSec('etiqueta')}>
                <div className="grid grid-cols-2 gap-1.5">
                  <Field label="Largura" value={config.etiqueta.largura} onChange={v => updateConfig({ etiqueta: { ...config.etiqueta, largura: Number(v) } })} unit="mm" />
                  <Field label="Altura" value={config.etiqueta.altura} onChange={v => updateConfig({ etiqueta: { ...config.etiqueta, altura: Number(v) } })} unit="mm" />
                </div>
              </Sec>

              <Sec title="Layout" open={secoes.layout} onToggle={() => toggleSec('layout')}>
                <div className="grid grid-cols-2 gap-1.5">
                  <Field label="Colunas" value={config.layout.colunas} onChange={v => updateConfig({ layout: { ...config.layout, colunas: Math.max(1, Number(v)) } })} min={1} />
                  <Field label="Início" value={config.layout.inicioLinha} onChange={v => updateConfig({ layout: { ...config.layout, inicioLinha: Math.max(1, Number(v)) } })} min={1} />
                  <Field label="Espaço H" value={config.layout.espacoH} onChange={v => updateConfig({ layout: { ...config.layout, espacoH: Number(v) } })} unit="mm" />
                  <Field label="Espaço V" value={config.layout.espacoV} onChange={v => updateConfig({ layout: { ...config.layout, espacoV: Number(v) } })} unit="mm" />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <Field label="Sup" value={config.layout.margemSup} onChange={v => updateConfig({ layout: { ...config.layout, margemSup: Number(v) } })} unit="mm" />
                  <Field label="Esq" value={config.layout.margemEsq} onChange={v => updateConfig({ layout: { ...config.layout, margemEsq: Number(v) } })} unit="mm" />
                  <Field label="Dir" value={config.layout.margemDir} onChange={v => updateConfig({ layout: { ...config.layout, margemDir: Number(v) } })} unit="mm" />
                  <Field label="Inf" value={config.layout.margemInf} onChange={v => updateConfig({ layout: { ...config.layout, margemInf: Number(v) } })} unit="mm" />
                </div>
              </Sec>

              <Sec title="Campos" open={secoes.campos} onToggle={() => toggleSec('campos')}>
                {CAMPOS_ORDEM.map(id => {
                  const c = config.campos[id]
                  return (
                    <div key={id} className="border rounded-lg p-2 bg-slate-50">
                      <label className="flex items-center gap-2 mb-1">
                        <input type="checkbox" checked={c.ativo} onChange={e => updateCampo(id, { ativo: e.target.checked })} className="rounded w-3.5 h-3.5" />
                        <span className="text-xs font-bold capitalize">{c.label}</span>
                      </label>
                      {c.ativo && (
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-2 gap-1">
                            <Field label="Top" value={c.top} onChange={v => updateCampo(id, { top: Number(v) })} step={0.5} unit="mm" />
                            <Field label="Left" value={c.left} onChange={v => updateCampo(id, { left: Number(v) })} step={0.5} unit="mm" />
                            <Field label="Fonte" value={c.fontSize} onChange={v => updateCampo(id, { fontSize: Number(v) })} step={0.1} unit="mm" />
                            <label className="flex items-center gap-1 text-[10px]"><input type="checkbox" checked={c.bold} onChange={e => updateCampo(id, { bold: e.target.checked })} /> Negrito</label>
                          </div>
                          <div className="flex gap-1">
                            <input type="color" value={c.color} onChange={e => updateCampo(id, { color: e.target.value })} className="w-6 h-6 rounded border" />
                            <select value={c.align} onChange={e => updateCampo(id, { align: e.target.value as any })} className="text-[10px] border rounded px-1 flex-1">
                              <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </Sec>

              <Sec title="Barcode" open={secoes.barcode} onToggle={() => toggleSec('barcode')}>
                <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={config.barcode.ativo} onChange={e => updateBarcode({ ativo: e.target.checked })} className="rounded w-3.5 h-3.5" /><span className="text-xs font-bold">Ativar Barcode</span></label>
                {config.barcode.ativo && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-1">
                      <Field label="Top" value={config.barcode.top} onChange={v => updateBarcode({ top: Number(v) })} step={0.5} unit="mm" />
                      <Field label="Left" value={config.barcode.left} onChange={v => updateBarcode({ left: Number(v) })} step={0.5} unit="mm" />
                      <Field label="Altura" value={config.barcode.altura} onChange={v => updateBarcode({ altura: Number(v) })} step={1} unit="mm" />
                      <Field label="Largura" value={config.barcode.largura} onChange={v => updateBarcode({ largura: Number(v) })} step={0.2} unit="mm" />
                    </div>
                    <div className="text-[9px] text-slate-400">Largura 0 = auto por etiqueta (1.0-2.6). Altura só altura, largura só largura.</div>
                  </div>
                )}
              </Sec>

              <Sec title="Borda" open={secoes.borda} onToggle={() => toggleSec('borda')}>
                <label className="flex items-center gap-2"><input type="checkbox" checked={config.borda.ativa} onChange={e => updateConfig({ borda: { ...config.borda, ativa: e.target.checked } })} className="rounded w-3.5 h-3.5" /><span className="text-xs">Borda</span></label>
                {config.borda.ativa && (
                  <div className="grid grid-cols-2 gap-1">
                    <Field label="Espessura" value={config.borda.largura} onChange={v => updateConfig({ borda: { ...config.borda, largura: Number(v) } })} step={0.1} unit="mm" />
                    <input type="color" value={config.borda.cor} onChange={e => updateConfig({ borda: { ...config.borda, cor: e.target.value } })} className="w-full h-6 rounded border" />
                  </div>
                )}
              </Sec>

              <Sec title="Produtos" open={true} onToggle={() => {}}>
                <div className="text-[10px] text-slate-500 mb-1">{selecionados.length} selecionados</div>
                <button onClick={() => setMostrarModal(true)} className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-[11px] font-medium text-blue-700 hover:bg-blue-100">Selecionar Produtos</button>
              </Sec>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">Preview</span>
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1">
                  <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="text-slate-500 hover:text-slate-700"><ZoomOut size={14} /></button>
                  <span className="text-[10px] w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="text-slate-500 hover:text-slate-700"><ZoomIn size={14} /></button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={busca} onChange={e => { setBusca(e.target.value); setPagina(1) }} placeholder="Filtrar..." className="pl-7 pr-6 py-1 rounded-lg border border-slate-200 text-[11px] w-36 focus:border-blue-400 focus:outline-none" />
                  {busca && <button onClick={() => setBusca('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400"><X size={12} /></button>}
                </div>
                <span className="text-[10px] text-slate-400">{pagina}/{totalPaginas}</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-100 p-4 flex justify-center">
              {listaEtq.length === 0 ? <div className="flex items-center justify-center h-full"><Vazio texto="Selecione produtos" /></div> : (
                <div style={{ width: config.papel.largura * 96 / 25.4 * zoom, height: config.papel.altura * 96 / 25.4 * zoom, flexShrink: 0 }}>
                  <div style={{ width: config.papel.largura + 'mm', height: config.papel.altura + 'mm', padding: `${config.layout.margemSup}mm ${config.layout.margemDir}mm ${config.layout.margemInf}mm ${config.layout.margemEsq}mm`, transform: `scale(${zoom})`, transformOrigin: 'top left', boxSizing: 'border-box', background: '#fff' }} className="shadow-lg relative">
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${config.layout.colunas}, ${config.etiqueta.largura}mm)`, gap: `${config.layout.espacoV}mm ${config.layout.espacoH}mm`, justifyContent: config.layout.alinhamentoH === 'center' ? 'center' : config.layout.alinhamentoH === 'right' ? 'end' : 'start', alignContent: config.layout.alinhamentoV === 'center' ? 'center' : config.layout.alinhamentoV === 'end' ? 'end' : 'start' }}>
                      {pagina === 1 && Array.from({ length: skipCells }).map((_, i) => (
                        <div key={`vazia-${i}`} style={{ width: config.etiqueta.largura + 'mm', height: config.etiqueta.altura + 'mm', border: '1px dashed #e2e8f0', background: 'repeating-linear-gradient(45deg, #f8fafc, #f8fafc 4px, #f1f5f9 4px, #f1f5f9 8px)', opacity: 0.6 }} />
                      ))}
                      {etiquetasPagina.map(etq => {
                        const is2510 = config.etiqueta.largura === 25 && config.etiqueta.altura === 10
                        const bordaCss = config.borda.ativa ? `${config.borda.largura}mm ${config.borda.estilo} ${config.borda.cor}` : '1px solid transparent'
                        if (is2510) {
                          return (
                            <div key={etq.uid} style={{ width: '25mm', height: '10mm', background: '#fff', border: '0.3mm solid #ccc', borderRadius: '0.5mm', padding: '0.5mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', overflow: 'hidden' }}>
                              <div style={{ fontSize: '1.8mm', color: '#8B0000', fontWeight: 'bold', textAlign: 'center', lineHeight: 1.2, width: '100%' }}>
                                <div style={{ fontSize: '2mm', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{etq.nome}</div>
                                <div style={{ fontSize: '1.7mm', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${etq.marca || ''} ${etq.modelo || ''}`.trim()}</div>
                              </div>
                              {config.barcode.ativo && <div style={{ marginTop: '0.3mm', height: '4mm', width: '100%', display: 'flex', justifyContent: 'center' }}><BarcodePreview value={etq.codigo} config={config} /></div>}
                            </div>
                          )
                        }
                        return (
                          <div key={etq.uid} style={{ width: config.etiqueta.largura + 'mm', height: config.etiqueta.altura + 'mm', position: 'relative', background: '#fff', border: bordaCss, borderRadius: config.borda.radius ? `${config.borda.radius}mm` : undefined, boxSizing: 'border-box', overflow: 'hidden' }}>
                            {config.barcode.ativo && (
                              <div style={{ position: 'absolute', top: config.barcode.top + 'mm', left: config.barcode.left + 'mm', right: config.barcode.right + 'mm', height: config.barcode.altura + 'mm', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#fff', zIndex: 0 }}>
                                <BarcodePreview value={etq.codigo} config={config} />
                              </div>
                            )}
                            {CAMPOS_ORDEM.filter(id => config.campos[id].ativo).map(id => {
                              const c = config.campos[id]
                              const valor = id === 'codigo' ? etq.codigo : id === 'produto' ? etq.nome : id === 'marca' ? (etq.marca || '—') : id === 'modelo' ? (etq.modelo || '—') : (etq.categoria_nome || '—')
                              return <p key={id} style={{ position: 'absolute', top: c.top + 'mm', left: c.left + 'mm', fontSize: c.fontSize + 'mm', fontWeight: c.bold ? 'bold' : 'normal', color: c.color, textAlign: c.align as any, zIndex: 2, margin: 0, padding: 0, lineHeight: 1.3, fontFamily: 'sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valor}</p>
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {totalPaginas > 1 && (
              <div className="bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-center gap-3">
                <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1} className="px-3 py-1 rounded border text-[11px] disabled:opacity-40">Anterior</button>
                <span className="text-[11px]">Página {pagina} de {totalPaginas}</span>
                <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas} className="px-3 py-1 rounded border text-[11px] disabled:opacity-40">Próxima</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mostrarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMostrarModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div><h2 className="text-sm font-bold">Selecionar Produtos</h2><p className="text-[10px] text-slate-500">{selecionados.length} selecionados</p></div>
              <button onClick={() => setMostrarModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-3 py-2 border-b">
              <div className="relative"><Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" /><input value={buscaProd} onChange={e => setBuscaProd(e.target.value)} placeholder="Buscar..." className="w-full pl-7 pr-3 py-1.5 rounded-lg border text-xs focus:border-blue-400 focus:outline-none" /></div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filtrados.map(pr => (
                <label key={pr.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${selecionados.includes(pr.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={selecionados.includes(pr.id)} onChange={() => {
                    setSelecionados(p => {
                      const next = p.includes(pr.id) ? p.filter(x => x !== pr.id) : [...p, pr.id]
                      if (!p.includes(pr.id)) setQuantidades(q => ({ ...q, [pr.id]: q[pr.id] || 1 }))
                      else setQuantidades(q => { const n = { ...q }; delete n[pr.id]; return n })
                      return next
                    })
                  }} className="rounded w-4 h-4" />
                  <div className="flex-1 min-w-0"><div className="text-xs font-medium truncate">{pr.nome}</div><div className="text-[10px] text-slate-500">{pr.codigo} {pr.marca ? `· ${pr.marca}` : ''}</div></div>
                  <input type="number" min={1} value={quantidades[pr.id] ?? 1} onClick={e => e.stopPropagation()} onChange={e => setQuantidades(q => ({ ...q, [pr.id]: Math.max(1, parseInt(e.target.value) || 1) }))} className="w-14 rounded border px-1.5 py-0.5 text-right text-[11px]" />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-[10px] text-slate-500">{selecionados.length} selecionados</span>
              <button onClick={() => setMostrarModal(false)} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
